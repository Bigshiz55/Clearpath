import { describe, it, expect } from 'vitest';
import { MAJOR_US_NETWORKS, isMajorUsNetwork, networkSlug } from './nationalNetworks';
import { matchNationalDay, buildProgrammeRow, buildAiringRow, toFetchedAiring, type TvmazeScheduleEpisode } from './tvmazeIngest';
import { reconcile, type FetchedAiring, type StoredAiring } from './reconcile';

// ---------------------------------------------------------------------------
// The national ingest's PURE surface — the shared allowlist, the station-key
// synthesis, and the reconciliation scoping that keeps it from ever deleting a
// curated Pack airing. No DB, no network.
// ---------------------------------------------------------------------------

function episode(over: Partial<TvmazeScheduleEpisode> = {}): TvmazeScheduleEpisode {
  return {
    id: 42, name: 'Cold Open', season: 3, number: 5,
    airdate: '2026-08-01', airtime: '20:00', airstamp: '2026-08-02T00:00:00+00:00',
    runtime: 60,
    show: {
      id: 900, name: 'A Major Network Show', type: 'Scripted', genres: ['Drama'],
      network: { name: 'ESPN' }, image: { medium: 'https://static.tvmaze.com/y.jpg' },
      summary: '<p>Broad national programming.</p>',
    },
    ...over,
  };
}

describe('isMajorUsNetwork', () => {
  it('accepts the broad national networks the live guide already keeps', () => {
    for (const name of ['ESPN', 'HBO', 'Discovery', 'ABC', 'AMC', 'USA Network', 'FX', 'History']) {
      expect(isMajorUsNetwork(name)).toBe(true);
    }
  });

  it('matches a prefixed variant (feed drift) but rejects an obscure regional net', () => {
    expect(isMajorUsNetwork('ABC News')).toBe(true); // startsWith 'abc'
    expect(isMajorUsNetwork('WKRP Cincinnati 12')).toBe(false);
    expect(isMajorUsNetwork('NestFlix Regional')).toBe(false);
  });

  it('is driven by the shared allowlist, not a private copy', () => {
    expect(MAJOR_US_NETWORKS).toContain('espn');
    expect(MAJOR_US_NETWORKS).toContain('abc');
  });
});

describe('networkSlug', () => {
  it('lowercases, trims, and collapses non-alphanumerics to single hyphens', () => {
    expect(networkSlug('USA Network')).toBe('usa-network');
    expect(networkSlug('A&E')).toBe('a-e');
    expect(networkSlug('E!')).toBe('e');
    expect(networkSlug('  Fox   News  ')).toBe('fox-news');
    expect(networkSlug('MGM+')).toBe('mgm');
  });
});

describe('matchNationalDay', () => {
  it('keeps every major-network airing and tags it with a tvmaze-net:<slug> station key', () => {
    const out = matchNationalDay([episode()], isMajorUsNetwork, networkSlug);
    expect(out).toHaveLength(1);
    expect(out[0]!.channel.key).toBe('tvmaze-net:espn');
    expect(out[0]!.channel.displayName).toBe('ESPN');
  });

  it('is BROADER than matchChannel — it keeps a network no curated Pack channel covers', () => {
    // ESPN is not a curated TVMAZE_CHANNELS entry; matchDay would drop it,
    // matchNationalDay keeps it.
    const out = matchNationalDay([episode({ show: { id: 1, name: 'Game', network: { name: 'ESPN' } } })], isMajorUsNetwork, networkSlug);
    expect(out).toHaveLength(1);
  });

  it('drops an airing whose network is not on the allowlist', () => {
    const out = matchNationalDay(
      [episode({ show: { id: 2, name: 'Local', network: { name: 'Some Tiny Regional Net' } } })],
      isMajorUsNetwork, networkSlug,
    );
    expect(out).toHaveLength(0);
  });

  it('falls back to webChannel name, and skips rows with no show or no network', () => {
    const web = matchNationalDay([episode({ show: { id: 3, name: 'Streamed', webChannel: { name: 'HBO' } } })], isMajorUsNetwork, networkSlug);
    expect(web[0]!.channel.key).toBe('tvmaze-net:hbo');
    expect(matchNationalDay([episode({ show: null })], isMajorUsNetwork, networkSlug)).toEqual([]);
    expect(matchNationalDay([episode({ show: { id: 4, name: 'No Net' } })], isMajorUsNetwork, networkSlug)).toEqual([]);
  });
});

describe('national row building (reuses the pure builders)', () => {
  it('classifies programme type and builds the shared provider-airing id, with premiere left unknown', () => {
    const [m] = matchNationalDay([episode()], isMajorUsNetwork, networkSlug);
    const programme = buildProgrammeRow(m!);
    expect(programme.programmeType).toBe('series');
    expect(programme.description).toBe('Broad national programming.');
    expect(programme.artworkUrl).toBe('https://static.tvmaze.com/y.jpg');

    // National rows skip the per-show premiere fan-out: originalAirdate is null,
    // so isPremiere/isRepeat are honestly unknown (null), never guessed.
    const row = buildAiringRow(m!, null);
    expect(row.stationKey).toBe('tvmaze-net:espn');
    expect(row.providerAiringId).toBe('tvmaze:42:2026-08-01');
    expect(row.isPremiere).toBeNull();
    expect(row.isRepeat).toBeNull();
  });

  it('encodes the broadcast date into the id so a rerun on another day is a distinct row', () => {
    const [a] = matchNationalDay([episode()], isMajorUsNetwork, networkSlug);
    const [b] = matchNationalDay([episode({ airdate: '2026-09-01', airstamp: '2026-09-02T00:00:00+00:00' })], isMajorUsNetwork, networkSlug);
    expect(buildAiringRow(a!, null).providerAiringId).toBe('tvmaze:42:2026-08-01');
    expect(buildAiringRow(b!, null).providerAiringId).toBe('tvmaze:42:2026-09-01');
    expect(buildAiringRow(a!, null).providerAiringId).not.toBe(buildAiringRow(b!, null).providerAiringId);
  });
});

