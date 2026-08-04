import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { PENDING_MIGRATIONS } from '@/lib/pendingMigrations';
import { sanitizeDbUrl, validateDbUrl } from '@/lib/adminMigrateUrl';
import { LEDGER_DDL, MIGRATION_LOCK_KEY, checksumOf, decideForMigration, type LedgerRow } from '@/lib/migrationLedger';

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
  /** True when the ledger already proved this applied with a matching checksum. */
  skipped?: boolean;
  reason?: string;
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
  let body: { dbUrl?: string; secret?: string; host?: string; port?: string; database?: string; user?: string; password?: string } = {};
  try { body = (await request.json()) as typeof body; } catch { /* no body */ }
  if (!authorized && secret && body.secret === secret) authorized = true;
  if (!authorized) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  // TWO WAYS TO CONNECT. Discrete fields (host/user/password/...) are
  // preferred when supplied: a raw password field needs no encoding at all,
  // no matter what characters it contains — @, #, %, spaces, anything —
  // which sidesteps connection-string parsing entirely, the actual source
  // of the "Invalid URL" failures a single combined string kept producing
  // even after sanitizing every copy-paste artifact anyone could reproduce.
  // A connection-string field (request body or SUPABASE_DB_URL) is the
  // fallback, still sanitized/validated the same way as before.
  let clientConfig: { host: string; port: number; user: string; password: string; database: string } | { connectionString: string };
  if (typeof body.host === 'string' && body.host.trim() && typeof body.password === 'string' && body.password) {
    const port = Number(body.port);
    clientConfig = {
      host: body.host.trim(),
      port: Number.isFinite(port) && port > 0 ? port : 5432,
      user: (body.user ?? 'postgres').trim() || 'postgres',
      password: body.password,
      database: (body.database ?? 'postgres').trim() || 'postgres',
    };
  } else {
    const rawDbUrl = typeof body.dbUrl === 'string' && body.dbUrl.trim() ? body.dbUrl : serverEnv.migrationsDbUrl();
    if (!rawDbUrl) {
      return NextResponse.json(
        { error: 'No database connection info. Fill in Host/Password (preferred — never needs encoding), paste a full connection string, or set SUPABASE_DB_URL in your env.' },
        { status: 503 },
      );
    }
    const dbUrl = sanitizeDbUrl(rawDbUrl);
    const validation = validateDbUrl(dbUrl);
    if (!validation.ok) {
      return NextResponse.json(
        {
          stage: 'validate',
          error: `The database URL is not usable: ${validation.reason} If your password has special characters, use the Host/Password fields instead — they need no encoding at all.`,
        },
        { status: 400 },
      );
    }
    clientConfig = { connectionString: dbUrl };
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
      client = new Client({ ...clientConfig, ssl: { rejectUnauthorized: false } });
      await client.connect();
    } catch (e) {
      const { error, code } = describeError(e);
      return NextResponse.json(
        { stage: 'connect', error: `Could not connect to the database: ${error}`, code },
        { status: 502 },
      );
    }

    const results: MigrationResult[] = [];
    let lockHeld = false;
    try {
      // THE LEDGER. This route historically applied migrations and recorded
      // NOTHING, leaning on every migration's SQL being idempotent. That made
      // public.schema_migrations under-report permanently, so there was no way
      // to ask the database what it actually had — and /api/version filled the
      // gap with the newest FILE in the repo, which is how it reported 0042
      // while the database was still at 0041.
      await client.query(LEDGER_DDL);

      // ONE WRITER AT A TIME. A session-level advisory lock on a fixed key, so
      // two deployments (or a CLI run racing the admin route) cannot migrate
      // simultaneously. Released in the finally below.
      await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
      lockHeld = true;

      const { rows: ledgerRows } = await client.query<LedgerRow>(
        'select name, checksum, success, reconciled from public.schema_migrations',
      );
      const ledger = new Map(ledgerRows.map((r) => [r.name, r]));

      for (const m of PENDING_MIGRATIONS) {
        const sql = Buffer.from(m.sqlB64, 'base64').toString('utf8');
        const checksum = checksumOf(sql);
        const decision = decideForMigration(m.name, checksum, ledger.get(m.name));

        if (decision.action === 'skip') {
          results.push({ name: m.name, ok: true, skipped: true, reason: decision.reason });
          continue;
        }
        if (decision.action === 'halt') {
          // Changed SQL under an already-applied name. Stop the whole run
          // rather than re-executing edited DDL against a live database.
          results.push({ name: m.name, ok: false, error: decision.reason, code: 'CHECKSUM_MISMATCH' });
          break;
        }

        const startedAt = new Date().toISOString();
        try {
          await client.query('begin');
          await client.query(sql);
          await client.query('commit');
          // Written ONLY after the migration committed. A crash before this
          // point leaves no success row, which is the correct, safe outcome.
          try {
            await client.query(
              `insert into public.schema_migrations
                 (name, filename, checksum, started_at, completed_at, success, execution_method, environment)
               values ($1,$2,$3,$4,now(),true,'admin_route',$5)
               on conflict (name) do update set
                 checksum=excluded.checksum, started_at=excluded.started_at,
                 completed_at=excluded.completed_at, success=true,
                 error_message=null, error_code=null,
                 execution_method=excluded.execution_method, environment=excluded.environment`,
              [m.name, `${m.name}.sql`, checksum, startedAt, process.env.VERCEL_ENV ?? 'unknown'],
            );
          } catch { /* migration applied; only the bookkeeping missed */ }
          results.push({ name: m.name, ok: true });
        } catch (e) {
          try { await client.query('rollback'); } catch { /* ignore */ }
          const { error, code } = describeError(e);
          // Record the FAILURE explicitly, success=false, so a later run
          // retries it and nothing reads it as applied.
          try {
            await client.query(
              `insert into public.schema_migrations
                 (name, filename, checksum, started_at, completed_at, success, error_message, error_code, execution_method, environment)
               values ($1,$2,$3,$4,now(),false,$5,$6,'admin_route',$7)
               on conflict (name) do update set
                 success=false, error_message=excluded.error_message, error_code=excluded.error_code,
                 started_at=excluded.started_at, completed_at=excluded.completed_at`,
              [m.name, `${m.name}.sql`, checksum, startedAt, error, code ?? null, process.env.VERCEL_ENV ?? 'unknown'],
            );
          } catch { /* best-effort */ }
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
      if (lockHeld) {
        await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
      }
      await client.end().catch(() => {});
    }

    const applied = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, stage: 'migrations', applied, total: results.length, results });
  } catch (e) {
    const { error, code } = describeError(e);
    return NextResponse.json({ stage: 'unexpected', error, code }, { status: 500 });
  }
}
