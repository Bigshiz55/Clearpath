import { describe, expect, it } from 'vitest';
import { SECTION_CAP, selectWhatsOnToday } from './whatsOnToday';
import type { Airing } from '@/lib/onTv';

/**
 * WHAT'S ON TODAY — the section predicates are provider facts, never guesses:
 * Movies = provider-classified showType only; New & Premieres = the provider
 * flag only; Worth Watching = titles the existing engine already scored.
 * Pure selection over STORED rows: nothing here can fetch anything.
 */

// 2026-08-15T18:00:00Z = 14:00 EDT — mid-afternoon of the Eastern broadcast day.
const NOW = Date.parse('2026-08-15T18:00:00Z');
let seq = 0;

const a = (over: Partial<Airing> & Pick<Airing, 'showName' | 'airstamp'>): Airing => ({
  id: ++seq,
  time: '12:00',
  minutes: 720,
  runtime: 60,
  network: `Chan ${seq}`,
  showId: 5000 + seq,
  episodeName: null,
  season: null,
  number: null,
  showType: 'Scripted',
  genres: [],
  rating: null,
  image: null,
  summary: null,
  imdb: null,
  ...over,
});

describe('selectWhatsOnToday', () => {
  it('On Now requires a provable runtime, exactly like the guide', () => {
    const rows = [
      a({ showName: 'Running Film', airstamp: '2026-08-15T17:30:00Z', runtime: 120, showType: 'Movie' }),
      a({ showName: 'Runtime-less', airstamp: '2026-08-15T17:30:00Z', runtime: null }),
      a({ showName: 'Already Over', airstamp: '2026-08-15T16:00:00Z', runtime: 60 }),
    ];
    const s = selectWhatsOnToday(rows, NOW);
    expect(s.onNow.map((x) => x.showName)).toEqual(['Running Film']);
  });

  it('Movies Today is the provider classification ONLY — a 3-hour drama is not a movie', () => {
    const rows = [
      a({ showName: 'Tonight Film', airstamp: '2026-08-15T23:00:00Z', showType: 'Movie' }),
      a({ showName: 'Long Drama', airstamp: '2026-08-15T20:00:00Z', runtime: 180, showType: 'Scripted' }),
      a({ showName: 'Yesterday Film', airstamp: '2026-08-14T23:00:00Z', showType: 'Movie' }),
    ];
    const s = selectWhatsOnToday(rows, NOW);
    expect(s.moviesToday.map((x) => x.showName)).toEqual(['Tonight Film']);
  });

  it('Tonight = Eastern evening (19:00+) still ahead; Sports = classification only', () => {
    const rows = [
      a({ showName: 'Evening Game', airstamp: '2026-08-15T23:30:00Z', showType: 'Sports' }),
      a({ showName: 'Afternoon Game', airstamp: '2026-08-15T19:00:00Z', showType: 'Sports' }), // 15:00 EDT
      a({ showName: 'Evening Drama', airstamp: '2026-08-16T01:00:00Z' }), // 21:00 EDT, same broadcast day
    ];
    const s = selectWhatsOnToday(rows, NOW);
    expect(s.tonight.map((x) => x.showName)).toEqual(['Evening Game', 'Evening Drama']);
    // Sections are start-ordered: the afternoon game airs first.
    expect(s.sportsToday.map((x) => x.showName)).toEqual(['Afternoon Game', 'Evening Game']);
  });

  it('New & Premieres reads the provider flag only — never inferred', () => {
    const rows = [
      a({ showName: 'Flagged Premiere', airstamp: '2026-08-15T22:00:00Z', isPremiere: true }),
      a({ showName: 'Season Opener By Name', airstamp: '2026-08-15T22:30:00Z', episodeName: 'Series Premiere!' }),
      a({ showName: 'Unknown Flag', airstamp: '2026-08-15T23:00:00Z', isPremiere: null }),
    ];
    const s = selectWhatsOnToday(rows, NOW);
    expect(s.newAndPremieres.map((x) => x.showName)).toEqual(['Flagged Premiere']);
  });

  it('Worth Watching carries ONLY engine-scored titles, ranked by the existing score', () => {
    const rows = [
      a({ showName: 'Scored High', airstamp: '2026-08-15T22:00:00Z', match: 91 }),
      a({ showName: 'Scored Low', airstamp: '2026-08-15T21:00:00Z', match: 55 }),
      a({ showName: 'Unmatched', airstamp: '2026-08-15T20:00:00Z' }), // valid guide entry, no invented score
    ];
    const s = selectWhatsOnToday(rows, NOW);
    expect(s.worthWatching.map((x) => x.showName)).toEqual(['Scored High', 'Scored Low']);
  });

  it('dedupes the east/west double and caps every section', () => {
    // Earlier than every filler row, so the cap can never slice the pair away
    // before the dedupe claim is tested.
    const dupes = [
      a({ showName: 'Twice Carried', airstamp: '2026-08-15T20:00:00Z', showType: 'Movie', network: 'AMC' }),
      a({ showName: 'Twice Carried', airstamp: '2026-08-15T20:00:00Z', showType: 'Movie', network: 'AMC West' }),
    ];
    const many = Array.from({ length: SECTION_CAP + 5 }, (_, i) =>
      a({ showName: `Film ${i}`, airstamp: `2026-08-15T21:${String(10 + i).slice(0, 2)}:00Z`, showType: 'Movie' }),
    );
    const s = selectWhatsOnToday([...dupes, ...many], NOW);
    expect(s.moviesToday.filter((x) => x.showName === 'Twice Carried')).toHaveLength(1);
    expect(s.moviesToday.length).toBeLessThanOrEqual(SECTION_CAP);
  });

  it('an empty window yields empty sections — nothing invented, nothing padded', () => {
    const s = selectWhatsOnToday([], NOW);
    expect(Object.values(s).every((rows) => rows.length === 0)).toBe(true);
  });
});
