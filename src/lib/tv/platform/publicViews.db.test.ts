import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

/**
 * THE GUARANTEE, TESTED AGAINST A REAL POSTGRES.
 *
 * "Fixture data is never shown to a production user, and neither is data from
 * an unverified source" is enforced by grants and view predicates, not by
 * application code. That is deliberate — application code can be forgotten,
 * a missing grant cannot — but it means the guarantee is only as good as the
 * migration, and a migration is only as good as the test that exercises it.
 *
 * So this runs the actual SQL: it grants `anon` what a browser gets, loads
 * both kinds of row, and asserts what comes back.
 *
 * Skipped when no database URL is configured, so `npm test` stays green
 * without one. Run for real with:
 *
 *   TV_TEST_DATABASE_URL=postgres://... npx vitest run publicViews.db
 *
 * against a database with migrations 0001–0044 applied.
 */

const dbUrl =
  process.env.TV_TEST_DATABASE_URL
  ?? process.env.PACKS_TEST_DATABASE_URL
  ?? process.env.SUPABASE_DB_URL
  ?? process.env.MIGRATIONS_DB_URL
  ?? null;

const maybe = dbUrl ? describe : describe.skip;

maybe('public views hide fixtures and unverified sources', () => {
  let client: Client;
  const KEYS = ['dbtest-fixture', 'dbtest-verified', 'dbtest-unverified'];

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl! });
    await client.connect();

    // Whatever a browser is: `anon` with usage on the schema and nothing else.
    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='anon') then
          create role anon nologin;
        end if;
      end $$;
      grant usage on schema public to anon;
    `);

    await client.query(`delete from canon_titles where canonical_key = any($1)`, [KEYS]);
    await client.query(`update data_sources set support_stage = 'verified' where slug = 'tvmaze'`);
    await client.query(`update data_sources set support_stage = 'evaluated' where slug = 'tv_media'`);

    // Three rows: a fixture, a real row from a verified source, and a real
    // row from a source that has not earned user visibility.
    await client.query(`
      insert into canon_titles (canonical_key, title_type, primary_title, sort_title, release_year, is_fixture, source_id)
      select 'dbtest-fixture', 'movie', 'A Generated Fixture', 'a generated fixture', 2026, true, id
        from data_sources where slug = 'fixture'
      on conflict (canonical_key) do nothing`);
    await client.query(`
      insert into canon_titles (canonical_key, title_type, primary_title, sort_title, release_year, is_fixture, source_id)
      select 'dbtest-verified', 'movie', 'A Verified Real Title', 'a verified real title', 2026, false, id
        from data_sources where slug = 'tvmaze'
      on conflict (canonical_key) do nothing`);
    await client.query(`
      insert into canon_titles (canonical_key, title_type, primary_title, sort_title, release_year, is_fixture, source_id)
      select 'dbtest-unverified', 'movie', 'From An Unproven Source', 'from an unproven source', 2026, false, id
        from data_sources where slug = 'tv_media'
      on conflict (canonical_key) do nothing`);
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    await client.query(`delete from canon_titles where canonical_key = any($1)`, [KEYS]);
    await client.end();
  });

  /**
   * Run one query as `anon`, in its own transaction.
   *
   * Self-contained on purpose: a permission error ABORTS the transaction, and
   * an aborted transaction rejects every subsequent statement — including the
   * `reset role` meant to clean up. A first version reset inside the failed
   * transaction and cascaded a single expected denial into six failures.
   * `rollback` is valid on an aborted transaction; `reset role` is not.
   */
  async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await client.query('begin');
    try {
      await client.query('set local role anon');
      const { rows } = await client.query(sql, params);
      return rows as T[];
    } finally {
      await client.query('rollback');
    }
  }

  it('refuses anon direct access to the base table', async () => {
    await expect(asAnon('select count(*) from canon_titles')).rejects.toThrow(/permission denied/i);
  });

  it('hides a fixture row through the public view', async () => {
    const rows = await asAnon<{ canonical_key: string }>(
      `select canonical_key from public_canon_titles where canonical_key = 'dbtest-fixture'`);
    expect(rows).toEqual([]);
  });

  it('shows a real row from a verified source', async () => {
    const rows = await asAnon<{ primary_title: string }>(
      `select primary_title from public_canon_titles where canonical_key = 'dbtest-verified'`);
    expect(rows.map((r) => r.primary_title)).toEqual(['A Verified Real Title']);
  });

  it('hides a real row whose source has not reached verified', async () => {
    // Not a fixture, not fabricated — simply from a source that has not
    // earned user visibility yet. The stage gate is separate from is_fixture
    // and both have to hold.
    const rows = await asAnon<{ canonical_key: string }>(
      `select canonical_key from public_canon_titles where canonical_key = 'dbtest-unverified'`);
    expect(rows).toEqual([]);
  });

  it('re-hides a row the moment its source is demoted', async () => {
    await client.query(`update data_sources set support_stage = 'degraded' where slug = 'tvmaze'`);
    const rows = await asAnon<{ canonical_key: string }>(
      `select canonical_key from public_canon_titles where canonical_key = 'dbtest-verified'`);
    await client.query(`update data_sources set support_stage = 'verified' where slug = 'tvmaze'`);
    expect(rows).toEqual([]);
  });

  it('grants anon the views and only the views', async () => {
    const { rows } = await client.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'
         and table_name in ('canon_titles','dist_offers','linear_airings',
                            'public_canon_titles','public_dist_offers','public_linear_airings')`);
    const granted = new Set(rows.map((r) => r.table_name));
    expect(granted.has('public_canon_titles')).toBe(true);
    expect(granted.has('canon_titles')).toBe(false);
    expect(granted.has('dist_offers')).toBe(false);
    expect(granted.has('linear_airings')).toBe(false);
  });
});
