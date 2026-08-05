import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  currentDataMode, dataModeIsExplicit, mayCallUpstream, dataModeReport,
  DATA_MODES, DATA_MODE_ENV, PAID_ADAPTER_ENABLE_ENV,
} from './dataMode';

/**
 * `process.env.NODE_ENV` is typed read-only, but varying it is the whole
 * point of these cases — the guard's behaviour under `test` vs `production`
 * is a property under test, not an incidental detail. One narrow alias beats
 * a cast at each assignment.
 */
const env = process.env as Record<string, string | undefined>;

/**
 * These tests are the argument that a metered adapter cannot spend money by
 * accident. Every one of them is a way the previous integration could have
 * gone wrong, written down so it cannot go wrong the same way twice.
 *
 * `mayCallUpstream` reads process.env, so each test sets the exact environment
 * it is claiming something about. The saved/restored snapshot below matters:
 * NODE_ENV is 'test' under vitest, and that alone denies everything — the
 * "allowed" cases have to say so explicitly rather than accidentally pass for
 * the wrong reason.
 */

const TOUCHED = [DATA_MODE_ENV, 'VERCEL_ENV', 'NODE_ENV', 'TVMEDIA_ENABLED'] as const;
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

/** The environment of a real production deployment, so the mode is what is under test. */
function asProduction(mode?: string) {
  process.env.VERCEL_ENV = 'production';
  env.NODE_ENV = 'production';
  if (mode !== undefined) process.env[DATA_MODE_ENV] = mode;
}

describe('currentDataMode', () => {
  it('accepts each declared mode verbatim', () => {
    for (const mode of DATA_MODES) {
      process.env[DATA_MODE_ENV] = mode;
      expect(currentDataMode()).toBe(mode);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    process.env[DATA_MODE_ENV] = '  PAID_LIVE ';
    expect(currentDataMode()).toBe('paid_live');
  });

  it('falls back to fixture when unset outside production', () => {
    expect(currentDataMode()).toBe('fixture');
    expect(dataModeIsExplicit()).toBe(false);
  });

  it('falls back to free_live when unset in production, so the free pipeline keeps running', () => {
    process.env.VERCEL_ENV = 'production';
    expect(currentDataMode()).toBe('free_live');
  });

  it('never falls back to paid_live — the paid mode is only ever reachable explicitly', () => {
    for (const vercelEnv of ['production', 'preview', 'development', '', 'PRODUCTION']) {
      process.env.VERCEL_ENV = vercelEnv;
      for (const bogus of ['', '   ', 'paid', 'live', 'PAID-LIVE', 'true', '1']) {
        process.env[DATA_MODE_ENV] = bogus;
        expect(currentDataMode()).not.toBe('paid_live');
      }
      delete process.env[DATA_MODE_ENV];
      expect(currentDataMode()).not.toBe('paid_live');
    }
  });

  it('reports an unrecognised value as not explicit', () => {
    process.env[DATA_MODE_ENV] = 'nearly_paid_live';
    expect(dataModeIsExplicit()).toBe(false);
  });
});

describe('mayCallUpstream — environment refusals come first', () => {
  it('refuses preview deployments even in paid_live with the flag set', () => {
    asProduction('paid_live');
    process.env.VERCEL_ENV = 'preview';
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('non_production_environment');
  });

  it('refuses automated tests even in paid_live with the flag set', () => {
    asProduction('paid_live');
    env.NODE_ENV = 'test';
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('non_production_environment');
  });

  it('honours explicit env arguments over process.env', () => {
    asProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({
      adapterId: 'tv_media', cost: 'metered', vercelEnv: 'preview', nodeEnv: 'production',
    });
    expect(d.allowed).toBe(false);
  });
});

describe('mayCallUpstream — fixture mode reaches nothing', () => {
  it.each(['free', 'metered'] as const)('denies a %s adapter', (cost) => {
    asProduction('fixture');
    const d = mayCallUpstream({ adapterId: 'tv_media', cost });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('mode_is_fixture');
  });
});

describe('mayCallUpstream — free adapters', () => {
  it('are allowed in free_live and paid_live', () => {
    for (const mode of ['free_live', 'paid_live'] as const) {
      asProduction(mode);
      expect(mayCallUpstream({ adapterId: 'tvmaze', cost: 'free' }).allowed).toBe(true);
    }
  });

  it('do not need an enable flag', () => {
    asProduction('free_live');
    expect(process.env.TVMEDIA_ENABLED).toBeUndefined();
    expect(mayCallUpstream({ adapterId: 'tvmaze', cost: 'free' }).allowed).toBe(true);
  });
});

describe('mayCallUpstream — metered adapters need two keys', () => {
  it('denies free_live: the mode alone is not the paid mode', () => {
    asProduction('free_live');
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('paid_adapter_needs_paid_mode');
  });

  it('denies paid_live without the adapter enable flag', () => {
    asProduction('paid_live');
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('paid_adapter_not_enabled');
    expect(d.allowed === false && d.reason).toContain('TVMEDIA_ENABLED');
  });

  it.each(['0', 'true', 'yes', 'on', '', ' ', '1 1'])(
    'treats TVMEDIA_ENABLED=%j as not enabled — only an exact "1" authorises spending',
    (value) => {
      asProduction('paid_live');
      process.env.TVMEDIA_ENABLED = value;
      expect(mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' }).allowed).toBe(false);
    },
  );

  it('allows only when both keys are turned', () => {
    asProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(true);
    expect(d.mode).toBe('paid_live');
  });

  it('tolerates whitespace around an otherwise valid flag', () => {
    asProduction('paid_live');
    process.env.TVMEDIA_ENABLED = ' 1 ';
    expect(mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' }).allowed).toBe(true);
  });

  it('allows a metered adapter with no registered flag once in paid_live', () => {
    asProduction('paid_live');
    expect(PAID_ADAPTER_ENABLE_ENV['some_future_adapter']).toBeUndefined();
    expect(mayCallUpstream({ adapterId: 'some_future_adapter', cost: 'metered' }).allowed).toBe(true);
  });
});

describe('mayCallUpstream — the default environment', () => {
  it('denies TV Media with nothing configured at all, which is the shipped state', () => {
    // No DATA_MODE, no TVMEDIA_ENABLED, real production. This is exactly what
    // the deployment looks like right now, and it must not be able to spend.
    process.env.VERCEL_ENV = 'production';
    env.NODE_ENV = 'production';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.mode).toBe('free_live');
  });

  it('still permits the free TVmaze pipeline in that same state', () => {
    process.env.VERCEL_ENV = 'production';
    env.NODE_ENV = 'production';
    expect(mayCallUpstream({ adapterId: 'tvmaze', cost: 'free' }).allowed).toBe(true);
  });
});

describe('dataModeReport', () => {
  it('reports the decision for every metered adapter and carries no credential', () => {
    asProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    process.env.TVMEDIA_API_KEY = 'super-secret-value';
    const report = dataModeReport();
    expect(report.mode).toBe('paid_live');
    expect(report.explicit).toBe(true);
    expect(report.meteredAdapters.map((a) => a.adapterId)).toContain('tv_media');
    expect(JSON.stringify(report)).not.toContain('super-secret-value');
    delete process.env.TVMEDIA_API_KEY;
  });

  it('shows a metered adapter as disabled when its flag is unset', () => {
    asProduction('paid_live');
    const tvm = dataModeReport().meteredAdapters.find((a) => a.adapterId === 'tv_media');
    expect(tvm?.enabled).toBe(false);
    expect(tvm?.egress.allowed).toBe(false);
  });
});
