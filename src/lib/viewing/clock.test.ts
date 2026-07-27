import { describe, it, expect } from 'vitest';
import { airingClock, airingStatus, clockFromProviderTime, displayClock, liveLabel } from './clock';

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
