/**
 * DELETED ORPHANS STAY DELETED — graph Phase 7, cross-surface consolidation.
 *
 * The Phase-0 caller audit (exhaustive, file:line) found `/api/recommendations`
 * had ZERO callers — no fetch, no navigation, nothing in src/, scripts/,
 * eval/, tests/ — while its POST was the only reach into `parseRecFeedback`,
 * a THIRD natural-language reader (regex + its own gpt-4o-mini prompt) beside
 * the canonical interpreter and the ask parser. An NL parser reachable only
 * through an unreachable door is exactly how a second interpretation of
 * English survives to drift.
 *
 * What stays, deliberately: `recommend.ts` (4 importers, 5 live components),
 * the `RecFilters` types it consumes, and `/api/finder` (3 live callers and
 * the build-case platform branch lands on it by design).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

describe('the recommendations orphan is gone', () => {
  it('the HTTP route no longer exists', () => {
    expect(existsSync(join(ROOT, 'src/app/api/recommendations'))).toBe(false);
  });

  it('recFeedback keeps the live filter types and carries no parser', () => {
    const src = readFileSync(join(ROOT, 'src/lib/recFeedback.ts'), 'utf8');
    expect(src).toMatch(/export const NO_FILTERS/);
    expect(src).toMatch(/export function hasFilters/);
    // No model call, no regex NL pass — the canonical interpreter owns English.
    expect(src).not.toMatch(/openai|parseRecFeedback|naiveParseFeedback/);
  });

  it('the live recommender still consumes the kept types', () => {
    const src = readFileSync(join(ROOT, 'src/lib/recommend.ts'), 'utf8');
    expect(src).toMatch(/from '@\/lib\/recFeedback'/);
  });
});
