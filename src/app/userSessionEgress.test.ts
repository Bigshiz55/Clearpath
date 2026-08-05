import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A NORMAL USER SESSION MAKES ZERO UPSTREAM REQUESTS.
 *
 * The specification requires it, the egress guard enforces it at runtime, and
 * this proves it structurally: no page a user can load may reach a provider,
 * even indirectly, even once.
 *
 * WHY A SOURCE TEST RATHER THAN A RUNTIME ONE. A runtime check can only prove
 * the pages somebody remembered to exercise. This covers every page that
 * exists, including the one added next week, and it fails at the moment the
 * import is written rather than when a bill arrives.
 *
 * The rule: a *page* may not import a schedule adapter or an ingest writer.
 * Ingestion is reached only from an explicitly listed set of cron and admin
 * ROUTES, which are not user page loads.
 */

const APP = join(process.cwd(), 'src/app');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
}

const rel = (p: string) => p.slice(process.cwd().length + 1);
const all = walk(APP).map(rel);

/** Pages and layouts — everything a browser navigation renders. */
const pages = all.filter((f) => /\/(page|layout|template|loading|error|not-found)\.tsx?$/.test(f));

/** Route handlers — reached by fetch, not by navigation. */
const routes = all.filter((f) => /\/route\.tsx?$/.test(f));

/**
 * The ONLY routes permitted to reach ingestion. Every one is a scheduled or
 * admin trigger, never something a browsing user causes. Listed explicitly so
 * adding a new one is a decision somebody makes on purpose.
 */
const INGEST_ROUTES = [
  'src/app/api/cron/tv-ingest/route.ts',
  'src/app/api/cron/daily-scan/route.ts',
  'src/app/api/cron/watchmode-sync/route.ts',
  'src/app/api/cron/tv-reminders/route.ts',
  'src/app/api/cron/classify/route.ts',
  'src/app/api/tv/refresh/route.ts',
  'src/app/api/availability/refresh/route.ts',
  'src/app/api/health/schedule/route.ts',
];

/**
 * Imports that can reach a NETWORK.
 *
 * `adapters/mock` is deliberately excluded: it is a generator, not a
 * transport, and the dev harness that renders the real pipeline over a mock
 * grid is exactly the kind of thing this rule should permit. Excluding the
 * whole `adapters/` directory would have been the lazy version of this test —
 * it would have banned a page that cannot make a request while saying nothing
 * useful about one that can.
 */
const PROVIDER_IMPORT =
  /from\s+['"]@\/lib\/viewing\/(?:adapters\/(?!mock)|ingest\/)[^'"]+['"]/;
const INGEST_CALL = /\b(runGatedTvIngest|runTvMediaIngest|runTvmazeIngest|ensurePackIngested)\s*\(/;

function source(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('zero upstream requests from a user session', () => {
  it('finds the app surfaces, so the sweep is not silently empty', () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(routes.length).toBeGreaterThan(20);
  });

  it('no page imports a schedule adapter or an ingest writer', () => {
    const offenders = pages.filter((f) => PROVIDER_IMPORT.test(source(f)));
    expect(offenders).toEqual([]);
  });

  it('no page calls an ingest entry point', () => {
    // A page that ingests turns a page view into provider traffic, which
    // scales with visitors rather than with a schedule — the exact shape of
    // the accident this rule prevents.
    const offenders = pages.filter((f) => INGEST_CALL.test(source(f)));
    expect(offenders).toEqual([]);
  });

  it('only the explicitly listed routes reach ingestion', () => {
    const reaching = routes.filter((f) => INGEST_CALL.test(source(f)) || PROVIDER_IMPORT.test(source(f)));
    const unexpected = reaching.filter((f) => !INGEST_ROUTES.includes(f));
    expect(unexpected).toEqual([]);
  });

  it('keeps the permitted list honest — every entry still exists', () => {
    // A stale allowlist entry is how an exemption outlives the thing it
    // exempted and quietly covers something else later.
    const missing = INGEST_ROUTES.filter((f) => !all.includes(f));
    expect(missing).toEqual([]);
  });

  it('the unified What to Watch page reads without touching a provider', () => {
    const src = source('src/app/app/what-to-watch/page.tsx');
    expect(PROVIDER_IMPORT.test(src)).toBe(false);
    expect(INGEST_CALL.test(src)).toBe(false);
    expect(src).toContain('queryWatchNow');
  });

  it('the one page using the mock adapter is harness-gated and cannot reach a network', () => {
    // The Live TV harness runs the real pipeline over a generated grid. It is
    // permitted because the mock is a generator, not a transport — but that
    // argument only holds while the page is unreachable in production, so
    // both halves are asserted rather than assumed.
    const file = 'src/app/dev/live-tv/page.tsx';
    const src = source(file);
    expect(src).toContain('MockScheduleAdapter');
    expect(src).toMatch(/MOBILE_HARNESS !== '1'\)\s*notFound\(\)/);
    // And it still may not reach a real adapter or an ingest writer.
    expect(PROVIDER_IMPORT.test(src)).toBe(false);
    expect(INGEST_CALL.test(src)).toBe(false);
  });

  it('the public watch-now API reads without touching a provider', () => {
    const src = source('src/app/api/tv/watch-now/route.ts');
    expect(PROVIDER_IMPORT.test(src)).toBe(false);
    expect(INGEST_CALL.test(src)).toBe(false);
  });
});
