import { describe, it, expect } from 'vitest';
import { showKey, groupByShow, dedupeByShow, repeatNote } from './tvHighlights';

const a = (id: number, showName: string, minutes: number, tmdbId: number | null = null) => ({
  id, showName, minutes, tmdbId, mediaType: 'tv' as const,
});

/**
 * THE SCREENSHOT: "World War II with Tom Hanks" at 8:00 PM and again at 9:00 PM,
 * both in a six-card strip. Two of six slots, one programme.
 */
describe('one card per show', () => {
  const tonight = [
    a(1, 'World War II with Tom Hanks', 20 * 60),
    a(2, 'World War II with Tom Hanks', 21 * 60),
    a(3, 'POV', 22 * 60),
    a(4, 'Shark Week', 20 * 60),
  ];

  it('THE REGRESSION: a double bill takes one slot, not two', () => {
    const out = dedupeByShow(tonight);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.showName)).toEqual(['World War II with Tom Hanks', 'POV', 'Shark Week']);
  });

  it('keeps the EARLIEST airing — the one you can still catch from the start', () => {
    expect(dedupeByShow(tonight)[0]!.minutes).toBe(20 * 60);
    // Even when the later airing came first in the input.
    const reversed = [a(2, 'WWII', 21 * 60), a(1, 'WWII', 20 * 60)];
    expect(dedupeByShow(reversed)[0]!.id).toBe(1);
  });

  it('does not resequence the strip — the caller\'s sort survives', () => {
    // Input is rating-sorted; deduping must not reshuffle it into time order.
    const ranked = [a(3, 'POV', 22 * 60), a(1, 'WWII', 20 * 60), a(2, 'WWII', 21 * 60), a(4, 'Shark Week', 20 * 60)];
    expect(dedupeByShow(ranked).map((x) => x.showName)).toEqual(['POV', 'WWII', 'Shark Week']);
  });

  it('the extra showings are kept, not thrown away', () => {
    const groups = groupByShow(tonight);
    expect(groups[0]!.others.map((o) => o.minutes)).toEqual([21 * 60]);
    expect(groups[1]!.others).toHaveLength(0);
  });

  it('leaves a schedule with no repeats exactly as it was', () => {
    const distinct = [a(1, 'A', 60), a(2, 'B', 120), a(3, 'C', 180)];
    expect(dedupeByShow(distinct)).toEqual(distinct);
  });

  it('handles an empty schedule', () => {
    expect(dedupeByShow([])).toEqual([]);
    expect(groupByShow([])).toEqual([]);
  });
});

describe('what counts as the same show', () => {
  it('a resolved TMDB id beats the name', () => {
    // Same programme, two feed spellings — one id, so one card.
    expect(dedupeByShow([a(1, 'POV', 60, 99), a(2, 'P.O.V.', 120, 99)])).toHaveLength(1);
  });

  it('different shows with the same id-less name still collapse — the feed repeats itself', () => {
    expect(showKey(a(1, 'P.O.V.', 60))).toBe(showKey(a(2, 'POV', 120)));
    expect(showKey(a(1, "Bob's Burgers", 60))).toBe(showKey(a(2, 'Bobs Burgers', 120)));
  });

  it('different shows stay separate', () => {
    expect(showKey(a(1, 'POV', 60))).not.toBe(showKey(a(2, 'Shark Week', 60)));
    expect(showKey(a(1, 'X', 60, 1))).not.toBe(showKey(a(2, 'X', 60, 2)));
  });

  it('an unnamed airing falls back to its own id rather than merging with every other blank', () => {
    expect(showKey(a(1, '', 60))).not.toBe(showKey(a(2, '', 60)));
  });

  it('a movie and a show with the same TMDB number are not the same title', () => {
    const movie = { ...a(1, 'Dune', 60, 7), mediaType: 'movie' as const };
    const tv = { ...a(2, 'Dune', 60, 7), mediaType: 'tv' as const };
    expect(showKey(movie)).not.toBe(showKey(tv));
  });
});

describe('telling the viewer about the other showings', () => {
  it('says nothing when there is nothing to say', () => {
    expect(repeatNote([])).toBeNull();
  });

  it('names the second showing', () => {
    expect(repeatNote(['9:00 PM'])).toBe('Also at 9:00 PM');
  });

  it('names two', () => {
    expect(repeatNote(['9:00 PM', '11:00 PM'])).toBe('Also at 9:00 PM, 11:00 PM');
  });

  it('counts the rest rather than listing them all', () => {
    expect(repeatNote(['9:00 PM', '10:00 PM', '11:00 PM', '1:00 AM'])).toBe('Also at 9:00 PM, 10:00 PM +2 more');
  });

  it('an unformattable time is not rendered as a blank entry', () => {
    // fmtTime returns null when the airstamp will not parse; a card must never
    // print "Also at , 9:00 PM".
    expect(repeatNote([null, '9:00 PM'])).toBe('Also at 9:00 PM');
    expect(repeatNote([null, undefined, ''])).toBeNull();
  });
});
