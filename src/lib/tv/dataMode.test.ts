import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  currentDataMode, dataModeIsExplicit, mayCallUpstream, dataModeReport,
  resolveDataMode, ingestionIsDisabled, isProductionDeployment,
  DATA_MODES, DATA_MODE_ENV, PAID_ADAPTER_ENABLE_ENV, CONFIGURATION_ERROR,
} from './dataMode';

/**
 * `process.env.NODE_ENV` is typed read-only, but varying it is the whole
 * point of these cases — behaviour under `test` vs `production` is a property
 * under test, not an incidental detail. One narrow alias beats a cast at each
 * assignment.
 */
const env = process.env as Record<string, string | undefined>;

/**
 * These tests are the argument that a metered adapter cannot spend money by
 * accident, and that an UNCONFIGURED production deployment cannot call
 * anything at all.
 *
 * The second half matters as much as the first. An earlier revision defaulted
 * production to `free_live` so the free pipeline would keep running, which
 * made "nobody set this" and "somebody chose free_live" produce identical
 * behaviour. Production now fails closed, and the cases below pin every one
 * of the five configurations it can be in: missing, invalid, fixture,
 * free_live, paid_live.
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

/** A real production deployment, so DATA_MODE is what is under test. */
function inProduction(mode?: string) {
  process.env.VERCEL_ENV = 'production';
  env.NODE_ENV = 'production';
  if (mode !== undefined) process.env[DATA_MODE_ENV] = mode;
}

// ─── The five production configurations ────────────────────────────────────

describe('PRODUCTION: DATA_MODE missing', () => {
  beforeEach(() => inProduction());

  it('is a CONFIGURATION_ERROR, not a default', () => {
    const state = resolveDataMode();
    expect(state.configured).toBe(false);
    expect(state.configured === false && state.code).toBe(CONFIGURATION_ERROR);
    expect(state.configured === false && state.rawValue).toBeNull();
  });

  it('names the variable and every valid value in its reason', () => {
    const state = resolveDataMode();
    const reason = state.configured === false ? state.reason : '';
    expect(reason).toContain('DATA_MODE');
    for (const m of DATA_MODES) expect(reason).toContain(m);
  });

  it('disables every ingestion adapter', () => {
    expect(ingestionIsDisabled()).toBe(true);
  });

  it('makes ZERO external requests possible — free adapters included', () => {
    for (const cost of ['free', 'metered'] as const) {
      const d = mayCallUpstream({ adapterId: 'tvmaze', cost });
      expect(d.allowed).toBe(false);
      expect(d.allowed === false && d.code).toBe('configuration_error');
    }
  });

  it('reports the error through the health surface', () => {
    const r = dataModeReport();
    expect(r.configured).toBe(false);
    expect(r.mode).toBeNull();
    expect(r.ingestionDisabled).toBe(true);
    expect(r.configurationError?.code).toBe(CONFIGURATION_ERROR);
  });

  it('does not silently become free_live — the regression this replaces', () => {
    const r = dataModeReport();
    expect(r.mode).not.toBe('free_live');
    expect(r.configured).toBe(false);
  });

  it('treats a whitespace-only value the same as unset', () => {
    process.env[DATA_MODE_ENV] = '   ';
    expect(resolveDataMode().configured).toBe(false);
  });
});

