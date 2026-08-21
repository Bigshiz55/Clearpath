/**
 * Applies every migration in PENDING_MIGRATIONS to SUPABASE_DB_URL under the
 * SAME ledger discipline as /api/admin/migrate — one runner architecture,
 * reached two ways.
 *
 * This script was the LAST bare-ledger writer: it created `(name,
 * applied_at)`, skipped by name alone, recorded no checksums, and left the
 * table without row-level security — while the admin route had long moved to
 * the checksummed, born-hardened ledger (`LEDGER_DDL`). The GitHub Actions
 * apply-migrations workflow prefers THIS script whenever a repository DB
 * secret exists, so the modern discipline was unreachable on the very path
 * that runs unattended (TASK: close-the-ledger-gap, 2026-08-21). Now both
 * paths share `LEDGER_DDL` (which also upgrades a legacy bare table in place
 * and truthfully backfills its history as successes), the advisory lock, and
 * `decideForMigration`'s skip/halt semantics — changed SQL under an applied
 * name is a hard stop, never a rerun.
 *
 * NOT RUN AUTOMATICALLY. `npm run build` is plain `next build`; this runs
 * only when a human (or the manually-dispatched workflow) invokes
 * `npm run migrate`. See docs/SCHEMA_DRIFT_0042.md for what the automatic
 * wiring did to five consecutive production deploys before it was reverted.
 *
 * It tracks migrations in `public.schema_migrations`, which is NOT the
 * ledger Supabase's own tooling writes (`supabase_migrations.schema_migrations`).
 * A migration applied through the Supabase CLI or dashboard is invisible to
 * this script, and vice versa — never treat either table as the whole truth.
 *
 * Never prints SUPABASE_DB_URL itself, only migration names/results.
 */
import './searchAudit/shimServerOnly';
import { Client } from 'pg';
import { PENDING_MIGRATIONS } from '../src/lib/pendingMigrations';
import { LEDGER_DDL, MIGRATION_LOCK_KEY, checksumOf, decideForMigration, type LedgerRow } from '../src/lib/migrationLedger';

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.warn('[migrate] SUPABASE_DB_URL is not set — skipping migrations. The build will continue.');
    return;
  }

  // node-pg's `ssl` option overrides the URL's own sslmode, so an explicit
  // sslmode=disable (the libpq convention — used by the local throwaway-
  // Postgres proof harness) must be honored rather than clobbered. Every
  // hosted Supabase URL negotiates TLS exactly as before.
  const client = new Client({
    connectionString: dbUrl,
    ssl: /\bsslmode=disable\b/.test(dbUrl) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  let lockHeld = false;
  try {
    // THE LEDGER — created hardened, or upgraded in place from the bare
    // legacy table (columns added, RLS enabled, anon/authenticated revoked,
    // pre-upgrade history backfilled as the successes it truthfully was).
    await client.query(LEDGER_DDL);

    // ONE WRITER AT A TIME — the same fixed key the admin route contends
    // for, so a CLI run can never race a deployment's migrate call.
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockHeld = true;

    const { rows: ledgerRows } = await client.query<LedgerRow>(
      'select name, checksum, success, reconciled from public.schema_migrations',
    );
    const ledger = new Map(ledgerRows.map((r) => [r.name, r]));

    let appliedCount = 0;
    let skippedCount = 0;
    for (const migration of PENDING_MIGRATIONS) {
      const sql = Buffer.from(migration.sqlB64, 'base64').toString('utf8');
      const checksum = checksumOf(sql);
      const decision = decideForMigration(migration.name, checksum, ledger.get(migration.name));

      if (decision.action === 'skip') {
        skippedCount++;
        continue;
      }
      if (decision.action === 'halt') {
        // Changed SQL under an already-applied name. Stop the whole run
        // rather than re-executing edited DDL against a live database.
        throw new Error(decision.reason);
      }

      const startedAt = new Date().toISOString();
      console.log(`[migrate] applying ${migration.name}...`);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('commit');
        // Written ONLY after the migration committed — a crash before this
        // point leaves no success row, which is the correct, safe outcome.
        try {
          await client.query(
            `insert into public.schema_migrations
               (name, filename, checksum, started_at, completed_at, success, execution_method, environment)
             values ($1,$2,$3,$4,now(),true,'cli',$5)
             on conflict (name) do update set
               checksum=excluded.checksum, started_at=excluded.started_at,
               completed_at=excluded.completed_at, success=true,
               error_message=null, error_code=null,
               execution_method=excluded.execution_method, environment=excluded.environment`,
            [migration.name, `${migration.name}.sql`, checksum, startedAt, process.env.VERCEL_ENV ?? 'ci'],
          );
        } catch { /* migration applied; only the bookkeeping missed */ }
        appliedCount++;
        console.log(`[migrate] ${migration.name} OK`);
      } catch (e) {
        await client.query('rollback').catch(() => {});
        const message = e instanceof Error ? e.message : String(e);
        // Record the FAILURE explicitly, success=false, so a later run
        // retries it and nothing reads it as applied.
        try {
          await client.query(
            `insert into public.schema_migrations
               (name, filename, checksum, started_at, completed_at, success, error_message, execution_method, environment)
             values ($1,$2,$3,$4,now(),false,$5,'cli',$6)
             on conflict (name) do update set
               success=false, error_message=excluded.error_message,
               started_at=excluded.started_at, completed_at=excluded.completed_at`,
            [migration.name, `${migration.name}.sql`, checksum, startedAt, message.slice(0, 500), process.env.VERCEL_ENV ?? 'ci'],
          );
        } catch { /* best-effort */ }
        // Re-thrown to main's catch, which exits non-zero — a broken
        // migration must fail the run loudly, never silently.
        throw new Error(`migration "${migration.name}" failed: ${message}`);
      }
    }

    // Belt-and-suspenders: Supabase's hosted PostgREST normally auto-reloads
    // on DDL, but that trigger can lag or be missing. Best-effort — never
    // fails the run if the notify itself has a problem.
    await client.query("NOTIFY pgrst, 'reload schema'").catch(() => {});

    console.log(`[migrate] done — ${appliedCount} applied, ${skippedCount} already up to date.`);
  } finally {
    if (lockHeld) {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    }
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(`[migrate] FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
