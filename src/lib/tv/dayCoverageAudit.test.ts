import { describe, it, expect } from 'vitest';
import {
  buildDayCoverageAudit,
  formatDayAudit,
  DAY_MINUTES,
  MANDATORY_CHANNELS,
  type AuditListing,
  type DayAuditInput,
} from './dayCoverageAudit';

const NOW = Date.UTC(2026, 7, 11, 12, 0);
const H = 3_600_000;

function slot(channel: string, startH: number, hours: number, kind: AuditListing['kind'] = 'movie', providerId = 'tv_media'): AuditListing {
  return { channelName: channel, startMs: NOW + startH * H, endMs: NOW + (startH + hours) * H, kind, providerId };
}

/** A full 24h grid for one channel, the way a licensed EPG would deliver it. */
function fullDay(channel: string, providerId = 'tv_media'): AuditListing[] {
  return Array.from({ length: 12 }, (_, i) =>
    slot(channel, i * 2, 2, (['movie', 'rerun', 'special', 'paid_programming'] as const)[i % 4], providerId));
}

const base: DayAuditInput = {
  nowMs: NOW,
  lineup: [...MANDATORY_CHANNELS],
  listings: [],
  lastSuccessByProvider: { tv_media: NOW - H, tvmaze: NOW - H },
};

describe('a mandatory channel is never silently omitted', () => {
  it('every mandatory channel gets a row even when the provider returned nothing', () => {
    const a = buildDayCoverageAudit(base);
    expect(a.rows).toHaveLength(MANDATORY_CHANNELS.length);
    for (const r of a.rows) {
      expect(r.included).toBe(false);
      expect(r.pass).toBe(false);
      expect(r.reason).toMatch(/FAIL/);
    }
    expect(a.allMandatoryPass).toBe(false);
    expect(a.failed).toBe(MANDATORY_CHANNELS.length);
  });

  it('"not in the lineup" and "in the lineup but absent" are DIFFERENT failures', () => {
    const notCarried = buildDayCoverageAudit({ ...base, lineup: [] });
    expect(notCarried.rows[0]!.reason).toMatch(/not in the configured lineup/i);

    const carriedButEmpty = buildDayCoverageAudit(base);
    expect(carriedButEmpty.rows[0]!.reason).toMatch(/in the lineup but the provider returned nothing/i);
  });

  it('Hallmark cannot vanish from the report just because nothing came back', () => {
    const a = buildDayCoverageAudit({ ...base, listings: fullDay('Lifetime') });
    const names = a.rows.map((r) => r.channel);
    expect(names).toContain('Hallmark Channel');
    expect(names).toContain('Hallmark Mystery');
    expect(a.rows.find((r) => r.channel === 'Hallmark Channel')!.pass).toBe(false);
  });
});

describe('minute coverage, not row counts', () => {
  it('a full 24h grid passes at 100%', () => {
    const a = buildDayCoverageAudit({ ...base, listings: fullDay('Lifetime') });
    const row = a.rows.find((r) => r.channel === 'Lifetime')!;
    expect(row.coveredMinutes).toBe(DAY_MINUTES);
    expect(row.coveragePct).toBe(100);
    expect(row.gaps).toHaveLength(0);
    expect(row.pass).toBe(true);
  });

  it('FOUR FIRST-RUN EPISODES IS NOT A COVERED DAY — the TVmaze shape fails', () => {
    // Exactly what an episode database produces: a handful of first-runs and
    // twenty hours of nothing. Row count looks fine; the day does not.
    const listings = [
      slot('Lifetime', 0, 1, 'first_run', 'tvmaze'),
      slot('Lifetime', 4, 1, 'first_run', 'tvmaze'),
      slot('Lifetime', 9, 1, 'first_run', 'tvmaze'),
      slot('Lifetime', 15, 1, 'first_run', 'tvmaze'),
    ];
    const row = buildDayCoverageAudit({ ...base, listings }).rows.find((r) => r.channel === 'Lifetime')!;
    expect(row.included).toBe(true);
    expect(row.coveredMinutes).toBe(240);
    expect(row.coveragePct).toBe(17);
    expect(row.pass).toBe(false);
    expect(row.reason).toMatch(/sampled schedule, not a grid/i);
    expect(row.movies).toBe(0);
    expect(row.paidProgramming).toBe(0);
  });

  it('reports gaps with their real size, largest first-class', () => {
    const listings = [slot('Lifetime', 0, 2), slot('Lifetime', 8, 2)];
    const row = buildDayCoverageAudit({ ...base, listings }).rows.find((r) => r.channel === 'Lifetime')!;
    expect(row.gaps.map((g) => g.minutes)).toEqual([360, 840]);
    expect(row.largestGapMinutes).toBe(840);
  });

  it('overlapping listings do not double-count minutes', () => {
    const listings = [slot('Lifetime', 0, 3), slot('Lifetime', 1, 3)];
    const row = buildDayCoverageAudit({ ...base, listings }).rows.find((r) => r.channel === 'Lifetime')!;
    expect(row.coveredMinutes).toBe(240); // 0h–4h, not 6h
  });

  it('listings outside the window are clipped, not counted', () => {
    const listings = [
      { channelName: 'Lifetime', startMs: NOW - 5 * H, endMs: NOW + H, kind: 'movie' as const, providerId: 'tv_media' },
      { channelName: 'Lifetime', startMs: NOW + 23 * H, endMs: NOW + 30 * H, kind: 'movie' as const, providerId: 'tv_media' },
    ];
    const row = buildDayCoverageAudit({ ...base, listings }).rows.find((r) => r.channel === 'Lifetime')!;
    expect(row.coveredMinutes).toBe(120); // 1h at the front + 1h at the back
  });

  it('counts the programme MIX, which is what separates a grid from a sample', () => {
    const row = buildDayCoverageAudit({ ...base, listings: fullDay('Lifetime') }).rows.find((r) => r.channel === 'Lifetime')!;
    expect(row.movies).toBe(3);
    expect(row.reruns).toBe(3);
    expect(row.specials).toBe(3);
    expect(row.paidProgramming).toBe(3);
  });
});

describe('freshness', () => {
  it('a stale provider fails even at 100% coverage', () => {
    const a = buildDayCoverageAudit({
      ...base,
      listings: fullDay('Lifetime'),
      lastSuccessByProvider: { tv_media: NOW - 40 * H },
    });
    const row = a.rows.find((r) => r.channel === 'Lifetime')!;
    expect(row.coveragePct).toBe(100);
    expect(row.pass).toBe(false);
    expect(row.reason).toMatch(/last succeeded 40h ago/i);
  });
});

describe('before/after activation is comparable', () => {
  it('the same audit shape runs on an empty database and on a full grid', () => {
    const before = buildDayCoverageAudit(base);
    const after = buildDayCoverageAudit({
      ...base,
      listings: MANDATORY_CHANNELS.flatMap((c) => fullDay(c)),
    });
    expect(before.passed).toBe(0);
    expect(after.passed).toBe(MANDATORY_CHANNELS.length);
    expect(after.allMandatoryPass).toBe(true);
    // Same rows, same order — so a diff of the two is meaningful.
    expect(before.rows.map((r) => r.channel)).toEqual(after.rows.map((r) => r.channel));
  });

  it('formats a table an operator can read', () => {
    const out = formatDayAudit(buildDayCoverageAudit(base));
    expect(out).toMatch(/24h COVERAGE AUDIT/);
    expect(out).toMatch(/0 passed \/ 5 failed/);
    for (const c of MANDATORY_CHANNELS) expect(out).toContain(c);
  });
});