describe('PRODUCTION: DATA_MODE invalid', () => {
  beforeEach(() => inProduction('nearly_paid_live'));

  it('is a CONFIGURATION_ERROR that echoes the offending value', () => {
    const state = resolveDataMode();
    expect(state.configured).toBe(false);
    expect(state.configured === false && state.rawValue).toBe('nearly_paid_live');
    expect(state.configured === false && state.reason).toContain('nearly_paid_live');
  });

  it('disables ingestion and blocks all egress', () => {
    expect(ingestionIsDisabled()).toBe(true);
    expect(mayCallUpstream({ adapterId: 'tvmaze', cost: 'free' }).allowed).toBe(false);
    expect(mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' }).allowed).toBe(false);
  });

  it.each(['paid', 'live', 'PAID-LIVE', 'true', '1', 'fixture_live', 'freelive'])(
    'rejects %j rather than guessing what was meant',
    (bogus) => {
      inProduction(bogus);
      expect(resolveDataMode().configured).toBe(false);
    },
  );
});

describe('PRODUCTION: DATA_MODE=fixture', () => {
  beforeEach(() => inProduction('fixture'));

  it('is a valid, explicit configuration', () => {
    const state = resolveDataMode();
    expect(state.configured).toBe(true);
    expect(state.configured && state.mode).toBe('fixture');
    expect(state.configured && state.explicit).toBe(true);
  });

  it('leaves ingestion enabled as a concept but reaching nothing', () => {
    expect(ingestionIsDisabled()).toBe(false);
    for (const cost of ['free', 'metered'] as const) {
      const d = mayCallUpstream({ adapterId: 'tvmaze', cost });
      expect(d.allowed).toBe(false);
      expect(d.allowed === false && d.code).toBe('mode_is_fixture');
    }
  });
});

describe('PRODUCTION: DATA_MODE=free_live', () => {
  beforeEach(() => inProduction('free_live'));

  it('must be set explicitly — production never falls back to it', () => {
    const state = resolveDataMode();
    expect(state.configured && state.explicit).toBe(true);
    delete process.env[DATA_MODE_ENV];
    expect(resolveDataMode().configured).toBe(false);
  });

  it('permits free adapters', () => {
    expect(mayCallUpstream({ adapterId: 'tvmaze', cost: 'free' }).allowed).toBe(true);
  });

  it('still refuses metered adapters even with their flag set', () => {
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('paid_adapter_needs_paid_mode');
  });
});

describe('PRODUCTION: DATA_MODE=paid_live', () => {
  beforeEach(() => inProduction('paid_live'));

  it('is never inferred from any other value', () => {
    for (const other of ['', '   ', 'fixture', 'free_live', 'bogus']) {
      inProduction(other);
      expect(currentDataMode()).not.toBe('paid_live');
    }
  });

  it('still refuses a metered adapter without its enable flag', () => {
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('paid_adapter_not_enabled');
    expect(d.allowed === false && d.reason).toContain('TVMEDIA_ENABLED');
  });

  it.each(['0', 'true', 'yes', 'on', '', ' ', '1 1'])(
    'treats TVMEDIA_ENABLED=%j as not enabled — only an exact "1" authorises spending',
    (value) => {
      process.env.TVMEDIA_ENABLED = value;
      expect(mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' }).allowed).toBe(false);
    },
  );

  it('permits spending only when BOTH keys are turned', () => {
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(true);
    expect(d.mode).toBe('paid_live');
  });

  it('permits free adapters too', () => {
    expect(mayCallUpstream({ adapterId: 'tvmaze', cost: 'free' }).allowed).toBe(true);
  });

  it('allows a metered adapter with no registered flag once in paid_live', () => {
    expect(PAID_ADAPTER_ENABLE_ENV['some_future_adapter']).toBeUndefined();
    expect(mayCallUpstream({ adapterId: 'some_future_adapter', cost: 'metered' }).allowed).toBe(true);
  });
});

// ─── Non-production environments still default to fixture ──────────────────

describe('NON-PRODUCTION defaults to fixture', () => {
  it.each(['preview', 'development', '', 'unset'])(
    'VERCEL_ENV=%j with no DATA_MODE resolves to fixture, not an error',
    (vercelEnv) => {
      if (vercelEnv === 'unset') delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = vercelEnv;
      const state = resolveDataMode();
      expect(state.configured).toBe(true);
      expect(state.configured && state.mode).toBe('fixture');
      expect(state.configured && state.explicit).toBe(false);
      expect(ingestionIsDisabled()).toBe(false);
    },
  );

  it('is case- and whitespace-insensitive when a mode IS given', () => {
    process.env[DATA_MODE_ENV] = '  PAID_LIVE ';
    expect(currentDataMode()).toBe('paid_live');
    expect(dataModeIsExplicit()).toBe(true);
  });

  it('accepts each declared mode verbatim', () => {
    for (const mode of DATA_MODES) {
      process.env[DATA_MODE_ENV] = mode;
      expect(currentDataMode()).toBe(mode);
    }
  });

  it('reports an unrecognised value as not explicit', () => {
    process.env[DATA_MODE_ENV] = 'nearly_paid_live';
    expect(dataModeIsExplicit()).toBe(false);
    expect(currentDataMode()).toBe('fixture');
  });
});

describe('isProductionDeployment', () => {
  it.each([
    ['production', true], ['PRODUCTION', true], ['  production  ', true],
    ['preview', false], ['development', false], ['', false],
  ] as const)('%j -> %s', (value, expected) => {
    expect(isProductionDeployment(value)).toBe(expected);
  });
});

// ─── Environment refusals outrank the mode ─────────────────────────────────

describe('mayCallUpstream — environment refusals come first', () => {
  it('refuses preview deployments even in paid_live with the flag set', () => {
    process.env.VERCEL_ENV = 'preview';
    env.NODE_ENV = 'production';
    process.env[DATA_MODE_ENV] = 'paid_live';
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('non_production_environment');
  });

  it('refuses automated tests even in paid_live with the flag set', () => {
    inProduction('paid_live');
    env.NODE_ENV = 'test';
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({ adapterId: 'tv_media', cost: 'metered' });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe('non_production_environment');
  });

  it('honours explicit env arguments over process.env', () => {
    inProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    const d = mayCallUpstream({
      adapterId: 'tv_media', cost: 'metered', vercelEnv: 'preview', nodeEnv: 'production',
    });
    expect(d.allowed).toBe(false);
  });
});

describe('dataModeReport', () => {
  it('reports each metered adapter and carries no credential', () => {
    inProduction('paid_live');
    process.env.TVMEDIA_ENABLED = '1';
    process.env.TVMEDIA_API_KEY = 'super-secret-value';
    const report = dataModeReport();
    expect(report.configured).toBe(true);
    expect(report.mode).toBe('paid_live');
    expect(report.meteredAdapters.map((a) => a.adapterId)).toContain('tv_media');
    expect(JSON.stringify(report)).not.toContain('super-secret-value');
    delete process.env.TVMEDIA_API_KEY;
  });

  it('shows a metered adapter as disabled when its flag is unset', () => {
    inProduction('paid_live');
    expect(PAID_ADAPTER_ENABLE_ENV['tv_media']).toBe('TVMEDIA_ENABLED');
    const tvm = dataModeReport().meteredAdapters.find((a) => a.adapterId === 'tv_media');
    expect(tvm?.enabled).toBe(false);
    expect(tvm?.egress.allowed).toBe(false);
  });
});
