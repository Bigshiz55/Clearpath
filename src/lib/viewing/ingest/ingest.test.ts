import { describe, it, expect } from 'vitest';
import {
  programState, bucketByState, nextTransitionMs, freshness,
  formatRefreshedAt, formatCoverageThrough, SOON_WINDOW_MS,
} from '../scheduleState';
import { normalizeInstant, normalizeAiring, resolveWallClock } from './normalizeTime';
import { estimateRunCost, evaluateBudget, RunBudget, safetyThreshold } from './budget';
import { reconcile, airingKey, hashPayload, selectExpiredByRetention, chunk, type StoredAiring, type FetchedAiring } from './reconcile';

const NOW = Date.parse('2026-07-26T20:00:00Z');
const MIN = 60_000;
const H = 3_600_000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

// ---------------------------------------------------------------------------
// Matrix 12–17 · schedule-state boundaries
// ---------------------------------------------------------------------------
describe('schedule state boundaries', () => {
  it('12. a programme starting one minute from now is Coming Up', () => {
    expect(programState({ startAtUtc: at(MIN), endAtUtc: at(H) }, NOW)).toBe('next_two_hours');
  });

  it('13. a programme starting exactly now is On Now, not upcoming', () => {
    expect(programState({ startAtUtc: at(0), endAtUtc: at(H) }, NOW)).toBe('on_now');
  });

  it('14. a programme that started one minute ago is On Now', () => {
    expect(programState({ startAtUtc: at(-MIN), endAtUtc: at(H) }, NOW)).toBe('on_now');
  });

  it('15. a programme that ended one minute ago is Ended', () => {
    expect(programState({ startAtUtc: at(-2 * H), endAtUtc: at(-MIN) }, NOW)).toBe('ended');
  });

  it('an airing ending exactly now is Ended, not On Now', () => {
    expect(programState({ startAtUtc: at(-H), endAtUtc: at(0) }, NOW)).toBe('ended');
  });

  it('16. starting exactly two hours from now is in the next two hours', () => {
    expect(programState({ startAtUtc: at(SOON_WINDOW_MS), endAtUtc: at(SOON_WINDOW_MS + H) }, NOW))
      .toBe('next_two_hours');
  });

  it('17. starting two hours and one minute from now is Later', () => {
    expect(programState({ startAtUtc: at(SOON_WINDOW_MS + MIN), endAtUtc: null }, NOW)).toBe('later');
  });

  it('a started programme with no end time is unknown, never guessed into On Now', () => {
    expect(programState({ startAtUtc: at(-H), endAtUtc: null }, NOW)).toBe('unknown');
  });

  it('an unparsable start is unknown', () => {
    expect(programState({ startAtUtc: 'not a time', endAtUtc: null }, NOW)).toBe('unknown');
  });

  it('HARD: nothing with a past start ever lands in an upcoming bucket', () => {
    const rows = [
      { startAtUtc: at(-3 * H), endAtUtc: at(-2 * H) },  // ended
      { startAtUtc: at(-MIN), endAtUtc: at(H) },         // on now
      { startAtUtc: at(-H), endAtUtc: null },            // unknown
      { startAtUtc: at(MIN), endAtUtc: at(H) },          // soon
      { startAtUtc: at(5 * H), endAtUtc: at(6 * H) },    // later
    ];
    const b = bucketByState(rows, NOW);
    for (const r of [...b.nextTwoHours, ...b.later]) {
      expect(Date.parse(r.startAtUtc), 'upcoming must be strictly future').toBeGreaterThan(NOW);
    }
    expect(b.onNow).toHaveLength(1);
    expect(b.ended).toHaveLength(1);
    expect(b.unknown).toHaveLength(1);
  });

  it('19. a programme crossing midnight stays On Now across the boundary', () => {
    const a = { startAtUtc: '2026-07-27T03:30:00Z', endAtUtc: '2026-07-27T05:00:00Z' };
    const justAfterMidnightEt = Date.parse('2026-07-27T04:10:00Z'); // 12:10am ET
    expect(programState(a, justAfterMidnightEt)).toBe('on_now');
  });

  it('41/42. state advances with the clock alone — no refetch', () => {
    const a = { startAtUtc: at(10 * MIN), endAtUtc: at(70 * MIN) };
    expect(programState(a, NOW)).toBe('next_two_hours');
    expect(programState(a, NOW + 10 * MIN)).toBe('on_now');
    expect(programState(a, NOW + 71 * MIN)).toBe('ended');
  });

  it('reports when the next state change is due', () => {
    const rows = [{ startAtUtc: at(30 * MIN), endAtUtc: at(90 * MIN) }];
    expect(nextTransitionMs(rows, NOW)).toBe(NOW + 30 * MIN);
    expect(nextTransitionMs(rows, NOW + 31 * MIN)).toBe(NOW + 90 * MIN);
    expect(nextTransitionMs([], NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Matrix 20–30 · timestamps and timezones
// ---------------------------------------------------------------------------
describe('timestamp normalization', () => {
  it('26. an explicit UTC timestamp', () => {
    const r = normalizeInstant('2026-07-26T20:00:00Z');
    expect(r.usable).toBe(true);
    expect(r.confidence).toBe('explicit_utc');
    expect(r.utcMs).toBe(NOW);
  });

  it('27. an offset timestamp resolves to the same instant', () => {
    expect(normalizeInstant('2026-07-26T16:00:00-04:00').utcMs).toBe(NOW);
    expect(normalizeInstant('2026-07-26T16:00:00-0400').utcMs).toBe(NOW);
  });

  it('accepts unix epoch seconds and millis', () => {
    expect(normalizeInstant(String(NOW / 1000)).utcMs).toBe(NOW);
    expect(normalizeInstant(String(NOW)).utcMs).toBe(NOW);
  });

  it('28. a timestamp with no offset is REFUSED unless the provider zone is known', () => {
    const bare = normalizeInstant('2026-07-26 20:00');
    expect(bare.usable).toBe(false);
    expect(bare.note).toMatch(/refusing to assume server-local/i);

    const zoned = normalizeInstant('2026-07-26 16:00', { providerTimeZone: 'America/New_York' });
    expect(zoned.usable).toBe(true);
    expect(zoned.confidence).toBe('zone_applied');
    expect(zoned.utcMs).toBe(NOW);
  });

  it('30. an invalid timestamp is rejected without throwing', () => {
    for (const bad of ['', 'yesterday', '2026-13-45T99:99:99Z', null, undefined, {}]) {
      expect(normalizeInstant(bad as unknown).usable, String(bad)).toBe(false);
    }
  });

  it('20-23. the same wall clock resolves differently per US zone', () => {
    const wall = '2026-07-26 20:00';
    const inZone = (tz: string) => normalizeInstant(wall, { providerTimeZone: tz }).utcMs!;
    expect(inZone('America/New_York')).toBe(Date.parse('2026-07-27T00:00:00Z'));
    expect(inZone('America/Chicago')).toBe(Date.parse('2026-07-27T01:00:00Z'));
    expect(inZone('America/Denver')).toBe(Date.parse('2026-07-27T02:00:00Z'));
    expect(inZone('America/Los_Angeles')).toBe(Date.parse('2026-07-27T03:00:00Z'));
    // Arizona does not observe DST — in July it is an hour behind Denver.
    expect(inZone('America/Phoenix')).toBe(Date.parse('2026-07-27T03:00:00Z'));
  });

  it('24. spring-forward: a wall clock inside the gap does not exist', () => {
    // 2026-03-08, US DST begins: 02:00–02:59 local never happens.
    const r = normalizeInstant('2026-03-08 02:30', { providerTimeZone: 'America/New_York' });
    expect(r.usable).toBe(false);
    expect(r.note).toMatch(/spring-forward gap/i);
    expect(resolveWallClock(Date.UTC(2026, 2, 8, 2, 30), 'America/New_York')).toHaveLength(0);
  });

  it('25. fall-back: a repeated wall clock takes the first occurrence and says so', () => {
    // 2026-11-01, US DST ends: 01:00–01:59 local happens twice.
    const r = normalizeInstant('2026-11-01 01:30', { providerTimeZone: 'America/New_York' });
    expect(r.usable).toBe(true);
    expect(r.confidence).toBe('ambiguous_dst');
    expect(r.note).toMatch(/occurs twice/i);
    const hits = resolveWallClock(Date.UTC(2026, 10, 1, 1, 30), 'America/New_York');
    expect(hits).toHaveLength(2);
    expect(r.utcMs).toBe(hits[0]);
  });

  it('a non-DST zone is never ambiguous', () => {
    const r = normalizeInstant('2026-11-01 01:30', { providerTimeZone: 'America/Phoenix' });
    expect(r.confidence).toBe('zone_applied');
  });

  it('29. a missing end time is derived from duration', () => {
    const r = normalizeAiring('2026-07-26T20:00:00Z', null, { durationMinutes: 90 });
    expect(r.complete).toBe(true);
    expect(r.endSource).toBe('duration');
    expect(r.endUtcMs).toBe(NOW + 90 * MIN);
  });

  it('29b. no end and no duration → incomplete, never an invented runtime', () => {
    const r = normalizeAiring('2026-07-26T20:00:00Z', null, {});
    expect(r.complete).toBe(false);
    expect(r.endUtcMs).toBeNull();
    expect(r.startUtcMs).toBe(NOW); // start is still usable
    expect(r.notes.join(' ')).toMatch(/no end time and no duration/i);
  });

  it('an end before the start is rejected rather than stored backwards', () => {
    const r = normalizeAiring('2026-07-26T20:00:00Z', '2026-07-26T19:00:00Z', {});
    expect(r.complete).toBe(false);
    expect(r.notes.join(' ')).toMatch(/not after start/i);
  });
});

// ---------------------------------------------------------------------------
// Matrix 36–38 · call budget
// ---------------------------------------------------------------------------
describe('call budget', () => {
  const plan = { monthlyLimit: 50, safetyPercent: 0.9 };
  const state = { ...plan, safetyPercent: 0.9, used: 0, dayOfMonth: 10, daysInMonth: 30 };

  it('computes the safety threshold from the plan', () => {
    expect(safetyThreshold(plan)).toBe(45);
  });

  it('38. a paginated run is costed as MANY calls, not one', () => {
    const est = estimateRunCost({
      channelCount: 220, channelsPerPage: 100,
      channelsPerScheduleCall: 20, days: 2,
    });
    expect(est.channelCalls).toBe(3);   // ceil(220/100)
    expect(est.scheduleCalls).toBe(22); // ceil(220/20) × 2
    expect(est.total).toBe(25);
    expect(est.total).toBeGreaterThan(1);
    expect(est.assumptions.join(' ')).toMatch(/channel-list call/);
  });

  it('includes metadata batching when the provider needs it', () => {
    const est = estimateRunCost({
      channelCount: 10, channelsPerPage: 100, channelsPerScheduleCall: 10, days: 1,
      programmeCount: 450, metadataBatchSize: 100,
    });
    expect(est.metadataCalls).toBe(5);
    expect(est.total).toBe(1 + 1 + 5);
  });

  it('36. refuses a run that would cross the safety threshold', () => {
    const v = evaluateBudget({ ...state, used: 40 }, 10);
    expect(v.allowed).toBe(false);
    expect(v.spendable).toBe(5);
    expect(v.reason).toMatch(/only 5 remain/);
  });

  it('allows a run that fits', () => {
    expect(evaluateBudget({ ...state, used: 40 }, 5).allowed).toBe(true);
  });

  it('37. refuses everything once the allowance is exhausted', () => {
    const v = evaluateBudget({ ...state, used: 50 }, 1);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/exhausted/i);
    expect(v.remaining).toBe(0);
  });

  it('holds back the last calls above the safety threshold', () => {
    const v = evaluateBudget({ ...state, used: 45 }, 1);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/safety threshold/i);
    expect(v.remaining).toBe(5); // still there, deliberately unspent
  });

  it('projects month-end usage and flags an overage', () => {
    const v = evaluateBudget({ ...state, used: 30, dayOfMonth: 10, daysInMonth: 30 }, 1);
    expect(v.projectedMonthly).toBe(90);
    expect(v.projectedOverage).toBe(true);
  });

  it('a run stops cleanly at the threshold instead of overspending', () => {
    const b = new RunBudget({ ...state, used: 43 }, 100);
    expect(b.tryConsume('/channels', NOW)).toBe(true);  // 44
    expect(b.tryConsume('/schedules', NOW)).toBe(true); // 45
    expect(b.tryConsume('/schedules', NOW)).toBe(false); // would breach
    expect(b.callsUsed).toBe(2);
    expect(b.stopReason()).toMatch(/safety threshold/i);
  });

  it('respects a per-run cap independent of the monthly budget', () => {
    const b = new RunBudget({ ...state, used: 0 }, 3);
    for (let i = 0; i < 3; i++) expect(b.tryConsume('/schedules', NOW)).toBe(true);
    expect(b.tryConsume('/schedules', NOW)).toBe(false);
    expect(b.stopReason()).toMatch(/run cap/i);
  });

  it('records a ledger entry per call', () => {
    const b = new RunBudget({ ...state, used: 0 }, 10);
    b.tryConsume('/lineups', NOW); b.markResult(true);
    b.tryConsume('/schedules', NOW); b.markResult(false);
    expect(b.ledger).toHaveLength(2);
    expect(b.ledger[1]!.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Matrix 7–11, 32–35 · reconciliation
// ---------------------------------------------------------------------------
describe('reconciliation', () => {
  const base = (over: Partial<FetchedAiring> = {}): FetchedAiring => ({
    providerAiringId: null, stationId: 'ST1', programmeId: 'PR1',
    startAtUtc: at(H), endAtUtc: at(2 * H), rawHash: 'h1', ...over,
  });
  const stored = (over: Partial<StoredAiring> = {}): StoredAiring => ({
    ...base(), id: 'row1', lastSeenAt: at(-H), ...over,
  });
  const win = { windowStartUtcMs: NOW, windowEndUtcMs: NOW + 48 * H, fetchComplete: true, nowMs: NOW };

  it('11. a new airing is inserted', () => {
    const p = reconcile({ lineupId: 'L1', fetched: [base()], stored: [], ...win });
    expect(p.stats.inserted).toBe(1);
    expect(p.stats.expired).toBe(0);
  });

  it('9. a changed start time updates rather than duplicating', () => {
    const p = reconcile({
      lineupId: 'L1',
      fetched: [base({ providerAiringId: 'A1', startAtUtc: at(90 * MIN), rawHash: 'h2' })],
      stored: [stored({ providerAiringId: 'A1', rawHash: 'h1' })],
      ...win,
    });
    expect(p.stats.updated).toBe(1);
    expect(p.stats.inserted).toBe(0);
    expect(p.stats.expired).toBe(0);
  });

  it('an identical payload is left untouched', () => {
    const p = reconcile({ lineupId: 'L1', fetched: [base()], stored: [stored()], ...win });
    expect(p.stats.unchanged).toBe(1);
    expect(p.stats.updated).toBe(0);
  });

  it('10. an airing missing from the fetch is expired', () => {
    const p = reconcile({ lineupId: 'L1', fetched: [], stored: [stored()], ...win });
    expect(p.stats.expired).toBe(1);
  });

  it('8. a duplicate row inside one payload is taken once', () => {
    const p = reconcile({ lineupId: 'L1', fetched: [base(), base()], stored: [], ...win });
    expect(p.stats.inserted).toBe(1);
  });

  it('HARD: 35. an incomplete fetch never expires the stored schedule', () => {
    const p = reconcile({
      lineupId: 'L1', fetched: [], stored: [stored(), stored({ id: 'row2' })],
      ...win, fetchComplete: false,
    });
    expect(p.stats.expired).toBe(0);
    expect(p.skipped).toHaveLength(2);
    expect(p.skipped[0]!.reason).toMatch(/expiry suppressed/);
  });

  it('a short refresh never deletes listings outside its window', () => {
    const tomorrow = stored({ id: 'far', startAtUtc: at(30 * H) });
    const p = reconcile({
      lineupId: 'L1', fetched: [], stored: [tomorrow],
      windowStartUtcMs: NOW, windowEndUtcMs: NOW + 6 * H, fetchComplete: true, nowMs: NOW,
    });
    expect(p.stats.expired).toBe(0);
    expect(p.skipped[0]!.reason).toMatch(/outside the refreshed window/);
  });

  it('identity uses the provider id when present, a composite otherwise', () => {
    expect(airingKey(base({ providerAiringId: 'A9' }))).toBe('pid:A9');
    const k = airingKey(base());
    expect(k).toContain('ST1');
    expect(k).toContain('PR1');
    // Two different programmes at the same time on the same station stay distinct.
    expect(airingKey(base({ programmeId: 'PR2' }))).not.toBe(k);
  });

  it('7. the same programme on two stations is not merged', () => {
    const p = reconcile({
      lineupId: 'L1',
      fetched: [base({ stationId: 'ST1' }), base({ stationId: 'ST2' })],
      stored: [], ...win,
    });
    expect(p.stats.inserted).toBe(2);
  });

  it('the same programme at two times on one station is not merged', () => {
    const p = reconcile({
      lineupId: 'L1',
      fetched: [base({ startAtUtc: at(H) }), base({ startAtUtc: at(4 * H) })],
      stored: [], ...win,
    });
    expect(p.stats.inserted).toBe(2);
  });

  it('hashes are stable and change with content', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ a: 1, b: 2 }));
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  it('47. retention selects only rows past the licence window', () => {
    const rows = [
      { id: 'old', fetchedAt: at(-40 * 24 * H) },
      { id: 'recent', fetchedAt: at(-2 * 24 * H) },
    ];
    expect(selectExpiredByRetention(rows, 30, NOW)).toEqual(['old']);
  });
});

/**
 * A first-time TV Media ingest — every discovered channel, a 14-day window —
 * is exactly the case that turned one-row-at-a-time writes into a real
 * `FUNCTION_INVOCATION_TIMEOUT` in production. `chunk` is what the writers
 * use to turn thousands of rows into a handful of bulk upsert/insert calls.
 */
describe('chunk — batching bulk writes', () => {
  it('splits into fixed-size batches with a short tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('covers every item exactly once, in order', () => {
    const items = Array.from({ length: 1234 }, (_, i) => i);
    expect(chunk(items, 500).flat()).toEqual(items);
  });

  it('an empty input produces no batches at all — a safe no-op loop target', () => {
    expect(chunk([], 500)).toEqual([]);
  });

  it('a size larger than the input still returns exactly one batch', () => {
    expect(chunk([1, 2, 3], 500)).toEqual([[1, 2, 3]]);
  });
});

// ---------------------------------------------------------------------------
// Matrix 46 · freshness
// ---------------------------------------------------------------------------
describe('freshness reporting', () => {
  const cov = at(24 * H);

  it('a fresh run reports current, with no warning to show', () => {
    const f = freshness({ lastIngestedAtUtc: at(-2 * H), coverageEndUtc: cov, nowMs: NOW });
    expect(f.state).toBe('current');
    expect(f.message).toBe('');
    expect(f.usable).toBe(true);
  });

  it('a late run is flagged but still usable', () => {
    const f = freshness({ lastIngestedAtUtc: at(-30 * H), coverageEndUtc: cov, nowMs: NOW });
    expect(f.state).toBe('refresh_due');
    expect(f.message).toMatch(/delayed/i);
    expect(f.usable).toBe(true);
  });

  it('two missed cadences reads as a real outage', () => {
    const f = freshness({ lastIngestedAtUtc: at(-60 * H), coverageEndUtc: cov, nowMs: NOW });
    expect(f.state).toBe('stale');
    expect(f.message).toMatch(/last schedule we were able to retrieve/i);
  });

  it('HARD: exhausted coverage is unusable, and says so', () => {
    const f = freshness({ lastIngestedAtUtc: at(-3 * H), coverageEndUtc: at(-1 * H), nowMs: NOW });
    expect(f.state).toBe('expired');
    expect(f.usable).toBe(false);
    expect(f.message).toMatch(/run out/i);
    // Never confused with "nothing is on".
    expect(f.message).not.toMatch(/no matching|nothing/i);
  });

  it('never ingested is distinct from stale', () => {
    expect(freshness({ lastIngestedAtUtc: null, coverageEndUtc: null, nowMs: NOW }).state).toBe('unknown');
  });

  it('formats the refresh stamp in the viewer zone', () => {
    const s = formatRefreshedAt('2026-07-26T06:03:00Z', 'America/New_York', NOW);
    expect(s).toBe('Updated today at 2:03 AM');
    expect(formatRefreshedAt(null, 'America/New_York', NOW)).toBe('Never updated');
  });

  it('formats coverage in the viewer zone', () => {
    const s = formatCoverageThrough('2026-07-28T06:00:00Z', 'America/New_York', NOW);
    expect(s).toMatch(/Schedule current through/);
    const tomorrow = formatCoverageThrough('2026-07-27T06:00:00Z', 'America/New_York', NOW);
    expect(tomorrow).toBe('Schedule current through tomorrow at 2:00 AM');
  });
});

// ---------------------------------------------------------------------------
// Matrix 40 · shared reads
// ---------------------------------------------------------------------------
describe('shared stored schedule', () => {
  it('40. a thousand readers of one stored schedule compute identical state', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      startAtUtc: at(i * 15 * MIN - 5 * H), endAtUtc: at(i * 15 * MIN - 4 * H),
    }));
    const first = JSON.stringify(bucketByState(rows, NOW));
    for (let reader = 0; reader < 1000; reader++) {
      expect(JSON.stringify(bucketByState(rows, NOW))).toBe(first);
    }
  });

  it('state depends only on the clock, so no reader triggers a fetch', () => {
    const rows = [{ startAtUtc: at(H), endAtUtc: at(2 * H) }];
    const a = bucketByState(rows, NOW);
    const b = bucketByState(rows, NOW + 61 * MIN);
    expect(a.nextTwoHours).toHaveLength(1);
    expect(b.onNow).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Lineups and DST-safe daily scheduling
// ---------------------------------------------------------------------------
import {
  LINEUPS, enabledLineups, blockedLineups, lineupsDueNow, isIngestHourFor,
  localDayKey as lineupDayKey, lineupByKey, INGEST_LOCAL_HOUR, COVERAGE_HOURS,
} from './lineups';

describe('lineup registry', () => {
  it('enables the two development lineups and no others', () => {
    expect(enabledLineups().map((l) => l.key).sort())
      .toEqual(['us_generic_eastern', 'us_generic_pacific']);
  });

  it('marks real Richmond lineups as awaiting plan access, never faked', () => {
    const blocked = blockedLineups().map((l) => l.key);
    expect(blocked).toContain('richmond_ota');
    expect(blocked).toContain('richmond_cable');
    for (const l of blockedLineups()) {
      expect(l.enabled, `${l.key} must not be enabled`).toBe(false);
      // A blocked lineup must not carry a borrowed provider id.
      expect(l.providerLineupId).toBeNull();
    }
  });

  it('Central and Mountain are defined and disabled — enabling needs no code change', () => {
    for (const k of ['us_generic_central', 'us_generic_mountain']) {
      const l = lineupByKey(k)!;
      expect(l, k).toBeDefined();
      expect(l.enabled).toBe(false);
      expect(l.awaitingPlanAccess).toBe(false);
    }
  });

  it('is not keyed on one city, carrier or timezone', () => {
    expect(new Set(LINEUPS.map((l) => l.market.timezone)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(LINEUPS.map((l) => l.type)).size).toBeGreaterThanOrEqual(3);
  });

  it('requests a coverage window inside the documented targets', () => {
    expect(COVERAGE_HOURS.preferred).toBeGreaterThanOrEqual(COVERAGE_HOURS.minimum);
    expect(COVERAGE_HOURS.preferred).toBeLessThanOrEqual(COVERAGE_HOURS.maximum);
    expect(COVERAGE_HOURS.minimum).toBeGreaterThanOrEqual(24);
  });
});

describe('DST-safe daily scheduling', () => {
  const eastern = lineupByKey('us_generic_eastern')!;
  const pacific = lineupByKey('us_generic_pacific')!;

  it('runs Eastern at 2 AM Eastern in summer (EDT, UTC-4)', () => {
    expect(isIngestHourFor(eastern, Date.parse('2026-07-26T06:00:00Z'))).toBe(true);
    expect(isIngestHourFor(eastern, Date.parse('2026-07-26T07:00:00Z'))).toBe(false);
  });

  it('runs Eastern at 2 AM Eastern in winter too — the UTC hour SHIFTS, local does not', () => {
    // EST is UTC-5, so 2 AM local is 07:00 UTC rather than 06:00.
    expect(isIngestHourFor(eastern, Date.parse('2026-01-26T07:00:00Z'))).toBe(true);
    expect(isIngestHourFor(eastern, Date.parse('2026-01-26T06:00:00Z'))).toBe(false);
  });

  it('Eastern and Pacific run at different UTC hours, from one cron entry', () => {
    const summer2amEt = Date.parse('2026-07-26T06:00:00Z');
    const summer2amPt = Date.parse('2026-07-26T09:00:00Z');
    expect(isIngestHourFor(eastern, summer2amEt)).toBe(true);
    expect(isIngestHourFor(pacific, summer2amEt)).toBe(false);
    expect(isIngestHourFor(pacific, summer2amPt)).toBe(true);
  });

  it('HARD: 2 AM local holds across the spring-forward date', () => {
    // 2026-03-08 is the US spring-forward. 2 AM EST that morning does not
    // exist; the run lands correctly on the following 2 AM EDT.
    const dayAfter = Date.parse('2026-03-09T06:00:00Z'); // 2 AM EDT
    expect(isIngestHourFor(eastern, dayAfter)).toBe(true);
  });

  it('HARD: 2 AM local holds across the fall-back date', () => {
    const dayAfter = Date.parse('2026-11-02T07:00:00Z'); // 2 AM EST
    expect(isIngestHourFor(eastern, dayAfter)).toBe(true);
  });

  it('a lineup runs at most once per local day', () => {
    const t = Date.parse('2026-07-26T06:00:00Z');
    expect(lineupsDueNow(t).map((l) => l.key)).toEqual(['us_generic_eastern']);
    const already = { us_generic_eastern: lineupDayKey(eastern, t) };
    expect(lineupsDueNow(t, already)).toHaveLength(0);
  });

  it('nothing is due outside the ingestion hour', () => {
    expect(lineupsDueNow(Date.parse('2026-07-26T15:00:00Z'))).toHaveLength(0);
  });

  it('the local day key rolls over in market time, not UTC', () => {
    // 01:00 UTC on the 27th is still the 26th in New York.
    expect(lineupDayKey(eastern, Date.parse('2026-07-27T01:00:00Z'))).toBe('2026-07-26');
  });

  it('the target hour is 2 AM, as specified', () => {
    expect(INGEST_LOCAL_HOUR).toBe(2);
  });
});
