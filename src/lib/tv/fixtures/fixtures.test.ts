import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Rng } from './rng';
import { SimClock, localWallClockToUtc, zoneOffsetMinutes, __resetZoneCaches, DEFAULT_EPOCH_UTC } from './clock';
import {
  SCALE, SMALL_SCALE, countCorpus, generateTitles, generateEpisodes, generateOffers,
  generateNetworks, generateAffiliates, generateLineups, generateAirings, generateServices,
} from './generator';
import { runSyncSimulation, DEGRADE_AFTER_FAILURES } from './simulation';

const P = { ...SMALL_SCALE };
const SEED = 'test-seed';

describe('Rng — determinism is the whole contract', () => {
  it('produces an identical sequence from an identical seed', () => {
    const a = Array.from({ length: 50 }, () => new Rng('x').float());
    const b = Array.from({ length: 50 }, () => new Rng('x').float());
    expect(a).toEqual(b);
  });

  it('produces different sequences from different seeds', () => {
    expect(new Rng('a').next()).not.toBe(new Rng('b').next());
  });

  it('gives named sub-streams that do not disturb each other', () => {
    // The property that matters: consuming one stream cannot shift another.
    // Without it, adding a generator silently rewrites the whole corpus.
    const parent = new Rng('root');
    const first = parent.derive('offers');
    const drained = parent.derive('episodes');
    for (let i = 0; i < 1000; i++) drained.next();
    const second = new Rng('root').derive('offers');
    expect(first.float()).toBe(second.float());
  });

  it('keeps int() inside its bounds, including a single-value range', () => {
    const r = new Rng('bounds');
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
    expect(new Rng('z').int(5, 5)).toBe(5);
  });

  it('refuses an inverted range rather than returning nonsense', () => {
    expect(() => new Rng('z').int(9, 2)).toThrow();
  });

  it('shuffles deterministically', () => {
    const a = new Rng('s').shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Rng('s').shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).toEqual(b);
    expect(a.slice().sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('respects weights over a large sample', () => {
    const r = new Rng('w');
    let heavy = 0;
    for (let i = 0; i < 10_000; i++) if (r.weighted([['a', 0.9], ['b', 0.1]] as const) === 'a') heavy++;
    expect(heavy).toBeGreaterThan(8_500);
    expect(heavy).toBeLessThan(9_500);
  });
});

describe('SimClock', () => {
  it('advances by exactly one tick', () => {
    const c = new SimClock({ tickSeconds: 10_800 });
    const t0 = c.nowMs();
    c.tick();
    expect(c.nowMs() - t0).toBe(10_800_000);
  });

  it('covers 30 days in 240 three-hour ticks', () => {
    expect(new SimClock({ tickSeconds: 10_800 }).ticksForDays(30)).toBe(240);
  });

  it('never reads wall-clock time', () => {
    // Two clocks built at different real moments must agree, or the corpus
    // depends on when it was generated.
    expect(new SimClock().nowMs()).toBe(new SimClock().nowMs());
    expect(new SimClock().nowMs()).toBe(DEFAULT_EPOCH_UTC);
  });
});

describe('DST handling — never silently assume a timezone', () => {
  it('flags the repeated hour on fall-back as ambiguous', () => {
    const r = localWallClockToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
    expect(r.ambiguous).toBe(true);
    expect(r.nonexistent).toBe(false);
    // The earlier (EDT) reading, which is what a broadcaster means.
    expect(new Date(r.utcMs).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('flags the skipped hour on spring-forward as nonexistent', () => {
    const r = localWallClockToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York');
    expect(r.nonexistent).toBe(true);
    expect(r.ambiguous).toBe(false);
  });

  it('leaves ordinary times unflagged in both halves of the year', () => {
    for (const month of [1, 6]) {
      const r = localWallClockToUtc({ year: 2026, month, day: 15, hour: 20, minute: 0 }, 'America/New_York');
      expect(r.ambiguous).toBe(false);
      expect(r.nonexistent).toBe(false);
    }
  });

  it('flags nothing in a zone that does not observe DST', () => {
    for (const zone of ['America/Phoenix', 'Pacific/Honolulu']) {
      for (const [month, day] of [[3, 8], [11, 1]] as const) {
        const r = localWallClockToUtc({ year: 2026, month, day, hour: 2, minute: 30 }, zone);
        expect(r.ambiguous, `${zone} ${month}/${day}`).toBe(false);
        expect(r.nonexistent, `${zone} ${month}/${day}`).toBe(false);
      }
    }
  });

  it('round-trips an ordinary time back to the same wall clock', () => {
    const parts = { year: 2026, month: 7, day: 4, hour: 21, minute: 15 };
    const { utcMs } = localWallClockToUtc(parts, 'America/Chicago');
    const offset = zoneOffsetMinutes(utcMs, 'America/Chicago');
    const back = new Date(utcMs + offset * 60_000);
    expect(back.getUTCHours()).toBe(21);
    expect(back.getUTCMinutes()).toBe(15);
  });

  it('is unaffected by the offset memo', () => {
    const once = localWallClockToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
    __resetZoneCaches();
    const again = localWallClockToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
    expect(again).toEqual(once);
  });
});

describe('fixture corpus — deterministic and correctly marked', () => {
  it('is byte-identical across two generations from one seed', () => {
    const a = [...generateTitles(SEED, P)];
    const b = [...generateTitles(SEED, P)];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('differs between seeds', () => {
    const a = [...generateTitles('seed-a', P)];
    const b = [...generateTitles('seed-b', P)];
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('marks EVERY emitted row as a fixture', () => {
    const clock = new SimClock();
    const rows: { isFixture: boolean }[] = [
      ...[...generateTitles(SEED, P)].slice(0, 20),
      ...[...generateEpisodes(SEED, P)].slice(0, 20),
      ...[...generateOffers(SEED, P, clock)].slice(0, 20),
      ...[...generateNetworks(SEED, P)].slice(0, 20),
      ...[...generateAffiliates(SEED, P)].slice(0, 20),
      ...[...generateLineups()].slice(0, 20),
      ...[...generateServices()],
      ...[...generateAirings(SEED, P, clock)].slice(0, 50),
    ];
    expect(rows.length).toBeGreaterThan(100);
    for (const row of rows) expect(row.isFixture).toBe(true);
  });

  it('hits every required scale target at the full profile', () => {
    // Counted, not generated into memory — the point of the iterators.
    const counts = countCorpus(SEED, { ...SCALE, scheduleDays: 1 });
    expect(counts.titles).toBe(SCALE.titles);
    expect(counts.episodes).toBe(SCALE.episodes);
    expect(counts.offers).toBe(SCALE.offers);
    expect(counts.networks).toBe(SCALE.networks);
  }, 120_000);

  it('produces all four lineup coverage levels', () => {
    const levels = new Set([...generateLineups()].map((l) => l.coverageLevel));
    expect([...levels].sort()).toEqual(['affiliate', 'market', 'national', 'provider']);
  });

  it('produces East and Pacific feed variants as separate networks', () => {
    const nets = [...generateNetworks(SEED, { ...P, networks: 120 })];
    expect(nets.some((n) => n.feedVariant === 'east')).toBe(true);
    expect(nets.some((n) => n.feedVariant === 'pacific')).toBe(true);
    // A feed variant points at its parent rather than replacing it.
    const east = nets.find((n) => n.feedVariant === 'east')!;
    expect(nets.some((n) => n.slug === east.parentSlug)).toBe(true);
  });

  it('produces FAST channels', () => {
    expect([...generateNetworks(SEED, P)].some((n) => n.isFast)).toBe(true);
  });

  it('spans multiple timezones including two that never observe DST', () => {
    const zones = new Set([...generateAffiliates(SEED, P)].map((a) => a.timezone));
    expect(zones.size).toBeGreaterThanOrEqual(4);
    expect(zones.has('America/Phoenix')).toBe(true);
    expect(zones.has('Pacific/Honolulu')).toBe(true);
  });

  it('keeps unmatched programmes rather than dropping them', () => {
    const airings = [...generateAirings(SEED, { ...P, scheduleDays: 1 }, new SimClock())];
    const unmatched = airings.filter((a) => a.titleKey === null);
    expect(unmatched.length).toBeGreaterThan(0);
    // An unmatched airing still carries everything needed to display it.
    for (const a of unmatched.slice(0, 20)) {
      expect(a.rawTitle.length).toBeGreaterThan(0);
      expect(a.startUtc).toBeTruthy();
      expect(a.sourceTimezone).toBeTruthy();
    }
  });

  it('records the source timezone on every airing, never assuming one', () => {
    for (const a of [...generateAirings(SEED, { ...P, scheduleDays: 1 }, new SimClock())].slice(0, 200)) {
      expect(a.sourceTimezone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
    }
  });

  it('produces every required edge case at full scale', () => {
    const c = countCorpus(SEED, SCALE).edgeCases;
    expect(c.staleOffers).toBeGreaterThan(0);
    expect(c.duplicateRouteOffers).toBeGreaterThan(0);
    expect(c.ambiguousTitleNames).toBeGreaterThan(0);
    expect(c.dstAmbiguousAirings).toBeGreaterThan(0);
    expect(c.dstNonexistentAirings).toBeGreaterThan(0);
    expect(c.midnightCrossingAirings).toBeGreaterThan(0);
    expect(c.undatedEpisodes).toBeGreaterThan(0);
    expect(c.sharedCrimeCases).toBeGreaterThan(0);
  }, 180_000);

  it('makes add-on offers reachable both directly and through a carrier', () => {
    const offers = [...generateOffers(SEED, P, new SimClock())];
    const viaCarrier = offers.filter((o) => !o.isDirect);
    expect(viaCarrier.length).toBeGreaterThan(0);
    // Direct and via are the SAME channel bought two ways: separate offers,
    // never one collapsed row.
    for (const o of viaCarrier.slice(0, 20)) {
      expect(o.viaServiceSlug).toBeTruthy();
      expect(o.viaServiceSlug).not.toBe(o.serviceSlug);
    }
  });

  it('never prices a subscription offer, and always prices a rental', () => {
    for (const o of [...generateOffers(SEED, P, new SimClock())].slice(0, 2000)) {
      if (o.offerType === 'subscription' || o.offerType === 'free_ad_supported') {
        expect(o.priceCents).toBeNull();
      }
      if (o.offerType === 'rent' || o.offerType === 'buy') {
        expect(o.priceCents).toBeGreaterThan(0);
      }
    }
  });

  it('shares true-crime cases across DIFFERENT series, which is the dedup problem', () => {
    const byCase = new Map<string, Set<string>>();
    for (const e of generateEpisodes(SEED, P)) {
      if (!e.caseKey) continue;
      const set = byCase.get(e.caseKey) ?? new Set<string>();
      set.add(e.titleKey);
      byCase.set(e.caseKey, set);
    }
    expect([...byCase.values()].filter((s) => s.size > 1).length).toBeGreaterThan(0);
  });
});

describe('fixture layer never touches wall-clock time or Math.random', () => {
  it('contains no Date.now(), new Date() or Math.random() in any generator', () => {
    // Source-text, because a single stray Date.now() makes the corpus depend
    // on when it ran and nothing else would notice until a diff mystified
    // somebody. `new Date(x)` with an argument is fine — it is a formatter.
    const dir = join(process.cwd(), 'src/lib/tv/fixtures');
    // Comments are stripped first: these modules explain at length WHY they
    // may not call Date.now() or Math.random(), and a guard that fails on its
    // own rationale is a guard nobody will keep.
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = stripComments(readFileSync(join(dir, file), 'utf8'));
      expect(src, `${file} uses Math.random`).not.toMatch(/Math\.random\s*\(/);
      expect(src, `${file} uses Date.now`).not.toMatch(/Date\.now\s*\(/);
      expect(src, `${file} uses argument-less new Date()`).not.toMatch(/new Date\(\s*\)/);
    }
  });
});

describe('30-day three-hourly synchronisation simulation', () => {
  const report = runSyncSimulation({ seed: SEED, profile: P, days: 30 });

  it('runs 240 cycles for 30 days at a three-hour cadence', () => {
    expect(report.ticks).toBe(240);
    expect(report.tickSeconds).toBe(10_800);
    expect(report.cycles).toHaveLength(240);
  });

  it('is deterministic', () => {
    const again = runSyncSimulation({ seed: SEED, profile: P, days: 30 });
    expect(JSON.stringify(again.totals)).toBe(JSON.stringify(report.totals));
  });

  it('never lets coverage go backwards', () => {
    expect(report.invariants.coverageNeverRegressed).toBe(true);
    let previous = '';
    for (const c of report.cycles) {
      if (previous) expect(c.coverageEndUtc >= previous).toBe(true);
      previous = c.coverageEndUtc;
    }
  });

  it('writes nothing on a failed cycle, and does not advance coverage', () => {
    expect(report.invariants.failedCyclesMadeNoWrites).toBe(true);
    for (let i = 1; i < report.cycles.length; i++) {
      const c = report.cycles[i]!;
      if (c.status !== 'failed') continue;
      expect(c.airingsWritten).toBe(0);
      expect(c.coverageEndUtc).toBe(report.cycles[i - 1]!.coverageEndUtc);
    }
  });

  it('still counts requests for a failed cycle — a failure is not free', () => {
    for (const c of report.cycles.filter((x) => x.status === 'failed')) {
      expect(c.requestsMade).toBeGreaterThan(0);
    }
  });

  it('degrades after consecutive failures and recovers afterwards', () => {
    expect(report.peakConsecutiveFailures).toBeGreaterThanOrEqual(DEGRADE_AFTER_FAILURES);
    expect(report.invariants.degradedAfterConsecutiveFailures).toBe(true);
    expect(report.invariants.recoveredFromDegraded).toBe(true);
  });

  it('holds the 14-day retention floor throughout', () => {
    expect(report.invariants.retentionFloorHeld).toBe(true);
  });

  it('re-earns production_supported rather than jumping straight back', () => {
    const firstDegraded = report.cycles.findIndex((c) => c.supportStage === 'degraded');
    expect(firstDegraded).toBeGreaterThan(-1);
    const next = report.cycles[firstDegraded + 1];
    if (next && next.status !== 'failed') expect(next.supportStage).not.toBe('production_supported');
  });

  it('ends production_supported after a clean run of cycles', () => {
    expect(report.finalStage).toBe('production_supported');
  });
});
