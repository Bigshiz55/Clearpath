import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { isAdminEmail } from '@/lib/admin';
import { assertSameProject, sanitizeDbUrl, validateDbUrl } from '@/lib/adminMigrateUrl';
import { runProbes, type ReconcileResult } from '@/lib/migrationReconcile';
import { recordReliabilityEvent } from '@/lib/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * THE ONE-CLICK DRY RECONCILIATION — session-authorized, structurally read-only.
 *
 * A deliberately separate route from /api/admin/reconcile-migrations, which
 * keeps its secret-bearer path and its ability to backfill. This one:
 *
 *   - authorizes ONLY from the signed-in Supabase session + ADMIN_EMAILS,
 *   - never accepts a dryRun parameter, and
 *   - contains no write path at all. There is no INSERT, UPDATE or DDL in this
 *     file beyond nothing — the backfill code is simply not reachable from
 *     here, so "incapable of writing" is a property of the module rather than
 *     a flag someone could flip.
 *
 * The browser never sees MIGRATE_SECRET, the service-role key or the database
 * password: the connection is assembled server-side from environment config
 * and never returned in the response.
 */

// Per-admin rate limit. In-memory is adequate: this is a human-triggered
// diagnostic, and a cold lambda simply starts the window fresh.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

/** Same-origin check — this route is only ever called by our own admin page. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // ── CSRF ─────────────────────────────────────────────────────────────────
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not accepted.' }, { status: 403 });
  }

  // ── Authorize from the session only ──────────────────────────────────────
  let email: string | null = null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email ?? null;
    // Anonymous (or no session at all) -> 401, distinct from "signed in but
    // not an admin", which is 403.
    if (!user || !email) {
      return NextResponse.json({ error: 'Sign in to run this check.' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Sign in to run this check.' }, { status: 401 });
  }

  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'This account is not authorized to run migration checks.' }, { status: 403 });
  }

  if (rateLimited(email)) {
    return NextResponse.json({ error: 'Too many checks. Wait a minute and try again.' }, { status: 429 });
  }

  // ── Connect using server-side config only ────────────────────────────────
  const raw = serverEnv.migrationsDbUrl();
  if (!raw) {
    return NextResponse.json(
      {
        code: 'db_url_missing',
        error: 'The database connection is not configured on the server (SUPABASE_DB_URL).',
      },
      { status: 503 },
    );
  }
  const dbUrl = sanitizeDbUrl(raw);
  const validation = validateDbUrl(dbUrl);
  if (!validation.ok) {
    /* THE REASON, NOT JUST "NOT USABLE". This returned a single generic string
       for every shape of failure, and the button then replaced even that with
       "no database connection configured" — so a malformed URL and a missing
       variable were indistinguishable from the admin page, which sent the
       investigation in the wrong direction entirely.
       Never echo the URL — only the structural reason it is unusable. */
    return NextResponse.json(
      { code: 'db_url_invalid', error: `The server database URL is not usable: ${validation.reason}` },
      { status: 503 },
    );
  }

  /* THE SAME GUARD THE MIGRATE ROUTE USES — shared, not a second copy that can
     drift. A read-only ledger check against the wrong project would report a
     schema that has nothing to do with this application. */
  const identity = assertSameProject(process.env.NEXT_PUBLIC_SUPABASE_URL, dbUrl);
  if (!identity.ok) {
    return NextResponse.json({ code: identity.code, error: identity.reason }, { status: 503 });
  }

  let client: Client;
  try {
    client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
  } catch {
    return NextResponse.json({ error: 'Could not connect to the database.' }, { status: 502 });
  }

  let results: ReconcileResult[] = [];
  try {
    // READ-ONLY probes. No LEDGER_DDL, no advisory lock, no writes: this route
    // only observes, so it cannot block a real migration run either. Shared
    // with the backfilling route via runProbes so the two can never disagree
    // about what the database says; `backfilled` comes back false regardless,
    // because runProbes has no write path of its own.
    results = await runProbes(async (sql) => {
      try {
        const { rows } = await client.query<{ exists: boolean }>(sql);
        return Boolean(rows[0]?.exists);
      } catch {
        return null;
      }
    });
  } finally {
    await client.end().catch(() => {});
  }

  // ── Audit ────────────────────────────────────────────────────────────────
  // Who ran it, when, and what came back. The email is the admin's own and is
  // the point of the record; no other personal data is logged.
  void recordReliabilityEvent('api_failure', {
    action: 'reconcile_dry_run',
    admin: email.slice(0, 80),
    proven: results.filter((r) => r.classification === 'PROVEN_APPLIED').length,
    notApplied: results.filter((r) => r.classification === 'PROVEN_NOT_APPLIED').length,
    blocked: results.filter((r) => r.classification === 'BLOCKED_PREREQUISITE_MISSING').length,
    unknown: results.filter((r) => r.classification === 'UNKNOWN').length,
  });

  return NextResponse.json({
    ok: true,
    dryRun: true,
    ranAt: new Date().toISOString(),
    ranBy: email,
    note: 'Read-only. Nothing was written to the ledger. This route has no write path.',
    results,
  });
}
