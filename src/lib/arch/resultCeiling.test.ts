/**
 * HOW MANY RESULTS DOES A SEARCH RETURN?
 *
 * The user asked for movies under two hours and got a handful. Not because the
 * catalogue is thin — because FOUR separate ceilings, in four files, each
 * independently capped the answer, and no test compared them to each other:
 *
 *   1. `detectors.ts` defaulted an unstated count to 8.
 *   2. `askParse.ts` — the live path for every free-text ask — ALSO defaulted
 *      to 8, and capped a stated count at 20.
 *   3. `finder.ts` documented 24 at length. Nothing reached it.
 *   4. `runFinder` hydrated the first 16 candidates it found, a constant with
 *      no relationship to the requested limit, so 16 was the hard maximum the
 *      product could return and the filters took it down to about 8 from there.
 *
 * Each looked reasonable alone. The bug was in the disagreement, which is
 * exactly what a unit test of any one of them cannot see. So this test reads
 * the sources and asserts they still agree — and that no new bare constant has
 * appeared beneath the limit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RESULT_COUNT, MAX_REQUESTED_COUNT } from '@/lib/nlu/count';
import { DEFAULT_COUNT } from '@/lib/nlu/detectors';
import { candidateTarget, MAX_CANDIDATES } from '@/lib/finderPool';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('one definition of "a page of results"', () => {
  it('every count default resolves to the same number', () => {
    expect(DEFAULT_COUNT).toBe(DEFAULT_RESULT_COUNT);
  });

  it('the finder re-exports the shared constants rather than restating them', () => {
    const src = read('src/lib/finder.ts');
    expect(src).toMatch(/DEFAULT_RESULT_LIMIT\s*=\s*DEFAULT_RESULT_COUNT/);
    expect(src).toMatch(/MAX_RESULT_LIMIT\s*=\s*MAX_REQUESTED_COUNT/);
  });

  it('the AI ask parser defaults to the shared page, not its own number', () => {
    const src = read('src/lib/askParse.ts');
    expect(src).toContain('DEFAULT_RESULT_COUNT');
    // The literal fallback that made every free-text ask return eight.
    expect(src).not.toMatch(/raw\.count[\s\S]{0,120}:\s*8\b/);
  });

  it('a page is big enough to read as a shelf rather than a shortlist', () => {
    expect(DEFAULT_RESULT_COUNT).toBeGreaterThanOrEqual(20);
    expect(MAX_REQUESTED_COUNT).toBeGreaterThanOrEqual(DEFAULT_RESULT_COUNT);
  });
});

describe('nothing caps the answer below the requested limit', () => {
  it('the fixed 16-candidate cap is gone', () => {
    const src = read('src/lib/finder.ts');
    expect(src).not.toMatch(/CANDIDATE_CAP\s*=\s*\d+/);
    expect(src).toContain('candidateTarget(limit)');
  });

  it('the pool can always hold a full page, plus attrition headroom', () => {
    // Hard filters run AFTER hydration — unknown runtime, missed audience
    // floor, not on your services — so a pool merely equal to the limit
    // returns a fraction of it.
    expect(candidateTarget(DEFAULT_RESULT_COUNT)).toBeGreaterThan(DEFAULT_RESULT_COUNT);
    expect(candidateTarget(MAX_REQUESTED_COUNT)).toBeGreaterThanOrEqual(MAX_REQUESTED_COUNT);
  });

  it('but the fan-out stays bounded — every candidate is a full hydration', () => {
    expect(candidateTarget(100_000)).toBe(MAX_CANDIDATES);
    expect(MAX_CANDIDATES).toBeLessThanOrEqual(200);
  });

  it('discover depth is derived from the limit, not two hardcoded pages', () => {
    const src = read('src/lib/finder.ts');
    expect(src).toContain('discoverPages(limit');
    expect(src).not.toMatch(/\[1,\s*2\]\.map\(\(page\)/);
  });

  it('hydration is concurrency-bounded, not one request per candidate at once', () => {
    const src = read('src/lib/finder.ts');
    expect(src).toContain('mapPool(');
    expect(src).toContain('HYDRATE_CONCURRENCY');
  });
});
