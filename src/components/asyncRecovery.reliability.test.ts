import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — item 8, "add recovery to every asynchronous
 * feature." A codebase sweep found a dozen client components that fetch
 * data on mount/interaction with no bound on how long "loading" is allowed
 * to mean something, and several that mapped a genuine fetch failure to
 * the exact same UI as a confirmed-empty result. Source-level on purpose:
 * these are client components whose failure paths depend on network
 * timing, not meaningfully exercisable without a live backend.
 */

describe('every fetch fixed this pass now routes through fetchWithTimeout, the one shared bound', () => {
  const sites = [
    'src/components/EasyOnTv.tsx',
    'src/components/DnaScore.tsx',
    'src/components/BrowseCatalog.tsx',
    'src/components/SearchBar.tsx',
    'src/components/AskTheJudge.tsx',
    'src/components/TogetherPlanner.tsx',
    'src/components/VerdictDelivery.tsx',
    'src/components/TvDetective.tsx',
    'src/components/Mentalist.tsx',
    'src/components/QuickLook.tsx',
  ];

  it.each(sites)('%s imports and uses fetchWithTimeout', (path) => {
    const src = read(path);
    expect(src).toMatch(/import\s*\{\s*fetchWithTimeout\s*\}\s*from\s*'@\/lib\/fetchWithTimeout'/);
    expect(src).toContain('fetchWithTimeout(');
  });
});

describe('HomeRecommendations and Top10Slate — the homepage\'s main content never spins or vanishes forever', () => {
  const sites = ['src/components/HomeRecommendations.tsx', 'src/components/Top10Slate.tsx'];

  it.each(sites)('%s races the recommendation-slate server action against a bounded timeout', (path) => {
    const src = read(path);
    expect(src).toMatch(/SLATE_TIMEOUT_MS/);
    expect(src).toMatch(/Promise\.race/);
  });

  it.each(sites)('%s wraps the slate call in try/catch — a rejection is no longer an unhandled promise', (path) => {
    const src = read(path);
    expect(src).toMatch(/\}\s*catch\s*\{\s*\n\s*if \(live\) setFailed\(true\)/);
  });

  it.each(sites)('%s shows a real error state with a retry, not a silent null/return', (path) => {
    const src = read(path);
    expect(src).toContain('data-testid="top10-error"');
    expect(src).toMatch(/onClick=\{\(\) => setAttempt/);
  });
});

describe('a real fetch failure is never mapped to the same UI as a confirmed-empty result', () => {
  it('EasyOnTv distinguishes "couldn\'t check" from "nothing airing"', () => {
    const src = read('src/components/EasyOnTv.tsx');
    expect(src).toContain('data-testid="easy-tv-error"');
    expect(src).not.toMatch(/\.catch\(\(\) => active && setAirings\(\[\]\)\)/);
  });

  it('BrowseCatalog distinguishes a failed page load from "nothing matches those filters"', () => {
    const src = read('src/components/BrowseCatalog.tsx');
    expect(src).toContain('data-testid="browse-error"');
    expect(src).toContain('failedPage');
  });

  it('BrowseCatalog surfaces a failed "Load more" instead of failing completely silently', () => {
    const src = read('src/components/BrowseCatalog.tsx');
    expect(src).toContain('data-testid="browse-load-more-error"');
  });

  it('TvDetective distinguishes a failed scan from "the trail went cold"', () => {
    const src = read('src/components/TvDetective.tsx');
    expect(src).toContain('data-testid="detective-error"');
    expect(src).toMatch(/picks\.length === 0 && failed/);
  });
});

describe('QuickLook offers a real retry instead of requiring the modal to be closed and reopened', () => {
  it('has a retry button that re-runs the fetch effect', () => {
    const src = read('src/components/QuickLook.tsx');
    expect(src).toMatch(/onClick=\{\(\) => setAttempt\(\(n\) => n \+ 1\)\}/);
    expect(src).toMatch(/\[target\.id, target\.mediaType, attempt\]/);
  });
});
