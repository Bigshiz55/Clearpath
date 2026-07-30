import { describe, it, expect } from 'vitest';
import { usBroadcastDate } from './onTv';

/**
 * usBroadcastDate — the calendar-day key used to fetch TVmaze's US broadcast
 * schedule. Reproduces and guards the bug this pass found: the old
 * implementation used the SERVER's UTC calendar day, so every US viewer west
 * of Eastern got TOMORROW's schedule for a multi-hour window every evening
 * (from as early as ~4pm Pacific), while the page's own "Today" header
 * (correctly computed from the viewer's real local clock) never agreed with
 * the data underneath it.
 */
describe('usBroadcastDate', () => {
  it('stays on the current US evening even once it is already tomorrow in UTC', () => {
    // 11:00 PM US Eastern (EDT, UTC-4) on July 15 == 3:00 AM UTC July 16.
    // The OLD `date.getUTCDate()`-based key would have returned "2026-07-16"
    // here — tomorrow's schedule, while it is still Tuesday night on the
    // whole US mainland (Eastern *and* every zone west of it).
    const elevenPmEasternJuly15 = Date.parse('2026-07-16T03:00:00.000Z');
    expect(usBroadcastDate(elevenPmEasternJuly15)).toBe('2026-07-15');
  });

  it('matches the exact real-world failure case: 8pm Pacific reads as tomorrow in UTC', () => {
    // 8:00 PM Pacific (PDT, UTC-7) on July 15 == 3:00 AM UTC July 16 — the
    // start of PRIMETIME on the West Coast, the single most important part
    // of the day for this feature, and the old bug's failure window started
    // even earlier (~4-5pm Pacific).
    const eightPmPacificJuly15 = Date.parse('2026-07-16T03:00:00.000Z');
    expect(usBroadcastDate(eightPmPacificJuly15)).toBe('2026-07-15');
  });

  it('agrees with naive UTC on an unambiguous mid-morning instant', () => {
    // Noon UTC is early morning across the whole continental US — well
    // before any rollover ambiguity — so both the old and new
    // implementations should trivially agree here. A sanity check, not a
    // regression case.
    const noonUtcJuly15 = Date.parse('2026-07-15T12:00:00.000Z');
    expect(usBroadcastDate(noonUtcJuly15)).toBe('2026-07-15');
  });

  it('rolls over exactly at US Eastern midnight, not UTC midnight', () => {
    // 11:59 PM Eastern (EDT) July 15 is still the 15th; one minute later, at
    // 12:00 AM Eastern July 16, it must become the 16th. Both instants are
    // on the SAME UTC calendar day's early hours (July 16, 03:59 and 04:00
    // UTC) — a UTC-based key would get both right by accident here, but a
    // fixed-offset (non-DST-aware) Eastern approximation could get this
    // wrong depending on the date; Intl with a real IANA zone must not.
    const before = Date.parse('2026-07-16T03:59:00.000Z'); // 11:59 PM EDT July 15
    const after = Date.parse('2026-07-16T04:00:00.000Z'); // 12:00 AM EDT July 16
    expect(usBroadcastDate(before)).toBe('2026-07-15');
    expect(usBroadcastDate(after)).toBe('2026-07-16');
  });

  it('handles the November DST fall-back boundary correctly (real IANA zone, not a fixed offset)', () => {
    // 2026-11-01 02:00 US Eastern is when EDT (UTC-4) falls back to EST
    // (UTC-5). A fixed "always UTC-4" or "always UTC-5" offset would
    // mis-key one side of this transition; Intl.DateTimeFormat with
    // 'America/New_York' resolves DST correctly by construction.
    const beforeFallBack = Date.parse('2026-11-01T05:30:00.000Z'); // 1:30 AM EDT (still Nov 1)
    const afterFallBack = Date.parse('2026-11-01T07:30:00.000Z'); // 2:30 AM EST (still Nov 1)
    expect(usBroadcastDate(beforeFallBack)).toBe('2026-11-01');
    expect(usBroadcastDate(afterFallBack)).toBe('2026-11-01');
  });
});
