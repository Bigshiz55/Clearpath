/**
 * SLICE A — AVAILABILITY AND AIRINGS CARRY THEIR OWN PROVENANCE.
 *
 * THE STATE THIS ENDS (audited at 975938f): the data layer already HELD the
 * provenance and the read boundary threw it away —
 *
 *   - `tv_airings` carries fetched_at / last_seen_at / source (0032), and
 *     `ingestedGuide`'s select() dropped all three; `Airing` had no field to
 *     hold them.
 *   - Migration 0042 added source_key / retrieved_at / last_verified_at /
 *     availability_state to `watchmode_availability` — and NOTHING wrote or
 *     read those columns.
 *   - `getNextAiring` returned network+time with no source and no
 *     observation time.
 *   - The scoring path stamped `checkedAt` with "now" on every hydration —
 *     a fetch time dressed as a verification time.
 *   - `packs/dna.ts` still resolved programmes with the `results[0]`
 *     popularity guess that `tmdbMatch.ts` documents as a fixed defect —
 *     and PERSISTED the guess.
 *
 * INV-4's law (availability claims carry source + timestamp) needs this data
 * half before the invariant half can check anything real.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestedRowToAiring, type IngestedAiringRow } from './ingestedGuide';
import { selectUpcomingAirings, type Airing } from '@/lib/onTv';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const row: IngestedAiringRow = {
  startAtUtc: '2026-08-21T20:00:00.000Z',
  providerAiringId: 'a-1',
  stationName: 'AMC',
  programmeProviderId: '77',
  title: 'Rocky',
  episodeTitle: null,
  programmeType: 'movie',
  seasonNumber: null,
  episodeNumber: null,
  genres: ['Drama', 'Sport'],
  description: 'A boxing film.',
  runtimeMinutes: 119,
  artworkUrl: null,
  source: 'tvmaze',
  fetchedAt: '2026-08-20T06:00:00.000Z',
  lastSeenAt: '2026-08-21T06:00:00.000Z',
};

describe('an ingested airing keeps the provenance its table already had', () => {
  it('carries source and observedAt through to the Airing', () => {
    const a = ingestedRowToAiring(row);
    expect(a.source).toBe('ingest:tvmaze');
    // last_seen_at is the freshest observation; fetched_at is the fallback.
    expect(a.observedAt).toBe('2026-08-21T06:00:00.000Z');
  });

  it('falls back to fetchedAt and never invents a time', () => {
    const a = ingestedRowToAiring({ ...row, lastSeenAt: null });
    expect(a.observedAt).toBe('2026-08-20T06:00:00.000Z');
    const b = ingestedRowToAiring({ ...row, lastSeenAt: null, fetchedAt: null });
    expect(b.observedAt ?? null).toBeNull();
  });
});

describe('a requested subject survives to the guide selector', () => {
  const airing = (over: Partial<Airing>): Airing =>
    ({
      id: 1, time: '20:00', minutes: 1200, airstamp: '2026-08-21T20:00:00.000Z',
      runtime: 100, network: 'AMC', showName: 'Some Show', showId: 1,
      episodeName: null, season: null, number: null, showType: 'Movie',
      genres: [], rating: 7, image: null, summary: null, imdb: null,
      ...over,
    }) as Airing;

  const now = Date.parse('2026-08-21T19:00:00.000Z');

  it('a subject term filters by the programme evidence we actually hold', () => {
    const pool = [
      airing({ id: 1, showId: 1, showName: 'Creed', summary: 'A boxing drama.' }),
      airing({ id: 2, showId: 2, showName: 'Steel Magnolias', summary: 'A family drama.' }),
      airing({ id: 3, showId: 3, showName: 'Boxing Night Live', summary: null }),
    ];
    const got = selectUpcomingAirings(pool, now, undefined, null, null, false, 'boxing');
    expect(got.map((a) => a.showId).sort()).toEqual([1, 3]);
  });

  it('no subject term = exactly the behavior that always was', () => {
    const pool = [airing({ id: 1, showId: 1 }), airing({ id: 2, showId: 2 })];
    expect(selectUpcomingAirings(pool, now).length).toBe(2);
  });
});

describe('the sources say when they observed what they claim', () => {
  it('getNextAiring names its source and observation time', () => {
    const src = read('src/lib/onTv.ts');
    expect(src).toMatch(/source: 'tvmaze'/);
    expect(src, 'NextAiring must carry observedAt').toMatch(/interface NextAiring \{[^}]*observedAt/s);
  });

  it('the watchmode sync writes the 0042 provenance columns it has ignored since they shipped', () => {
    const src = read('src/lib/watchmode/sync.ts');
    expect(src).toMatch(/source_key/);
    expect(src).toMatch(/retrieved_at/);
    expect(src).toMatch(/last_verified_at/);
  });

  it('the availability readers select the provenance instead of dropping it', () => {
    expect(read('src/lib/watchmode/cardAvailability.ts')).toMatch(/retrieved_at/);
  });

  it('the scoring path stops stamping "now" as a verification time', () => {
    const src = read('src/lib/titleData.ts');
    /* hydrateScoring called bare getWatchProviders — a TMDB-only read whose
       checkedAt is the moment of the request, presented as a verification
       time. It must go through resolveAvailability like the title page. */
    expect(src).toMatch(/hydrateScoring[\s\S]{0,400}resolveAvailability/);
  });
});

describe('programme→TMDB resolution refuses the coin flip', () => {
  it('packs/dna.ts uses pickMatch, never results[0]', () => {
    const src = read('src/lib/packs/dna.ts');
    expect(src).toMatch(/pickMatch/);
    expect(src, 'the popularity guess the tmdbMatch module documents as a defect').not.toMatch(/results\[0\]/);
  });
});
