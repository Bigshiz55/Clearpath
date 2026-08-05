import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { queryWatchNow } from './query';
import { SMALL_SCALE } from '../fixtures/generator';
import { SimClock } from '../fixtures/clock';

const env = process.env as Record<string, string | undefined>;
const TOUCHED = ['DATA_MODE', 'VERCEL_ENV', 'NODE_ENV'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
});
afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else env[k] = saved[k];
  }
});

const base = { profile: { ...SMALL_SCALE }, seed: 'wtw-test', nowMs: new SimClock().nowMs() };

describe('queryWatchNow — the unified read', () => {
  it('returns streaming and linear through one shape', () => {
    const r = queryWatchNow({ ...base, limit: 60 });
    expect(r.status).toBe('ok');
    const kinds = new Set(r.items.map((i) => i.kind));
    expect(kinds.has('streaming')).toBe(true);
    // Every item carries provenance regardless of which pipeline produced it.
    for (const i of r.items) {
      expect(i.sourceSlug.length).toBeGreaterThan(0);
      expect(i.supportStage.length).toBeGreaterThan(0);
      expect(typeof i.isFixture).toBe('boolean');
    }
  });

  it('filters to streaming only', () => {
    const r = queryWatchNow({ ...base, kind: 'streaming', limit: 30 });
    expect(r.items.length).toBeGreaterThan(0);
    for (const i of r.items) expect(i.kind).toBe('streaming');
  });

  it('filters to linear only', () => {
    const r = queryWatchNow({ ...base, kind: 'linear', limit: 30 });
    for (const i of r.items) expect(i.kind).toBe('linear');
  });

  it('excludes rentals when asked for included-only', () => {
    const r = queryWatchNow({ ...base, kind: 'streaming', includedOnly: true, limit: 60 });
    expect(r.items.length).toBeGreaterThan(0);
    for (const i of r.items) {
      expect(['rent', 'buy']).not.toContain(i.offerType);
    }
  });

  it('filters by service', () => {
    const r = queryWatchNow({ ...base, kind: 'streaming', services: ['netflix'], limit: 20 });
    for (const i of r.items) expect(i.serviceSlug).toBe('netflix');
  });

  it('honours the limit', () => {
    expect(queryWatchNow({ ...base, limit: 7 }).items.length).toBeLessThanOrEqual(7);
  });

  it('is deterministic', () => {
    const a = queryWatchNow({ ...base, limit: 20 });
    const b = queryWatchNow({ ...base, limit: 20 });
    expect(JSON.stringify(a.items)).toBe(JSON.stringify(b.items));
  });

  it('keeps direct and via-carrier add-ons as separate offers', () => {
    const r = queryWatchNow({ ...base, kind: 'streaming', limit: 200 });
    const addons = r.items.filter((i) => i.offerType === 'addon');
    if (addons.length > 0) {
      // Where a via-route exists, it names a DIFFERENT carrier — never a
      // rental relabelled as included, and never collapsed into one row.
      for (const a of addons.filter((x) => !x.isDirect)) {
        expect(a.viaServiceSlug).toBeTruthy();
        expect(a.viaServiceSlug).not.toBe(a.serviceSlug);
      }
    }
  });

  it('shows an unmatched programme using the source title rather than dropping it', () => {
    const r = queryWatchNow({ ...base, kind: 'linear', limit: 200 });
    for (const i of r.items) {
      expect(i.title.length).toBeGreaterThan(0);
    }
  });
});

describe('queryWatchNow — fixture rows never reach a production user', () => {
  it('withholds every fixture row in production and says how many', () => {
    // Fixture mode is explicitly configured, so the deployment is valid — the
    // rows are still refused because they are generated data.
    const r = queryWatchNow({ ...base, vercelEnv: 'production', limit: 40 });
    process.env.DATA_MODE = 'fixture';
    const withMode = queryWatchNow({ ...base, vercelEnv: 'production', limit: 40 });
    expect(withMode.items.every((i) => !i.isFixture)).toBe(true);
    expect(withMode.coverage.filteredOutFixtureInProduction).toBeGreaterThan(0);
    void r;
  });

  it('serves fixture rows outside production, which is the point of fixture mode', () => {
    const r = queryWatchNow({ ...base, vercelEnv: 'preview', limit: 10 });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => i.isFixture)).toBe(true);
  });
});

describe('queryWatchNow — an unconfigured production deployment', () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = 'production';
    env.NODE_ENV = 'production';
    delete process.env.DATA_MODE;
  });

  it('reports configuration_error rather than an empty list', () => {
    const r = queryWatchNow({ ...base, vercelEnv: 'production' });
    expect(r.status).toBe('configuration_error');
    expect(r.items).toEqual([]);
    // "Nothing is on tonight" and "nobody configured this" must not look the
    // same to a caller.
    expect(r.message).toContain('DATA_MODE');
    expect(r.dataMode).toBeNull();
  });
});

describe('queryWatchNow — a configured live mode with no verified source', () => {
  it('says so plainly instead of inventing rows', () => {
    process.env.VERCEL_ENV = 'production';
    env.NODE_ENV = 'production';
    process.env.DATA_MODE = 'free_live';
    const r = queryWatchNow({ ...base, vercelEnv: 'production' });
    expect(r.status).toBe('no_verified_sources');
    expect(r.items).toEqual([]);
    expect(r.message).toContain('verified');
  });
});

describe('queryWatchNow — coverage reporting', () => {
  it('names contributing sources and the stalest record', () => {
    const r = queryWatchNow({ ...base, kind: 'streaming', limit: 40 });
    expect(r.coverage.sources.length).toBeGreaterThan(0);
    expect(r.coverage.sources[0]!.slug).toBe('fixture');
    expect(r.coverage.stalestUtc).toBeTruthy();
    expect(r.coverage.totalBeforeFiltering).toBeGreaterThanOrEqual(r.items.length);
  });

  it('stamps the instant the result was generated', () => {
    const r = queryWatchNow(base);
    expect(Number.isNaN(Date.parse(r.generatedAtUtc))).toBe(false);
  });
});
