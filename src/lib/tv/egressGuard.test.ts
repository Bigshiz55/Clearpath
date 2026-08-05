import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  requestEgress, recentEgress, egressCounts, egressDenialSummary, __resetEgressLog,
} from './egressGuard';
import { DATA_MODE_ENV } from './dataMode';

/**
 * `process.env.NODE_ENV` is typed read-only, but varying it is the whole
 * point of these cases — the guard's behaviour under `test` vs `production`
 * is a property under test, not an incidental detail. One narrow alias beats
 * a cast at each assignment.
 */
const env = process.env as Record<string, string | undefined>;

/**
 * The guard's job is not to be clever — it is to make "did anything call TV
 * Media, and was it allowed to?" a question with an answer. These tests assert
 * that answer exists, that a denial is loud, and that nothing secret leaks
 * into the log line that makes it loud.
 */

const TOUCHED = [DATA_MODE_ENV, 'VERCEL_ENV', 'NODE_ENV', 'TVMEDIA_ENABLED'] as const;
let saved: Record<string, string | undefined>;

/** The runner's own NODE_ENV, captured before any hook can clear it. */
const AMBIENT_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
  __resetEgressLog();
});
afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function inProduction(mode?: string) {
  process.env.VERCEL_ENV = 'production';
  env.NODE_ENV = 'production';
  if (mode !== undefined) process.env[DATA_MODE_ENV] = mode;
}

const TVM = { adapterId: 'tv_media', cost: 'metered', trigger: 'cron', target: 'tvmedia:listings' } as const;
const MAZE = { adapterId: 'tvmaze', cost: 'free', trigger: 'cron', target: 'tvmaze:schedule' } as const;

describe('requestEgress — decisions', () => {
  it('denies the metered adapter in the shipped default environment', () => {
    inProduction();
    const d = requestEgress(TVM);
    expect(d.allowed).toBe(false);
  });

  it('allows the free adapter in that same environment', () => {
    inProduction();
    expect(requestEgress(MAZE).allowed).toBe(true);
  });

  it('allows the metered adapter only with both keys turned', () => {
    inProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    expect(requestEgress(TVM).allowed).toBe(true);
  });

  it('denies everything under vitest, where NODE_ENV is test', () => {
    // The runner really does set NODE_ENV=test — assert that first, because
    // the whole claim ("no ordinary unit test can reach a live source") rests
    // on it. The hook above clears NODE_ENV to isolate other cases, so this
    // one puts the ambient value back and then turns BOTH keys, proving the
    // environment refusal outranks a fully authorised configuration.
    expect(AMBIENT_NODE_ENV).toBe('test');
    env.NODE_ENV = AMBIENT_NODE_ENV;
    process.env.VERCEL_ENV = 'production';
    process.env[DATA_MODE_ENV] = 'paid_live';
    process.env.TVMEDIA_ENABLED = '1';
    expect(requestEgress(TVM).allowed).toBe(false);
    expect(requestEgress(MAZE).allowed).toBe(false);
  });
});

describe('requestEgress — the record', () => {
  it('records allowed and denied attempts alike', () => {
    inProduction();
    requestEgress(TVM);
    requestEgress(MAZE);
    const log = recentEgress();
    expect(log).toHaveLength(2);
    // Most recent first.
    expect(log[0]!.adapterId).toBe('tvmaze');
    expect(log[1]!.adapterId).toBe('tv_media');
    expect(log[1]!.decision.allowed).toBe(false);
  });

  it('timestamps and stamps the environment on each record', () => {
    inProduction();
    requestEgress(TVM);
    const r = recentEgress()[0]!;
    expect(Number.isNaN(Date.parse(r.at))).toBe(false);
    expect(r.vercelEnv).toBe('production');
    expect(r.trigger).toBe('cron');
  });

  it('counts per adapter', () => {
    inProduction();
    requestEgress(TVM);
    requestEgress(TVM);
    requestEgress(MAZE);
    const c = egressCounts();
    expect(c.denied).toBe(2);
    expect(c.allowed).toBe(1);
    expect(c.byAdapter['tv_media']).toEqual({ allowed: 0, denied: 2 });
    expect(c.byAdapter['tvmaze']).toEqual({ allowed: 1, denied: 0 });
  });

  it('bounds the ring rather than growing without limit', () => {
    inProduction();
    for (let i = 0; i < 260; i++) requestEgress(MAZE);
    // The ring caps at 200; recentEgress' own limit is what a caller sees.
    expect(recentEgress(1000)).toHaveLength(200);
    expect(recentEgress(5)).toHaveLength(5);
  });

  it('resets cleanly between tests', () => {
    inProduction();
    requestEgress(TVM);
    __resetEgressLog();
    expect(recentEgress()).toHaveLength(0);
    expect(egressCounts()).toEqual({ allowed: 0, denied: 0, byAdapter: {} });
  });
});

describe('requestEgress — a denied metered call is CRITICAL', () => {
  it('logs CRITICAL naming the adapter, trigger and reason', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    inProduction();
    requestEgress({ ...TVM, trigger: 'daily_scan' });
    expect(err).toHaveBeenCalledTimes(1);
    const line = String(err.mock.calls[0]![0]);
    expect(line).toContain('[CRITICAL][tv-egress]');
    expect(line).toContain('tv_media');
    expect(line).toContain('daily_scan');
    expect(line).toContain('paid_adapter_needs_paid_mode');
  });

  it('does not shout about a denied FREE adapter — that is routine, not a defect', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env[DATA_MODE_ENV] = 'fixture';
    inProduction('fixture');
    requestEgress(MAZE);
    expect(err).not.toHaveBeenCalled();
  });

  it('does not shout when the metered call was permitted', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    inProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    requestEgress(TVM);
    expect(err).not.toHaveBeenCalled();
  });

  it('never puts a credential in the critical line', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.TVMEDIA_API_KEY = 'super-secret-value';
    inProduction();
    requestEgress({ ...TVM, target: 'tvmedia:listings' });
    expect(String(err.mock.calls[0]![0])).not.toContain('super-secret-value');
    delete process.env.TVMEDIA_API_KEY;
  });
});

describe('egressDenialSummary', () => {
  it('is empty for an allowed decision', () => {
    inProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    expect(egressDenialSummary(requestEgress(TVM))).toBe('');
  });

  it('carries the machine code and the human reason for a denial', () => {
    inProduction();
    const summary = egressDenialSummary(requestEgress(TVM));
    expect(summary).toMatch(/^paid_adapter_needs_paid_mode: /);
    expect(summary).toContain('paid_live');
  });
});
