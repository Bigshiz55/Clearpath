import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { airingClock, airingStatus, clockFromProviderTime, displayClock, liveLabel, stillJoinable } from './clock';

// 2026-07-28T03:42:00Z. In Eastern (UTC-4 in July) that is 11:42 PM the night
// before; on the West Coast it is 8:42 PM. The provider hands us the Eastern
// clock string, which is what the guide used to print to everybody.
const STAMP = '2026-07-28T03:42:00.000Z';

describe('airingClock', () => {
  it('renders the instant in the zone it is asked for', () => {
    expect(airingClock(STAMP, 'America/New_York')).toBe('11:42 PM');
    expect(airingClock(STAMP, 'America/Los_Angeles')).toBe('8:42 PM');
    expect(airingClock(STAMP, 'UTC')).toBe('3:42 AM');
  });

  it('THE BUG: a west-coast viewer sees an evening show, not a 3am one', () => {
    // The pre-formatted provider string is Eastern. Printing it to a Pacific
    // viewer described a show forty minutes away as one that already happened.
    expect(clockFromProviderTime('03:42')).toBe('3:42 AM');
    expect(airingClock(STAMP, 'America/Los_Angeles')).toBe('8:42 PM');
  });

  it('is null rather than wrong when the instant is unusable', () => {
    expect(airingClock(null)).toBeNull();
    expect(airingClock('')).toBeNull();
    expect(airingClock('not a date')).toBeNull();
    expect(airingClock(STAMP, 'Not/AZone')).toBeNull();
  });
});

describe('clockFromProviderTime', () => {
  it('reads a bare HH:MM', () => {
    expect(clockFromProviderTime('20:00')).toBe('8:00 PM');
    expect(clockFromProviderTime('00:30')).toBe('12:30 AM');
    expect(clockFromProviderTime('12:05')).toBe('12:05 PM');
  });

  it('rejects anything that is not one', () => {
    expect(clockFromProviderTime('')).toBeNull();
    expect(clockFromProviderTime(null)).toBeNull();
    expect(clockFromProviderTime('tonight')).toBeNull();
    expect(clockFromProviderTime('29:00')).toBeNull();
  });
});

describe('displayClock', () => {
  it('prefers the viewer’s own clock over the network’s', () => {
    expect(displayClock(STAMP, '23:42', 'America/Los_Angeles')).toBe('8:42 PM');
  });

  it('falls back to the network time only when there is no instant', () => {
    expect(displayClock(null, '20:00', 'America/Los_Angeles')).toBe('8:00 PM');
  });

  it('is null when neither is usable, so the caller can say so', () => {
    expect(displayClock(null, null)).toBeNull();
  });
});

describe('airingStatus', () => {
  const start = Date.parse(STAMP);
  const min = (n: number) => start + n * 60_000;

  it('is upcoming before it begins', () => {
    expect(airingStatus(STAMP, 120, min(-5))).toEqual({ state: 'upcoming', startedMinutesAgo: 0 });
  });

  it('THE OTHER HALF OF THE BUG: something already running is live, not upcoming', () => {
    // The windowed guide includes in-progress airings on purpose, and then
    // printed their start time under a "coming on" heading — so a film that
    // began eighteen minutes ago looked like a clock error.
    expect(airingStatus(STAMP, 120, min(18))).toEqual({ state: 'live', startedMinutesAgo: 18 });
  });

  it('is ended once the runtime has elapsed', () => {
    expect(airingStatus(STAMP, 120, min(121)).state).toBe('ended');
  });

  it('never claims something ended when the runtime is unknown', () => {
    expect(airingStatus(STAMP, null, min(600)).state).toBe('live');
  });

  it('treats an unusable stamp as upcoming rather than guessing', () => {
    expect(airingStatus(null, 120, min(50))).toEqual({ state: 'upcoming', startedMinutesAgo: 0 });
  });
});

describe('liveLabel', () => {
  it('says how far in it already is', () => {
    expect(liveLabel(0)).toBe('On now');
    expect(liveLabel(18)).toBe('On now · 18m in');
    expect(liveLabel(60)).toBe('On now · 1h in');
    expect(liveLabel(95)).toBe('On now · 1h 35m in');
  });
});

/**
 * STILL WORTH TUNING INTO? The 3h look-back that catches in-progress airings
 * also caught movies in their final scene — a "Movies on now" tab led with a
 * western that started at 11:45 AM at half past three. The schedule says it's
 * on; a recommendation list must not lead with its ending.
 */
describe('stillJoinable', () => {
  const start = Date.parse(STAMP);
  const min = (n: number) => start + n * 60_000;

  it('anything not yet started is always listable', () => {
    expect(stillJoinable(STAMP, 120, min(-5))).toBe(true);
    expect(stillJoinable(null, 120, min(50))).toBe(true); // unusable stamp → upcoming
  });

  it('anything ended never is', () => {
    expect(stillJoinable(STAMP, 120, min(121))).toBe(false);
  });

  it('a show a few minutes in is worth joining', () => {
    expect(stillJoinable(STAMP, 60, min(18))).toBe(true);
  });

  it('a long movie forgives more lateness — a third of the runtime', () => {
    expect(stillJoinable(STAMP, 180, min(55))).toBe(true); // 55 ≤ 180/3
    expect(stillJoinable(STAMP, 180, min(75))).toBe(false); // past the first third
  });

  it('THE SCREENSHOT BUG: a movie hours into its slot is not a recommendation', () => {
    // "The Big Country", started 3h48m ago in a four-hour slot: still "on",
    // useless to tune into.
    expect(stillJoinable(STAMP, 240, min(228))).toBe(false);
  });

  it('a short show keeps the 30-minute grace even when a third is less', () => {
    expect(stillJoinable(STAMP, 30, min(25))).toBe(true); // 25 ≤ max(30, 10)
  });

  it('unknown runtime gets only the 30-minute grace', () => {
    expect(stillJoinable(STAMP, null, min(20))).toBe(true);
    expect(stillJoinable(STAMP, null, min(40))).toBe(false);
  });
});

/**
 * WHERE THE CLOCK IS ALLOWED TO BE RENDERED.
 *
 * `displayClock` being correct is worth nothing if a surface prints its own
 * time instead, and a SERVER component that does so cannot be rescued by
 * hydration — its HTML is never re-rendered in the browser, so the server's
 * zone (UTC on Vercel) is what the viewer reads, permanently. That is exactly
 * how the home strip ended up showing times hours off the heading above it
 * after the guide itself had already been fixed.
 *
 * Source-level: these surfaces need a session and live listings, so a browser
 * test would assert against a login page and prove nothing.
 */
describe('the surfaces that print airing times', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

  it('the home page hands airings to a client rail instead of formatting them', () => {
    const src = read('src/app/app/page.tsx');
    expect(src).toContain('<UpcomingTvRail');
    // A server component formatting a wall clock is the bug itself.
    expect(src).not.toMatch(/toLocaleTimeString/);
  });

  it('the home rail is a client component and goes through displayClock', () => {
    const src = read('src/components/UpcomingTvRail.tsx');
    expect(src.startsWith("'use client'")).toBe(true);
    expect(src).toContain('displayClock');
    // Server HTML renders in UTC and the browser corrects it — intended.
    expect(src).toContain('suppressHydrationWarning');
  });

  it('the home rail says "On now" rather than a start time already past', () => {
    const src = read('src/components/UpcomingTvRail.tsx');
    expect(src).toContain('airingStatus');
    expect(src).toContain('liveLabel');
  });
});
