import { describe, it, expect } from 'vitest';
import { dayLabel, dayOffset, isSameLocalDay, localIsoDate, longDayLabel } from './localDay';

/** Construct local wall-clock instants so these tests exercise the module's
 *  documented viewer-local contract in every host timezone. */
const localAt = (day: number, hour = 0, minute = 0) => new Date(2026, 6, day, hour, minute);

describe('which calendar day is that', () => {
  it('same day is 0, tomorrow 1, yesterday -1', () => {
    const now = localAt(28, 20);
    expect(dayOffset(localAt(28, 0, 5), now)).toBe(0);
    expect(dayOffset(localAt(29, 1), now)).toBe(1);
    expect(dayOffset(localAt(27, 23, 59), now)).toBe(-1);
  });

  it('isSameLocalDay agrees with a zero offset', () => {
    const now = localAt(28, 20);
    expect(isSameLocalDay(localAt(28), now)).toBe(true);
    expect(isSameLocalDay(localAt(29), now)).toBe(false);
  });
});

/**
 * THE DST BUG. Every surface used to compute tomorrow as `now + 86_400_000`
 * and compare `toDateString()`. A spring-forward local day is 23 hours long,
 * so from late evening that arithmetic lands on the day AFTER tomorrow and
 * "Tomorrow" becomes unreachable. `dayOffset` compares calendar fields, so the
 * length of the day cannot change the answer.
 */
describe('daylight saving cannot move the day', () => {
  it('a 23-hour day still has exactly one tomorrow', () => {
    // 2026-03-08 is US spring-forward. Work in calendar terms: whatever the
    // zone, the day after the 8th is the 9th and the offset is 1.
    const late = new Date(2026, 2, 8, 23, 30); // local 11:30pm on the short day
    const next = new Date(2026, 2, 9, 9, 0); // local 9am the next morning
    expect(dayOffset(next, late)).toBe(1);
    expect(dayLabel(next, late.getTime())).toBe('Tomorrow');
    // The naive form is what shipped, and it is wrong here in a DST zone:
    // asserting our own answer is stable is the point.
    expect(dayOffset(new Date(2026, 2, 8, 6, 0), late)).toBe(0);
  });

  it('a 25-hour day does not gain a second today', () => {
    const late = new Date(2026, 10, 1, 23, 30); // US fall-back day
    expect(dayLabel(new Date(2026, 10, 2, 8, 0), late.getTime())).toBe('Tomorrow');
    expect(dayLabel(new Date(2026, 10, 1, 1, 30), late.getTime())).toBe('Today');
  });
});

describe('the words a viewer reads', () => {
  const now = localAt(28, 20).getTime();

  it('names today, tomorrow and yesterday', () => {
    expect(dayLabel(localAt(28, 22), now)).toBe('Today');
    expect(dayLabel(localAt(29, 2), now)).toBe('Tomorrow');
    expect(dayLabel(localAt(27, 22), now)).toBe('Yesterday');
  });

  it('uses a weekday inside the week and a date beyond it', () => {
    expect(dayLabel(localAt(31, 20), now)).toMatch(/^[A-Z][a-z]{2}$/); // Fri
    expect(dayLabel(new Date(2026, 7, 20, 20), now)).toMatch(/Aug/);
  });

  it('an unusable stamp prints nothing rather than "Invalid Date"', () => {
    expect(dayLabel('not-a-date', now)).toBe('');
    expect(longDayLabel('not-a-date', now)).toBe('');
  });
});

/**
 * THE HEADER AND THE LISTINGS CANNOT DISAGREE. The On TV header was formatted
 * on the server in UTC while the rows said "Today" in the browser's zone — at
 * 6pm in California those are different days. The long form now carries the
 * relative word AND the date, from the same function, so they are one answer.
 */
describe('the long header form', () => {
  const now = localAt(28, 20).getTime();

  it('says Today AND the date, so the two can never contradict', () => {
    const s = longDayLabel(localAt(28, 21), now);
    expect(s).toContain('Today');
    expect(s).toContain('Jul 28');
  });

  it('says Tomorrow and that date', () => {
    const s = longDayLabel(localAt(29, 1), now);
    expect(s).toContain('Tomorrow');
    expect(s).toContain('Jul 29');
  });

  it('a further-out day is just the date, with no relative word to be wrong', () => {
    const s = longDayLabel(new Date(2026, 7, 4, 12), now);
    expect(s).not.toContain('Today');
    expect(s).not.toContain('Tomorrow');
    expect(s).toContain('Aug 4');
  });
});

/**
 * `localIsoDate` exists because `date.toISOString().slice(0, 10)` reads the
 * UTC day — several client components (premiere-calendar month fallback)
 * used that for "today" while running in the browser, which is wrong for
 * every viewer whose local day has not yet caught up to (or has already
 * passed) UTC's.
 */
describe('localIsoDate — the viewer\'s own calendar day, not UTC\'s', () => {
  it('formats a given instant using its local calendar fields, not toISOString', () => {
    const d = new Date(2026, 6, 28, 23, 30); // local Jul 28, 11:30pm — whatever the runtime's zone is
    expect(localIsoDate(d.getTime())).toBe('2026-07-28');
  });

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5); // local Jan 5
    expect(localIsoDate(d.getTime())).toBe('2026-01-05');
  });

  it('defaults to the current instant when no argument is given', () => {
    const now = Date.now();
    expect(localIsoDate()).toBe(localIsoDate(now));
  });
});
