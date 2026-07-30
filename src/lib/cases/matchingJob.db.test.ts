/**
 * End-to-end DB-level check: the real `runMatchingJob` function runs to
 * completion over the FULL 280-episode fixture set against local Postgres
 * and writes its proposed candidates to the review queue. Skipped without a
 * database URL — see src/lib/packs/packs.db.test.ts for how to point one at
 * local Postgres.
 *
 * `runMatchingJob` takes a supabase-js-shaped client (matching every other
 * data-layer module in this codebase); this test's `pgUpsertShim` is a
 * minimal adapter implementing just the `.from().upsert().select()` surface
 * `reviewQueue.proposeCandidates` calls, backed by a raw `pg` connection —
 * enough to run the real job function against local Postgres without
 * standing up PostgREST.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runMatchingJob } from './matchingJob';
import type { EpisodeInput } from './extraction';
import fixtures from './fixtures/trueCrimeEpisodes.json';

const dbUrl =
  process.env.PACKS_TEST_DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.MIGRATIONS_DB_URL ?? null;

describe.skipIf(!dbUrl)('runMatchingJob (DB-level, full fixture set)', () => {
  let pgClient: Client;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: dbUrl! });
    await pgClient.connect();
  });

  afterAll(async () => {
    await pgClient.end();
  });

  beforeEach(async () => {
    await pgClient.query('begin');
  });

  afterEach(async () => {
    await pgClient.query('rollback');
  });

  function pgUpsertShim(client: Client): SupabaseClient {
    return {
      from(table: string) {
        return {
          upsert(rows: Record<string, unknown>[]) {
            return {
              async select() {
                if (rows.length === 0) return { data: [], error: null };
                const inserted: { id: string }[] = [];
                for (const row of rows) {
                  const res = await client.query(
                    `insert into public.${table} (episode_a_id, episode_b_id, confidence, reasons)
                     values ($1, $2, $3, $4::jsonb)
                     on conflict (episode_a_id, episode_b_id) do nothing
                     returning id`,
                    [row.episode_a_id, row.episode_b_id, row.confidence, JSON.stringify(row.reasons)],
                  );
                  inserted.push(...res.rows);
                }
                return { data: inserted, error: null };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;
  }

  it('runs to completion over the full fixture set and the review queue accepts its candidates', async () => {
    const episodes = fixtures as EpisodeInput[];
    expect(episodes.length).toBeGreaterThanOrEqual(200);

    const report = await runMatchingJob(pgUpsertShim(pgClient), episodes);

    expect(report.episodesProcessed).toBe(episodes.length);
    expect(report.extraction.count).toBe(episodes.length);
    expect(report.extraction.costUsd).toBe(0);
    expect(report.candidatesProposed).toBeGreaterThan(0);
    expect(report.candidatesInserted).toBe(report.candidatesProposed); // fresh run, nothing previously decided

    const { rows } = await pgClient.query(`select count(*) from public.case_match_candidates where status = 'pending'`);
    expect(Number(rows[0].count)).toBe(report.candidatesInserted);
  });

  it('a second run over the same set does not duplicate or re-decide existing rows', async () => {
    const episodes = fixtures as EpisodeInput[];
    const shim = pgUpsertShim(pgClient);

    const first = await runMatchingJob(shim, episodes);
    const second = await runMatchingJob(shim, episodes);

    expect(second.candidatesProposed).toBe(first.candidatesProposed);
    expect(second.candidatesInserted).toBe(0); // every pair already exists from the first run

    const { rows } = await pgClient.query(`select count(*) from public.case_match_candidates`);
    expect(Number(rows[0].count)).toBe(first.candidatesInserted);
  });
});
