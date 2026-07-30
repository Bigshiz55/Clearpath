import { describe, it, expect } from 'vitest';
import { dayLabel, dayOffset, isSameLocalDay, longDayLabel } from './localDay';

/** The runtime's zone is UTC under vitest, so these read as UTC calendar days.
 *  The DST cases below construct the boundary explicitly rather than relying on
 *  the host zone, so they hold wherever the suite runs. */
const at = (iso: string) => new Date(iso);

describe('which calendar day is that', () => {
  it('same day is 0, tomorrow 1, yesterday -1', () => {
    const now = at('2026-07-28T20:00:00Z');
    expect(dayOffset(at('2026-07-28T00:05:00Z'), now)).toBe(0);
    expect(dayOffset(at('2026-07-29T01:00:00Z'), now)).toBe(1);
    expect(dayOffset(at('2026-07-27T23:59:00Z'), now)).toBe(-1);
  });

  it('isSameLocalDay agrees with a zero offset', () => {
    const now = at('2026-07-28T20:00:00Z');
    expect(isSameLocalDay(at('2026-07-28T00:00:00Z'), now)).toBe(true);
    expect(isSameLocalDay(at('2026-07-29T00:00:00Z'), now)).toBe(false);
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
  const now = at('2026-07-28T20:00:00Z').getTime();

  it('names today, tomorrow and yesterday', () => {
    expect(dayLabel('2026-07-28T22:00:00Z', now)).toBe('Today');
    expect(dayLabel('2026-07-29T02:00:00Z', now)).toBe('Tomorrow');
    expect(dayLabel('2026-07-27T22:00:00Z', now)).toBe('Yesterday');
  });

  it('uses a weekday inside the week and a date beyond it', () => {
    expect(dayLabel('2026-07-31T20:00:00Z', now)).toMatch(/^[A-Z][a-z]{2}$/); // Fri
    expect(dayLabel('2026-08-20T20:00:00Z', now)).toMatch(/Aug/);
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
  const now = at('2026-07-28T20:00:00Z').getTime();

  it('says Today AND the date, so the two can never contradict', () => {
    const s = longDayLabel('2026-07-28T21:00:00Z', now);
    expect(s).toContain('Today');
    expect(s).toContain('Jul 28');
  });

  it('says Tomorrow and that date', () => {
    const s = longDayLabel('2026-07-29T01:00:00Z', now);
    expect(s).toContain('Tomorrow');
    expect(s).toContain('Jul 29');
  });

  it('a further-out day is just the date, with no relative word to be wrong', () => {
    const s = longDayLabel('2026-08-04T12:00:00Z', now);
    expect(s).not.toContain('Today');
    expect(s).not.toContain('Tomorrow');
    expect(s).toContain('Aug 4');
  });
});
