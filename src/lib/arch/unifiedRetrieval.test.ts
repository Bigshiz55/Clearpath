import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ARCHITECTURAL INVARIANT — one unified retrieval pipeline.
 *
 * Every API route that turns FREE-TEXT into a retrieval query (i.e. it both runs
 * the finder AND parses natural language via parseAskWithAI / naiveParseQuery)
 * MUST route that text through the shared constraint-augmentation layer
 * (augmentInternational). That layer is what enforces foreign origin, original
 * language, English-audio and runtime — constraints neither the LLM schema nor
 * the regex parser extract. A route that skips it silently drops those hard
 * constraints and leaks wrong-origin / wrong-audio results.
 *
 * This test fails if ANY new NL-retrieval route bypasses the layer, so the
 * "ONE pipeline" guarantee can't quietly regress as routes are added. It is a
 * static source scan (no server, no secrets) — deterministic and offline.
 */

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findRouteFiles(p));
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

interface RouteFacts {
  path: string;
  rel: string;
  src: string;
  runsFinder: boolean;
  parsesFreeText: boolean;
  augments: boolean;
}

function classify(path: string): RouteFacts {
  const src = readFileSync(path, 'utf8');
  return {
    path,
    rel: path.slice(path.indexOf('/api/')),
    src,
    // Retrieval: builds/executes a FinderQuery-based search.
    runsFinder: /\brunFinder\b/.test(src),
    // Free-text parsing into a query (the two sanctioned NL parsers).
    parsesFreeText: /\bparseAskWithAI\b/.test(src) || /\bnaiveParseQuery\b/.test(src),
    augments: /\baugmentInternational\b/.test(src),
  };
}

describe('unified retrieval pipeline (architectural invariant)', () => {
  const routes = findRouteFiles(API_DIR).map(classify);

  it('discovers a non-trivial set of API routes', () => {
    // Guard against a broken glob silently making every assertion vacuous.
    expect(routes.length).toBeGreaterThan(20);
  });

  it('at least the known NL-retrieval routes are present (non-vacuous)', () => {
    const nl = routes.filter((r) => r.runsFinder && r.parsesFreeText).map((r) => r.rel);
    expect(nl).toContain('/api/ask/route.ts');
    expect(nl).toContain('/api/finder/route.ts');
  });

  it('EVERY free-text retrieval route goes through augmentInternational', () => {
    const offenders = routes
      .filter((r) => r.runsFinder && r.parsesFreeText && !r.augments)
      .map((r) => r.rel);
    // A helpful failure message lists exactly which route bypassed the layer.
    expect(offenders, `these NL-retrieval routes bypass the constraint layer: ${offenders.join(', ')}`).toEqual([]);
  });
});


/**
 * SEARCH RANKS BEFORE IT CUTS.
 *
 * "I searched for gone and only pulled up gone girl." The endpoint sorted
 * TMDB's hundreds of "gone" matches by popularity and kept twenty — so the film
 * actually called Gone was discarded before anything downstream could rank it
 * up. Every ranker in the codebase was working correctly on a list that no
 * longer contained the right answer.
 *
 * The unit test for the behaviour is in `nlu/titleNormalize.test.ts`. This pins
 * the WIRING, because `tmdb/client.ts` is server-only and the truncation is one
 * line that is very easy to "tidy" back into a popularity sort.
 */
describe('title search', () => {
  const client = readFileSync(join(process.cwd(), 'src/lib/tmdb/client.ts'), 'utf8');

  it('orders by title identity, not by fame alone', () => {
    expect(client).toContain('rankAndLimit(');
  });

  it('no bare popularity sort decides which results survive', () => {
    expect(client, 'searchTitles truncates a popularity-sorted list again').not.toMatch(
      /sort\(\(a, b\) => \(b\.popularity[^)]*\)[^)]*\)\.slice\(/,
    );
  });

  it('the cut happens inside the ranker, so it cannot be applied first', () => {
    const rank = readFileSync(join(process.cwd(), 'src/lib/nlu/titleNormalize.ts'), 'utf8');
    const fn = rank.slice(rank.indexOf('export function rankAndLimit'));
    // rankByTitleIdentity(...).slice(...) — one expression, one order.
    expect(fn).toMatch(/rankByTitleIdentity\([\s\S]{0,200}\)\.slice\(/);
  });
});
