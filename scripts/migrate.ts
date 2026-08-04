/**
 * Applies every migration in PENDING_MIGRATIONS to SUPABASE_DB_URL, in
 * order, each in its own transaction. Idempotent via a `schema_migrations`
 * tracking table (created on first run) — a migration whose name is already
 * recorded there is skipped, so a second run applies nothing.
 *
 * NOT RUN AUTOMATICALLY. This header used to say it ran as part of
 * `npm run build`. It does not. That wiring existed for under two hours on
 * 2026-07-31 (added in bb4195d, reverted in 67d1014 after five consecutive
 * failed production deploys) and was never replaced, so `npm run build` is
 * plain `next build` and this script runs only when a human invokes
 * `npm run migrate`. See docs/SCHEMA_DRIFT_0042.md for what that gap did to
 * the production schema.
 *
 * It also tracks migrations in `public.schema_migrations`, which is NOT the
 * ledger Supabase's own tooling writes (`supabase_migrations.schema_migrations`).
 * A migration applied through the Supabase CLI or dashboard is invisible to
 * this script, and vice versa — never treat either table as the whole truth.
 *
 * Never prints SUPABASE_DB_URL itself, only migration names/results.
 */
import { Client } from 'pg';
import { PENDING_MIGRATIONS } from '../src/lib/pendingMigrations';

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.warn('[migrate] SUPABASE_DB_URL is not set — skipping migrations. The build will continue.');
    return;
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query<{ name: string }>('select name from public.schema_migrations');
    const alreadyApplied = new Set(rows.map((r) => r.name));

    let appliedCount = 0;
    for (const migration of PENDING_MIGRATIONS) {
      if (alreadyApplied.has(migration.name)) continue;

      const sql = Buffer.from(migration.sqlB64, 'base64').toString('utf8');
      console.log(`[migrate] applying ${migration.name}...`);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into public.schema_migrations (name) values ($1)', [migration.name]);
        await client.query('commit');
        appliedCount++;
        console.log(`[migrate] ${migration.name} OK`);
      } catch (e) {
        await client.query('rollback').catch(() => {});
        const message = e instanceof Error ? e.message : String(e);
        // Re-thrown to main's catch, which exits non-zero — a broken
        // migration must fail the build loudly, never fail silently.
        throw new Error(`migration "${migration.name}" failed: ${message}`);
      }
    }

    // Belt-and-suspenders: Supabase's hosted PostgREST normally auto-reloads
    // on DDL, but that trigger can lag or be missing. Best-effort — never
    // fails the run if the notify itself has a problem.
    await client.query("NOTIFY pgrst, 'reload schema'").catch(() => {});

    const skipped = PENDING_MIGRATIONS.length - appliedCount;
    console.log(`[migrate] done — ${appliedCount} applied, ${skipped} already up to date.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(`[migrate] FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