describe('reconciliation scoping — national vs curated never cross-delete', () => {
  const windowStartUtcMs = Date.UTC(2026, 7, 1); // 2026-08-01T00:00Z
  const windowEndUtcMs = windowStartUtcMs + 3 * 86_400_000;
  const nowMs = windowStartUtcMs;

  const curatedStored: StoredAiring = {
    id: 'curated-airing', providerAiringId: 'tvmaze:1:2026-08-01',
    stationId: 'station-curated', programmeId: 'prog-curated',
    startAtUtc: '2026-08-01T20:00:00.000Z', endAtUtc: '2026-08-01T21:00:00.000Z',
    rawHash: 'h1', lastSeenAt: '2026-08-01T00:00:00.000Z',
  };
  const nationalStored: StoredAiring = {
    id: 'national-airing', providerAiringId: 'tvmaze:2:2026-08-01',
    stationId: 'station-natl', programmeId: 'prog-natl',
    startAtUtc: '2026-08-01T20:00:00.000Z', endAtUtc: '2026-08-01T21:00:00.000Z',
    rawHash: 'h2', lastSeenAt: '2026-08-01T00:00:00.000Z',
  };

  it('unscoped reconcile WOULD expire the curated row — this is the danger the scoping prevents', () => {
    // A national run with an empty fetch, if it read the curated row into its
    // `stored`, would expire it (complete fetch, in-window, absent from fetch).
    const dangerous = reconcile({
      lineupId: 'us-national', fetched: [], stored: [curatedStored, nationalStored],
      windowStartUtcMs, windowEndUtcMs, fetchComplete: true, nowMs,
    });
    expect(dangerous.expire).toContain('curated-airing');
  });

  it('scoping the stored read to national stations leaves curated rows entirely out of the plan', () => {
    // The writer scopes its stored-read with `.in(station_id, nationalStationIds)`.
    // Modeled here as a pre-filter: the curated row never enters reconcile.
    const nationalStationIds = new Set(['station-natl']);
    const scopedStored = [curatedStored, nationalStored].filter((s) => nationalStationIds.has(s.stationId));

    const natlFetched: FetchedAiring = {
      providerAiringId: 'tvmaze:2:2026-08-01', stationId: 'station-natl', programmeId: 'prog-natl',
      startAtUtc: '2026-08-01T20:00:00.000Z', endAtUtc: '2026-08-01T21:00:00.000Z', rawHash: 'h2',
    };
    const plan = reconcile({
      lineupId: 'us-national', fetched: [natlFetched], stored: scopedStored,
      windowStartUtcMs, windowEndUtcMs, fetchComplete: true, nowMs,
    });

    // The national row is recognized (unchanged); the curated row appears in NO
    // bucket at all — it was never read, so it can never be expired.
    expect(plan.unchanged).toContain('national-airing');
    expect(plan.expire).not.toContain('curated-airing');
    expect(plan.insert).toHaveLength(0);
    const allTouched = [...plan.expire, ...plan.unchanged, ...plan.update.map((u) => u.id), ...plan.insert.map((f) => f.providerAiringId)];
    expect(allTouched).not.toContain('curated-airing');
  });

  it('symmetrically, the curated reconcile scoped to curated stations never touches a national row', () => {
    const curatedStationIds = new Set(['station-curated']);
    const scopedStored = [curatedStored, nationalStored].filter((s) => curatedStationIds.has(s.stationId));
    const curatedFetched: FetchedAiring = {
      providerAiringId: 'tvmaze:1:2026-08-01', stationId: 'station-curated', programmeId: 'prog-curated',
      startAtUtc: '2026-08-01T20:00:00.000Z', endAtUtc: '2026-08-01T21:00:00.000Z', rawHash: 'h1',
    };
    const plan = reconcile({
      lineupId: 'us-national', fetched: [curatedFetched], stored: scopedStored,
      windowStartUtcMs, windowEndUtcMs, fetchComplete: true, nowMs,
    });
    expect(plan.unchanged).toContain('curated-airing');
    expect(plan.expire).not.toContain('national-airing');
  });
});

describe('national row → FetchedAiring for the reconcile input', () => {
  it('carries the synthesized station id and leaves premiere null (never a written row without a start)', () => {
    const [m] = matchNationalDay([episode()], isMajorUsNetwork, networkSlug);
    const row = buildAiringRow(m!, null);
    const fa = toFetchedAiring(row, 'station-uuid', 'programme-uuid');
    expect(fa).not.toBeNull();
    expect(fa!.stationId).toBe('station-uuid');
    expect(fa!.programmeId).toBe('programme-uuid');
    expect(fa!.isNew).toBeUndefined(); // null premiere → undefined, not persisted as a flag
    expect(fa!.providerAiringId).toBe('tvmaze:42:2026-08-01');

    const noStart = buildAiringRow(matchNationalDay([episode({ airstamp: null })], isMajorUsNetwork, networkSlug)[0]!, null);
    expect(toFetchedAiring(noStart, 's', 'p')).toBeNull();
  });
});
