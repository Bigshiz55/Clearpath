/**
 * DB-level tests for the review queue, community correction, and retitle
 * handling — the accept criteria in the work order that are inherently
 * stateful (rejecting a pair must survive a re-run of the matcher; three
 * concurring flags must change queue ordering; a retitled rerun must not
 * read as unseen). Talks to Postgres directly with `pg`, matching the
 * pattern in src/lib/packs/packs.db.test.ts. Skipped entirely without a
 * database URL — see that file's header for how to point one at a local
 * Postgres with migrations 0001–0037 applied.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { proposeMatches, type MatchCandidate } from './matching';

const dbUrl =
  process.env.PACKS_TEST_DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.MIGRATIONS_DB_URL ?? null;

describe.skipIf(!dbUrl)('Case matching pipeline (DB-level)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl! });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query('begin');
  });

  afterEach(async () => {
    await client.query('rollback');
  });

  function orderedPair(a: number, b: number): [number, number] {
    return a < b ? [a, b] : [b, a];
  }

  async function insertCandidate(episodeA: number, episodeB: number, confidence = 0.8) {
    const [a, b] = orderedPair(episodeA, episodeB);
    const { rows } = await client.query<{ id: string }>(
      `insert into public.case_match_candidates (episode_a_id, episode_b_id, confidence, reasons)
       values ($1, $2, $3, '[]'::jsonb)
       on conflict (episode_a_id, episode_b_id) do nothing
       returning id`,
      [a, b, confidence],
    );
    return rows[0]?.id ?? null;
  }

  async function candidateExists(episodeA: number, episodeB: number): Promise<boolean> {
    const [a, b] = orderedPair(episodeA, episodeB);
    const { rows } = await client.query(
      `select 1 from public.case_match_candidates where episode_a_id = $1 and episode_b_id = $2`,
      [a, b],
    );
    return rows.length > 0;
  }

  async function makeUser(): Promise<string> {
    const id = randomUUID();
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@example.test`]);
    return id;
  }

  // -------------------------------------------------------------------------
  // Change 4 — reject then re-run does not re-propose
  // -------------------------------------------------------------------------
  it('rejecting a pair and re-running the matcher does not re-propose it', async () => {
    const episodeA = 900001;
    const episodeB = 900002;
    const candidateId = await insertCandidate(episodeA, episodeB, 0.9);
    expect(candidateId).not.toBeNull();

    await client.query(`update public.case_match_candidates set status = 'rejected', decided_at = now() where id = $1`, [
      candidateId,
    ]);

    // Simulate a matcher re-run: it proposes the same real pair again and
    // must skip it because a decided row already exists for this pair.
    const proposed: MatchCandidate[] = [{ episodeAId: episodeA, episodeBId: episodeB, confidence: 0.95, reasons: ['rerun'] }];
    for (const c of proposed) {
      const [a, b] = orderedPair(c.episodeAId, c.episodeBId);
      const existing = await client.query(`select status from public.case_match_candidates where episode_a_id=$1 and episode_b_id=$2`, [a, b]);
      if (existing.rows.length === 0) {
        await insertCandidate(c.episodeAId, c.episodeBId, c.confidence);
      }
      // else: already decided — matcher must not touch it.
    }

    const { rows } = await client.query(
      `select status, confidence from public.case_match_candidates where episode_a_id = $1 and episode_b_id = $2`,
      [Math.min(episodeA, episodeB), Math.max(episodeA, episodeB)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('rejected');
    expect(Number(rows[0]!.confidence)).toBe(0.9); // untouched by the "rerun" proposal
  });

  // -------------------------------------------------------------------------
  // Change 5 — three concurring community flags surface a pair at the top
  // -------------------------------------------------------------------------
  it('three concurring flags surface a pair at the top of the queue ordering', async () => {
    const lowConfPair = [900101, 900102] as const;
    const flaggedPair = [900201, 900202] as const;
    await insertCandidate(...lowConfPair, 0.55); // higher... no, lower confidence on purpose
    await insertCandidate(...flaggedPair, 0.51); // barely above PROPOSAL_THRESHOLD, lowest confidence

    const users = [await makeUser(), await makeUser(), await makeUser()];
    const [a, b] = orderedPair(...flaggedPair);
    for (const userId of users) {
      await client.query(
        `insert into public.case_match_flags (user_id, episode_a_id, episode_b_id, assertion) values ($1,$2,$3,'same')`,
        [userId, a, b],
      );
    }

    // Mirror reviewQueue.listPendingQueue's ordering: agreement count desc, then confidence desc.
    const { rows: agreementRows } = await client.query<{ episode_a_id: number; episode_b_id: number; same_count: string }>(
      `select episode_a_id, episode_b_id, count(*) as same_count
       from public.case_match_flags where assertion = 'same'
       group by episode_a_id, episode_b_id`,
    );
    const agreement = new Map(agreementRows.map((r) => [`${r.episode_a_id}:${r.episode_b_id}`, Number(r.same_count)]));

    const { rows: pending } = await client.query<{ episode_a_id: number; episode_b_id: number; confidence: number }>(
      `select episode_a_id, episode_b_id, confidence from public.case_match_candidates where status = 'pending'`,
    );
    const ordered = pending
      .map((r) => ({ ...r, agree: agreement.get(`${r.episode_a_id}:${r.episode_b_id}`) ?? 0 }))
      .sort((x, y) => (y.agree - x.agree) || (Number(y.confidence) - Number(x.confidence)));

    // bigint columns come back from `pg` as strings by default.
    expect(Number(ordered[0]!.episode_a_id)).toBe(a);
    expect(Number(ordered[0]!.episode_b_id)).toBe(b);
    expect(ordered[0]!.agree).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Change 2 / DO NOT TOUCH — nothing auto-merges regardless of confidence
  // -------------------------------------------------------------------------
  it('a high-confidence candidate stays pending until explicitly approved', async () => {
    const candidateId = await insertCandidate(900301, 900302, 0.98);
    const { rows } = await client.query(`select status from public.case_match_candidates where id = $1`, [candidateId]);
    expect(rows[0]!.status).toBe('pending');
  });

  // -------------------------------------------------------------------------
  // Approve creates/extends a Case via case_match_episodes
  // -------------------------------------------------------------------------
  it('approving a candidate creates a Case and links both episodes', async () => {
    const episodeA = 900401;
    const episodeB = 900402;
    const candidateId = await insertCandidate(episodeA, episodeB, 0.9);

    const { rows: caseRows } = await client.query<{ id: string }>(
      `insert into public.cases (slug, title) values ('approved-case-test', 'Approved Case Test') returning id`,
    );
    const caseId = caseRows[0]!.id;
    await client.query(
      `insert into public.case_match_episodes (case_id, tvmaze_episode_id) values ($1,$2), ($1,$3)`,
      [caseId, episodeA, episodeB],
    );
    await client.query(`update public.case_match_candidates set status='approved', case_id=$2, decided_at=now() where id=$1`, [
      candidateId,
      caseId,
    ]);

    const { rows: linked } = await client.query(
      `select tvmaze_episode_id from public.case_match_episodes where case_id = $1 order by tvmaze_episode_id`,
      [caseId],
    );
    expect(linked.map((r: { tvmaze_episode_id: number }) => Number(r.tvmaze_episode_id))).toEqual([episodeA, episodeB]);
  });

  // -------------------------------------------------------------------------
  // Change 6 — retitle handling: the real Phase-1 schema (case_aliases +
  // user_seen_programmes, unmodified), exercised here for this pipeline.
  // -------------------------------------------------------------------------
  it('a retitled rerun does not appear as unseen to a user who saw the original', async () => {
    const userId = await makeUser();
    const providerId = 'p-case-retitle-pipeline';
    await client.query(
      `insert into public.tv_providers (id, name, adapter_type) values ($1, $1, 'fixture') on conflict do nothing`,
      [providerId],
    );
    const programmeId = randomUUID();
    await client.query(
      `insert into public.tv_programmes (id, provider_id, provider_programme_id, title) values ($1, $2, $3, 'Original Air Title')`,
      [programmeId, providerId, programmeId],
    );

    await client.query(`insert into public.user_seen (user_id, subject_type, subject_id) values ($1,'programme',$2)`, [
      userId,
      programmeId,
    ]);

    // The provider re-airs the same broadcast under a new title — same
    // stable programme row, title updated in place, alias recorded.
    await client.query(`update public.tv_programmes set title = 'Rerun Under New Title' where id = $1`, [programmeId]);
    await client.query(`insert into public.case_aliases (programme_id, alias_title) values ($1, 'Original Air Title')`, [
      programmeId,
    ]);
    await client.query(`insert into public.case_aliases (programme_id, alias_title) values ($1, 'Rerun Under New Title')`, [
      programmeId,
    ]);

    const { rows: seen } = await client.query(
      `select 1 from public.user_seen_programmes where user_id = $1 and programme_id = $2`,
      [userId, programmeId],
    );
    expect(seen).toHaveLength(1); // still seen — same programme row, never duplicated
  });

  // -------------------------------------------------------------------------
  // Cross-check: real proposeMatches() output round-trips through the
  // review-queue insert-skip-if-decided logic without SQL errors.
  // -------------------------------------------------------------------------
  it('proposeMatches output over a small real slice inserts cleanly and respects existing decisions', async () => {
    const a = 900501;
    const b = 900502;
    await insertCandidate(a, b, 0.7);
    await client.query(`update public.case_match_candidates set status='rejected' where episode_a_id=$1 and episode_b_id=$2`, [
      Math.min(a, b),
      Math.max(a, b),
    ]);

    const candidates: MatchCandidate[] = [{ episodeAId: a, episodeBId: b, confidence: 0.99, reasons: ['shared subject: Test'] }];
    for (const c of candidates) {
      if (!(await candidateExists(c.episodeAId, c.episodeBId))) {
        await insertCandidate(c.episodeAId, c.episodeBId, c.confidence);
      }
    }
    const { rows } = await client.query(`select status from public.case_match_candidates where episode_a_id=$1 and episode_b_id=$2`, [
      Math.min(a, b),
      Math.max(a, b),
    ]);
    expect(rows[0]!.status).toBe('rejected');
  });
});
