/**
 * DB-level tests for the Pack schema (migration 0036), targeting changes 4
 * (Case), 6 (UserSeen), and 7 (UserTracking) specifically, per the work order
 * — these are the three most likely to be wrong because their correctness
 * depends on view/constraint behavior in Postgres, not just TypeScript types.
 *
 * Talks to Postgres directly with `pg` (same client the admin migration
 * runner uses), not the Supabase JS client — RLS bypass isn't the concern
 * here, the view/constraint logic itself is. Skipped entirely when no
 * database URL is configured, so `npm test` stays green without a DB; run it
 * for real by pointing PACKS_TEST_DATABASE_URL (or SUPABASE_DB_URL /
 * MIGRATIONS_DB_URL) at a Postgres instance with migrations 0001–0036 applied.
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const dbUrl =
  process.env.PACKS_TEST_DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.MIGRATIONS_DB_URL ?? null;

describe.skipIf(!dbUrl)('Pack schema (DB-level)', () => {
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

  async function makeProvider(id: string) {
    await client.query(
      `insert into public.tv_providers (id, name, adapter_type) values ($1, $1, 'fixture') on conflict do nothing`,
      [id],
    );
  }

  async function makeLineup(providerId: string, timezone = 'America/New_York'): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.tv_lineups (id, provider_id, provider_lineup_id, name, timezone) values ($1, $2, $3, $4, $5)`,
      [id, providerId, id, id, timezone],
    );
    return id;
  }

  async function makeStation(providerId: string, network: string): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.tv_stations (id, provider_id, provider_station_id, name, network) values ($1, $2, $3, $4, $4)`,
      [id, providerId, id, network],
    );
    return id;
  }

  async function makeProgramme(providerId: string, title: string, franchise: string | null = null): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.tv_programmes (id, provider_id, provider_programme_id, title, franchise) values ($1, $2, $3, $4, $5)`,
      [id, providerId, id, title, franchise],
    );
    return id;
  }

  async function makeAiring(
    lineupId: string,
    stationId: string,
    programmeId: string,
    startAtUtc: string,
    isPremiere: boolean,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.tv_airings (id, lineup_id, station_id, programme_id, start_at_utc, raw_hash, is_premiere)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, lineupId, stationId, programmeId, startAtUtc, id, isPremiere],
    );
    return id;
  }

  async function makeUser(): Promise<string> {
    const id = randomUUID();
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@example.test`]);
    return id;
  }

  async function makeCase(slug: string, title: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.cases (slug, title) values ($1, $2) returning id`,
      [slug, title],
    );
    return rows[0]!.id;
  }

  // -------------------------------------------------------------------------
  // Change 4 — Case: four networks, retitled airing resolves to the same Case
  // -------------------------------------------------------------------------
  describe('Case', () => {
    it('links programmes from four different networks to one Case', async () => {
      const providerId = 'p-case-4nets';
      await makeProvider(providerId);
      const networks = ['ABC', 'NBC', 'CBS', 'FOX'];
      const programmeIds: string[] = [];
      for (const network of networks) {
        const stationId = await makeStation(providerId, network);
        const lineupId = await makeLineup(providerId);
        const programmeId = await makeProgramme(providerId, `Coverage on ${network}`);
        await makeAiring(lineupId, stationId, programmeId, '2026-08-01T00:00:00Z', false);
        programmeIds.push(programmeId);
      }

      const caseId = await makeCase('four-network-case', 'Four Network Case');
      for (const programmeId of programmeIds) {
        await client.query(`insert into public.case_programmes (case_id, programme_id) values ($1, $2)`, [
          caseId,
          programmeId,
        ]);
      }

      const { rows } = await client.query<{ network: string }>(
        `select distinct st.network
         from public.case_programmes cp
         join public.tv_airings a on a.programme_id = cp.programme_id
         join public.tv_stations st on st.id = a.station_id
         where cp.case_id = $1`,
        [caseId],
      );
      expect(rows.map((r) => r.network).sort()).toEqual([...networks].sort());
    });

    it('resolves a retitled airing to the same Case', async () => {
      const providerId = 'p-case-retitle';
      await makeProvider(providerId);
      const stationId = await makeStation(providerId, 'ABC');
      const lineupId = await makeLineup(providerId);
      const programmeId = await makeProgramme(providerId, 'Original Broadcast Title');
      await makeAiring(lineupId, stationId, programmeId, '2026-08-01T00:00:00Z', false);

      const caseId = await makeCase('retitle-case', 'Retitle Case');
      await client.query(`insert into public.case_programmes (case_id, programme_id) values ($1, $2)`, [
        caseId,
        programmeId,
      ]);
      await client.query(`insert into public.case_aliases (programme_id, alias_title) values ($1, $2)`, [
        programmeId,
        'Original Broadcast Title',
      ]);

      // The provider retitles the same broadcast — same stable programme
      // identity (provider_id, provider_programme_id), title updates in
      // place. Record the alternate title as history.
      await client.query(`update public.tv_programmes set title = $2 where id = $1`, [
        programmeId,
        'Retitled Broadcast',
      ]);
      await client.query(`insert into public.case_aliases (programme_id, alias_title) values ($1, $2)`, [
        programmeId,
        'Retitled Broadcast',
      ]);

      const { rows: resolved } = await client.query<{ case_id: string }>(
        `select case_id from public.case_programmes where programme_id = $1`,
        [programmeId],
      );
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.case_id).toBe(caseId);

      const { rows: aliases } = await client.query<{ alias_title: string }>(
        `select alias_title from public.case_aliases where programme_id = $1 order by alias_title`,
        [programmeId],
      );
      expect(aliases.map((r) => r.alias_title)).toEqual(['Original Broadcast Title', 'Retitled Broadcast']);
    });
  });

  // -------------------------------------------------------------------------
  // Change 6 — UserSeen: both directions
  // -------------------------------------------------------------------------
  describe('UserSeen', () => {
    it('marking a Case seen implies all its programmes are seen', async () => {
      const userId = await makeUser();
      const providerId = 'p-seen-a';
      await makeProvider(providerId);
      const programmeId1 = await makeProgramme(providerId, 'A');
      const programmeId2 = await makeProgramme(providerId, 'B');
      const caseId = await makeCase('seen-case-a', 'Seen Case A');
      await client.query(
        `insert into public.case_programmes (case_id, programme_id) values ($1,$2), ($1,$3)`,
        [caseId, programmeId1, programmeId2],
      );

      await client.query(`insert into public.user_seen (user_id, subject_type, subject_id) values ($1,'case',$2)`, [
        userId,
        caseId,
      ]);

      const { rows } = await client.query<{ programme_id: string }>(
        `select programme_id from public.user_seen_programmes where user_id = $1 order by programme_id`,
        [userId],
      );
      expect(rows.map((r) => r.programme_id).sort()).toEqual([programmeId1, programmeId2].sort());
    });

    it('marking a programme seen does not imply its Case is seen', async () => {
      const userId = await makeUser();
      const providerId = 'p-seen-b';
      await makeProvider(providerId);
      const programmeId = await makeProgramme(providerId, 'A');
      const caseId = await makeCase('seen-case-b', 'Seen Case B');
      await client.query(`insert into public.case_programmes (case_id, programme_id) values ($1,$2)`, [
        caseId,
        programmeId,
      ]);

      await client.query(
        `insert into public.user_seen (user_id, subject_type, subject_id) values ($1,'programme',$2)`,
        [userId, programmeId],
      );

      const { rows: programmeSeen } = await client.query<{ programme_id: string }>(
        `select programme_id from public.user_seen_programmes where user_id = $1`,
        [userId],
      );
      expect(programmeSeen).toHaveLength(1);

      const { rows: caseSeen } = await client.query(
        `select 1 from public.user_seen where user_id = $1 and subject_type = 'case' and subject_id = $2`,
        [userId, caseId],
      );
      expect(caseSeen).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Change 7 — UserTracking: all four subscription types resolve to airings
  // -------------------------------------------------------------------------
  describe('UserTracking', () => {
    it('resolves person, case, franchise, and pack subscriptions to matching airings', async () => {
      const userId = await makeUser();
      const providerId = 'p-tracking-7';
      await makeProvider(providerId);
      const lineupId = await makeLineup(providerId);
      // Each subscription type gets its own station, so a match can only come
      // from the mechanism under test (e.g. the pack match can only come from
      // pack_stations, not from incidentally sharing a station with another
      // subscription's airing).
      const personStationId = await makeStation(providerId, 'ABC');
      const caseStationId = await makeStation(providerId, 'NBC');
      const franchiseStationId = await makeStation(providerId, 'CBS');
      const packStationId = await makeStation(providerId, 'FOX');

      // person
      const personProgrammeId = await makeProgramme(providerId, 'Person Show');
      const personAiringId = await makeAiring(
        lineupId,
        personStationId,
        personProgrammeId,
        '2026-08-01T00:00:00Z',
        false,
      );
      const { rows: personRows } = await client.query<{ id: string }>(
        `insert into public.persons (slug, full_name) values ('person-7', 'Person Seven') returning id`,
      );
      const personId = personRows[0]!.id;
      await client.query(`insert into public.person_programmes (person_id, programme_id, role) values ($1,$2,'actor')`, [
        personId,
        personProgrammeId,
      ]);

      // case
      const caseProgrammeId = await makeProgramme(providerId, 'Case Show');
      const caseAiringId = await makeAiring(lineupId, caseStationId, caseProgrammeId, '2026-08-01T00:00:00Z', false);
      const caseId = await makeCase('track-case-7', 'Track Case Seven');
      await client.query(`insert into public.case_programmes (case_id, programme_id) values ($1,$2)`, [
        caseId,
        caseProgrammeId,
      ]);

      // franchise
      const franchiseProgrammeId = await makeProgramme(providerId, 'Franchise Show', 'Seven Saga');
      const franchiseAiringId = await makeAiring(
        lineupId,
        franchiseStationId,
        franchiseProgrammeId,
        '2026-08-01T00:00:00Z',
        false,
      );

      // pack
      const packProgrammeId = await makeProgramme(providerId, 'Pack Show');
      const packAiringId = await makeAiring(lineupId, packStationId, packProgrammeId, '2026-08-01T00:00:00Z', false);
      const { rows: packRows } = await client.query<{ id: string }>(
        `insert into public.packs (slug, display_name) values ('track-pack-7', 'Track Pack Seven') returning id`,
      );
      const packId = packRows[0]!.id;
      await client.query(`insert into public.pack_stations (pack_id, station_id) values ($1,$2)`, [
        packId,
        packStationId,
      ]);

      await client.query(
        `insert into public.user_tracking (user_id, subscription_type, subject_uuid, subject_text) values
           ($1,'person',$2,null),
           ($1,'case',$3,null),
           ($1,'franchise',null,'Seven Saga'),
           ($1,'pack',$4,null)`,
        [userId, personId, caseId, packId],
      );

      const { rows: matches } = await client.query<{ subscription_type: string; airing_id: string }>(
        `select subscription_type, airing_id from public.user_tracking_matches where user_id = $1 order by subscription_type`,
        [userId],
      );

      const byType = Object.fromEntries(matches.map((m) => [m.subscription_type, m.airing_id]));
      expect(byType).toEqual({
        case: caseAiringId,
        franchise: franchiseAiringId,
        pack: packAiringId,
        person: personAiringId,
      });
    });
  });
});
