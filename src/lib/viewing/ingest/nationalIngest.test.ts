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

  /* DELIBERATELY INVERTED — this test used to assert the defect.
     It read `expect(isMajorUsNetwork('ABC News')).toBe(true); // startsWith
     'abc'`, describing prefix matching as tolerance for "feed drift". That
     same rule is what put NBC.COM, ABC NEWS LIVE and CBS NEWS on the guide as
     television channels. A name we have not deliberately claimed is not a
     channel we carry; drift is handled by adding an alias to the registry,
     which is a decision someone makes rather than a string coincidence. */
  it('does NOT admit a longer name just because it starts with a carried one', () => {
    expect(isMajorUsNetwork('ABC News')).toBe(false);
    expect(isMajorUsNetwork('NBC.com')).toBe(false);
    expect(isMajorUsNetwork('Foxtel')).toBe(false);
    expect(isMajorUsNetwork('WKRP Cincinnati 12')).toBe(false);
    expect(isMajorUsNetwork('NestFlix Regional')).toBe(false);
  });

  it('still accepts the real spellings the source sends, via explicit aliases', () => {
    for (const name of ['Fox News Channel', 'Fox Business Network', 'MS NOW', 'NewsNation', 'NFL Network']) {
      expect(isMajorUsNetwork(name), name).toBe(true);
    }
  });

  it('is driven by the shared registry, not a private copy', () => {
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

  /* DELIBERATELY INVERTED — this asserted the collapse that caused the bug.
     It required a show whose only channel is the WEB feed "HBO" to become the
     linear station `tvmaze-net:hbo`, i.e. a streaming feed filling a
     television channel's schedule. That is precisely how NBC.COM reached the
     guide. A web feed is now refused as a channel however it is named. */
  it('NEVER promotes a webChannel to a linear station, and skips rows with no network', () => {
    const web = matchNationalDay(
      [episode({ show: { id: 3, name: 'Streamed', webChannel: { name: 'HBO' } } })],
      isMajorUsNetwork,
      networkSlug,
    );
    expect(web, 'a web feed became a linear channel').toEqual([]);

    for (const name of ['NBC.com', 'ABC News Live', 'CBS News']) {
      const rows = matchNationalDay(
        [episode({ show: { id: 9, name: 'Streamed', webChannel: { name } } })],
        isMajorUsNetwork,
        networkSlug,
      );
      expect(rows, `${name} became a channel`).toEqual([]);
    }

    expect(matchNationalDay([episode({ show: null })], isMajorUsNetwork, networkSlug)).toEqual([]);
    expect(matchNationalDay([episode({ show: { id: 4, name: 'No Net' } })], isMajorUsNetwork, networkSlug)).toEqual([]);
  });

  it('one broadcaster under two spellings produces ONE station, not two', () => {
    const a = matchNationalDay(
      [episode({ show: { id: 11, name: 'News', network: { name: 'Fox News' } } })],
      isMajorUsNetwork,
      networkSlug,
    )[0]!;
    const b = matchNationalDay(
      [episode({ show: { id: 12, name: 'News', network: { name: 'Fox News Channel' } } })],
      isMajorUsNetwork,
      networkSlug,
    )[0]!;
    expect(a.channel.key).toBe(b.channel.key);
    expect(a.channel.displayName).toBe(b.channel.displayName);
  });

  it('SKIPS a network the curated Pack ingest already owns (no double-write / no id collision)', () => {
    // Lifetime is a curated TVMAZE_CHANNELS entry AND passes the national
    // allowlist. The curated ingest owns it; the national ingest must skip it
    // so the same airing is never written twice (which duplicated it in the
    // guide and collided on tv_airings' (lineup_id, provider_airing_id) index —
    // the production failure this guards against).
    const out = matchNationalDay(
      [episode({ show: { id: 5, name: 'A Lifetime Movie', network: { name: 'Lifetime' } } })],
      isMajorUsNetwork, networkSlug,
    );
    expect(out).toHaveLength(0);
    // Oxygen and Investigation Discovery are likewise curated crime channels.
    expect(matchNationalDay([episode({ show: { id: 6, name: 'Snapped', network: { name: 'Oxygen' } } })], isMajorUsNetwork, networkSlug)).toHaveLength(0);
    expect(matchNationalDay([episode({ show: { id: 7, name: 'Case', network: { name: 'Investigation Discovery' } } })], isMajorUsNetwork, networkSlug)).toHaveLength(0);
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
    // so isPremiere/isRepeat are honestly unknown (null), never guessed. The
    // writer builds them station-scoped (see the syndication test below).
    const row = buildAiringRow(m!, null, { stationScopedId: true });
    expect(row.stationKey).toBe('tvmaze-net:espn');
    expect(row.providerAiringId).toBe('tvmaze:42:2026-08-01:tvmaze-net:espn');
    expect(row.isPremiere).toBeNull();
    expect(row.isRepeat).toBeNull();
  });

  it('station-scoped id keeps the SAME syndicated episode on two networks as two distinct rows', () => {
    // The production failure: a movie airing the same day on two national
    // networks shared `tvmaze:<id>:<date>` and collided on the
    // (lineup_id, provider_airing_id) uniqueness index. Folding the station key
    // into the id makes each network's airing distinct.
    const onEspn = matchNationalDay([episode()], isMajorUsNetwork, networkSlug)[0]!;
    const onTnt = matchNationalDay(
      [episode({ show: { id: 900, name: 'A Major Network Show', type: 'Scripted', genres: ['Drama'], network: { name: 'TNT' } } })],
      isMajorUsNetwork, networkSlug,
    )[0]!;
    const idEspn = buildAiringRow(onEspn, null, { stationScopedId: true }).providerAiringId;
    const idTnt = buildAiringRow(onTnt, null, { stationScopedId: true }).providerAiringId;
    expect(idEspn).toBe('tvmaze:42:2026-08-01:tvmaze-net:espn');
    expect(idTnt).toBe('tvmaze:42:2026-08-01:tvmaze-net:tnt');
    expect(idEspn).not.toBe(idTnt);
    // And a national id is never equal to the curated (unscoped) id for the
    // same episode, so the two ingests can never collide either.
    expect(idEspn).not.toBe(buildAiringRow(onEspn, null).providerAiringId);
  });

  it('encodes the broadcast date into the id so a rerun on another day is a distinct row', () => {
    const [a] = matchNationalDay([episode()], isMajorUsNetwork, networkSlug);
    const [b] = matchNationalDay([episode({ airdate: '2026-09-01', airstamp: '2026-09-02T00:00:00+00:00' })], isMajorUsNetwork, networkSlug);
    expect(buildAiringRow(a!, null, { stationScopedId: true }).providerAiringId).toBe('tvmaze:42:2026-08-01:tvmaze-net:espn');
    expect(buildAiringRow(b!, null, { stationScopedId: true }).providerAiringId).toBe('tvmaze:42:2026-09-01:tvmaze-net:espn');
    expect(buildAiringRow(a!, null, { stationScopedId: true }).providerAiringId).not.toBe(buildAiringRow(b!, null, { stationScopedId: true }).providerAiringId);
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
