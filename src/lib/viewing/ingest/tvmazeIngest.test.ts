import { describe, it, expect } from 'vitest';
import {
  classifyProgrammeType, premiereStatusFor, matchDay, buildProgrammeRow, buildAiringRow, toFetchedAiring,
  type TvmazeScheduleEpisode,
} from './tvmazeIngest';

function episode(over: Partial<TvmazeScheduleEpisode> = {}): TvmazeScheduleEpisode {
  return {
    id: 1, name: 'Pilot', season: 1, number: 1,
    airdate: '2026-08-01', airtime: '20:00', airstamp: '2026-08-02T00:00:00+00:00',
    runtime: 60,
    show: {
      id: 100, name: 'Mystery 101', type: 'scripted', genres: ['Mystery'],
      network: { name: 'Hallmark Mystery' }, image: { medium: 'https://static.tvmaze.com/x.jpg' },
      summary: '<p>A cozy mystery.</p>',
    },
    ...over,
  };
}

describe('classifyProgrammeType', () => {
  it('maps TVmaze type/genre to the documented programme_type vocabulary', () => {
    expect(classifyProgrammeType({ type: 'Movie', genres: [] })).toBe('movie');
    expect(classifyProgrammeType({ type: 'Sports', genres: [] })).toBe('sports');
    expect(classifyProgrammeType({ type: 'News', genres: [] })).toBe('news');
    expect(classifyProgrammeType({ type: 'Scripted', genres: ['Family'] })).toBe('kids');
    expect(classifyProgrammeType({ type: 'Scripted', genres: ['Drama'] })).toBe('series');
    expect(classifyProgrammeType({ type: 'Talk Show', genres: [] })).toBe('special');
  });
});

describe('premiereStatusFor', () => {
  it('marks a same-date broadcast as a premiere', () => {
    expect(premiereStatusFor('2026-08-01', '2026-08-01')).toEqual({ isPremiere: true, isRepeat: false });
  });

  it('marks a later broadcast than the original airdate as a repeat', () => {
    expect(premiereStatusFor('2026-09-01', '2026-08-01')).toEqual({ isPremiere: false, isRepeat: true });
  });

  it('leaves it null, with a reason, when the original airdate is unknown', () => {
    const r = premiereStatusFor('2026-08-01', null);
    expect(r.isPremiere).toBeNull();
    expect(r.isRepeat).toBeNull();
    expect(r.reason).toMatch(/unavailable/);
  });

  it('leaves it null when there is no broadcast airdate at all', () => {
    const r = premiereStatusFor(null, '2026-08-01');
    expect(r.isPremiere).toBeNull();
    expect(r.reason).toMatch(/no broadcast airdate/);
  });

  it('leaves it null (not guessed) when the broadcast precedes the recorded original', () => {
    const r = premiereStatusFor('2026-07-01', '2026-08-01');
    expect(r.isPremiere).toBeNull();
    expect(r.isRepeat).toBeNull();
  });
});

describe('matchDay', () => {
  it('matches a configured network-mode channel', () => {
    const out = matchDay([episode()]);
    expect(out).toHaveLength(1);
    expect(out[0]!.channel.key).toBe('hallmark_mystery');
  });

  it('does not match a network that is not configured', () => {
    const out = matchDay([episode({ show: { id: 1, name: 'X', network: { name: 'ESPN' } } })]);
    expect(out).toHaveLength(0);
  });

  it('matches a show-mode channel only for the exact show, not the whole network', () => {
    const dateline = episode({
      id: 2,
      show: { id: 200, name: 'Dateline NBC', network: { name: 'NBC' } },
    });
    const otherNbc = episode({
      id: 3,
      show: { id: 201, name: 'Some Other NBC Show', network: { name: 'NBC' } },
    });
    const out = matchDay([dateline, otherNbc]);
    expect(out.map((m) => m.channel.key)).toEqual(['dateline_nbc']);
  });

  it('excludes 48 Hours spinoffs by exact name, not substring', () => {
    const real = episode({ id: 4, show: { id: 300, name: '48 Hours', network: { name: 'CBS' } } });
    const spinoff = episode({ id: 5, show: { id: 301, name: '48 Hours: Suspicion', network: { name: 'CBS' } } });
    const out = matchDay([real, spinoff]);
    expect(out.map((m) => m.channel.key)).toEqual(['48_hours_cbs']);
  });

  it('skips a row with no show or no network/webChannel', () => {
    expect(matchDay([episode({ show: null })])).toEqual([]);
    expect(matchDay([episode({ show: { id: 9, name: 'No Network' } })])).toEqual([]);
  });
});

describe('buildProgrammeRow', () => {
  it('strips HTML from the summary and hotlinks the TVmaze image URL unchanged', () => {
    const [m] = matchDay([episode()]);
    const row = buildProgrammeRow(m!);
    expect(row.description).toBe('A cozy mystery.');
    expect(row.artworkUrl).toBe('https://static.tvmaze.com/x.jpg');
    expect(row.programmeType).toBe('series');
  });
});

describe('buildAiringRow', () => {
  it('encodes both episode id and broadcast date into providerAiringId, so a rerun on a different date is a distinct id', () => {
    const [m] = matchDay([episode()]);
    const premiere = buildAiringRow(m!, '2026-08-01');
    expect(premiere.providerAiringId).toBe('tvmaze:1:2026-08-01');
    expect(premiere.isPremiere).toBe(true);

    const [m2] = matchDay([episode({ airdate: '2026-09-01', airstamp: '2026-09-02T00:00:00+00:00' })]);
    const rerun = buildAiringRow(m2!, '2026-08-01');
    expect(rerun.providerAiringId).toBe('tvmaze:1:2026-09-01');
    expect(rerun.isPremiere).toBe(false);
    expect(rerun.isRepeat).toBe(true);
    expect(rerun.providerAiringId).not.toBe(premiere.providerAiringId);
  });

  it('stores a row as incomplete, never with an invented end time, when TVmaze gives no usable start', () => {
    const [m] = matchDay([episode({ airstamp: null })]);
    const row = buildAiringRow(m!, null);
    expect(row.startAtUtc).toBeNull();
    expect(row.isComplete).toBe(false);
  });
});

describe('toFetchedAiring', () => {
  it('returns null rather than a row with no start — never written to tv_airings', () => {
    const [m] = matchDay([episode({ airstamp: null })]);
    const row = buildAiringRow(m!, null);
    expect(toFetchedAiring(row, 'station-uuid', 'programme-uuid')).toBeNull();
  });

  it('carries premiere/repeat through as isNew/isRepeat for the writer to persist', () => {
    const [m] = matchDay([episode()]);
    const row = buildAiringRow(m!, '2026-08-01');
    const fa = toFetchedAiring(row, 'station-uuid', 'programme-uuid');
    expect(fa).not.toBeNull();
    expect(fa!.isNew).toBe(true);
    expect(fa!.isRepeat).toBe(false);
    expect(fa!.stationId).toBe('station-uuid');
    expect(fa!.programmeId).toBe('programme-uuid');
  });
});
