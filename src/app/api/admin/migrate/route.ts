import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { PENDING_MIGRATIONS } from '@/lib/pendingMigrations';
import { sanitizeDbUrl, validateDbUrl } from '@/lib/adminMigrateUrl';

// A raw Postgres connection needs real TCP/TLS sockets (`net`/`tls`), which
// the Edge runtime does not provide — `pg` would fail to even load there.
// Explicit so this can never silently end up on Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface MigrationResult {
  name: string;
  ok: boolean;
  error?: string;
  code?: string;
}

/** A safe, structured summary of a thrown value: the message and, for a
 *  pg/network error, its `.code` (e.g. `ENOTFOUND`, `28P01`, `ECONNREFUSED`)
 *  — never the connection string or any other secret. */
function describeError(e: unknown): { error: string; code?: string } {
  if (e instanceof Error) {
    const code = (e as NodeJS.ErrnoException).code;
    return { error: e.message, code: typeof code === 'string' ? code : undefined };
  }
  return { error: 'Unknown error.' };
}

/**
 * Admin-gated migration runner. Applies a FIXED, embedded set of idempotent
 * migrations (never arbitrary SQL, so it can't be abused) to the Postgres
 * connection in `SUPABASE_DB_URL`. Each migration runs in its own transaction,
 * so one failure (e.g. a missing prerequisite) doesn't block the others.
 *
 * Authorized by EITHER a signed-in admin (ADMIN_EMAILS) OR a bearer token
 * matching `MIGRATE_SECRET`. Dormant (503) until the DB URL is configured.
 *
 * RESTORED, byte-for-byte from its last-known-good version (the parent of
 * the commit that removed it), after being deleted in favor of an automatic
 * `npm run migrate && next build` step — which broke five consecutive
 * production deploys and was reverted, leaving no way at all (automatic or
 * manual) to apply anything registered in pendingMigrations.ts after that
 * point. This route is a plain request-time API route, never invoked from
 * the build command, so it is not implicated in that build failure; see
 * `revert(build): remove migration step from build pipeline` for the
 * original diagnosis.
 */
export async function POST(request: Request) {
  // ── Authorize ────────────────────────────────────────────────────────────
  let authorized = false;
  const secret = serverEnv.migrateSecret();
  const auth = request.headers.get('authorization') ?? '';
  if (secret && auth === `Bearer ${secret}`) authorized = true;
  if (!authorized) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const admins = serverEnv.adminEmails();
      if (user?.email && admins.includes(user.email.toLowerCase())) authorized = true;
    } catch {
      /* not signed in */
    }
  }
  // A secret passed in the JSON body also authorizes (so the /migrate page can
  // send it without a custom header).
  let body: { dbUrl?: string; secret?: string } = {};
  try { body = (await request.json()) as typeof body; } catch { /* no body */ }
  if (!authorized && secret && body.secret === secret) authorized = true;
  if (!authorized) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  // Connection string from the request (one-time, gated by the secret) or env.
  // Sanitized before use — a wrapping quote or trailing newline from a
  // copy-paste is the single most common reason this fails, and previously
  // surfaced as the exact same opaque "Invalid URL" as a genuinely wrong
  // connection string, with no way to tell the two apart.
  const rawDbUrl = typeof body.dbUrl === 'string' && body.dbUrl.trim() ? body.dbUrl : serverEnv.migrationsDbUrl();
  if (!rawDbUrl) {
    return NextResponse.json(
      { error: 'No database URL. Paste your Supabase connection string (Settings → Database → Connection string, "URI"), or set SUPABASE_DB_URL in your env.' },
      { status: 503 },
    );
  }
  const dbUrl = sanitizeDbUrl(rawDbUrl);
  const validation = validateDbUrl(dbUrl);
  if (!validation.ok) {
    return NextResponse.json(
      {
        stage: 'validate',
        error: `The database URL is not usable: ${validation.reason}`,
      },
      { status: 400 },
    );
  }

  // Everything below is wrapped so an unanticipated failure still reaches the
  // client as a real JSON error instead of a bare, bodyless 500 — the exact
  // failure mode this whole block exists to rule out.
  try {
    // The `Client` constructor itself can throw synchronously (a malformed
    // connection string, for one) — that's a connect-stage failure exactly
    // like a refused/unreachable connection, so it's caught the same way,
    // distinguishable from a migration's own SQL failing.
    let client: Client;
    try {
      client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
    } catch (e) {
      const { error, code } = describeError(e);
      return NextResponse.json(
        { stage: 'connect', error: `Could not connect to the database: ${error}`, code },
        { status: 502 },
      );
    }

    const results: MigrationResult[] = [];
    try {
      for (const m of PENDING_MIGRATIONS) {
        const sql = Buffer.from(m.sqlB64, 'base64').toString('utf8');
        try {
          await client.query('begin');
          await client.query(sql);
          await client.query('commit');
          results.push({ name: m.name, ok: true });
        } catch (e) {
          try { await client.query('rollback'); } catch { /* ignore */ }
          const { error, code } = describeError(e);
          results.push({ name: m.name, ok: false, error, code });
        }
      }
      // Supabase's hosted PostgREST normally auto-reloads on DDL via its own
      // event trigger, but that trigger can be missing or lag on some
      // projects — the exact "Could not find the table ... in the schema
      // cache" failure mode this migrate flow exists to fix. An explicit
      // NOTIFY is a no-op if the auto-trigger already handled it, and cheap
      // insurance if it didn't. Never fails the whole run — a table that was
      // actually created should still read as applied even if the cache
      // nudge itself has a problem.
      try {
        await client.query("NOTIFY pgrst, 'reload schema'");
      } catch { /* best-effort */ }
    } finally {
      await client.end().catch(() => {});
    }

    const applied = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, stage: 'migrations', applied, total: results.length, results });
  } catch (e) {
    const { error, code } = describeError(e);
    return NextResponse.json({ stage: 'unexpected', error, code }, { status: 500 });
  }
}
