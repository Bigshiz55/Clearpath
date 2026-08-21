/**
 * PROVE A MIGRATION BEFORE IT TOUCHES PRODUCTION.
 *
 *   npx tsx scripts/proveMigration.ts <connection-url> 0041_watchmode_availability [...]
 *
 * Applies each migration to a throwaway Postgres, then applies it AGAIN to
 * prove it is idempotent, and prints every table, index, policy and constraint
 * it created. Nothing here touches production — the URL is meant to be a local
 * database.
 *
 * Written after 0041 sat unapplied in production for days: the migration was
 * fine, but nobody could say so with evidence, and "probably fine" is not a
 * reason to run DDL against a live database. Now it can be demonstrated first.
 *
 * A Supabase database provides `auth.uid()`, `auth.users` and helpers like
 * `public.set_updated_at()` that a bare Postgres does not. Those are stubbed
 * so a migration can be judged on its OWN content — a failure here is the
 * migration's, not the harness's.
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRELUDE = `
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
-- Supabase's standard roles, which policies name ('to service_role', grants
-- to anon/authenticated). A bare Postgres has none of them; nologin stubs
-- let a migration be judged on its own content.
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
`;

async function main(): Promise<void> {
  const [url, ...names] = process.argv.slice(2);
  if (!url || names.length === 0) {
    console.error('Usage: proveMigration.ts <connection-url> <migration-name> [...]');
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(PRELUDE);

    for (const name of names) {
      const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', `${name}.sql`), 'utf8');
      await client.query(sql);
      console.log(`[prove] ${name}: applied`);
      // Every migration in this repo claims to be idempotent. Claims are
      // cheap; a second run is proof.
      await client.query(sql);
      console.log(`[prove] ${name}: re-applied (idempotent)`);
    }

    const objects = await client.query<{ kind: string; name: string }>(`
      select 'table' as kind, tablename as name from pg_tables where schemaname = 'public'
      union all select 'index', indexname from pg_indexes where schemaname = 'public'
      union all select 'policy', tablename || '.' || policyname from pg_policies where schemaname = 'public'
      union all select 'constraint', conrelid::regclass || '.' || conname from pg_constraint
        where connamespace = 'public'::regnamespace and contype in ('c', 'u', 'p')
      order by 1, 2
    `);
    console.log(`\n[prove] ${objects.rowCount} object(s) now present:`);
    for (const r of objects.rows) console.log(`  ${r.kind.padEnd(10)} ${r.name}`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(`[prove] FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

export {};
