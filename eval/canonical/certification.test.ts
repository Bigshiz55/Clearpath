import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { interpret } from '@/lib/interpret/interpret';
import { intentToQuery } from '@/lib/ask/canonicalExecution';

/**
 * CERTIFICATION FOR THE OWNER PRODUCTION ACTUALLY RUNS.
 *
 * ── THE FORENSIC FINDING THIS FILE EXISTS TO CORRECT ──────────────────────
 * `/api/ask` interprets through `interpret()` → `resolveCanonicalExecution`.
 * The 20,000-case suite does not. `eval/normalize/normalize.ts` imports
 * `naiveParseQuery` (line 19) and calls it (line 166); `interpret()` appeared
 * NOWHERE under `eval/` before this file. `normalize.ts:58` even documents that
 * it MIRRORS naiveParseQuery's handling of "show" — so the suite reproduced the
 * legacy semantics that caused the media defect and could never have reported
 * it.
 *
 * That is why a 20,000-case run scored composite 92.6% while the canonical
 * interpreter was returning `either` for "show me movies": the suite was
 * grading a parser that production no longer asks. A green number about the
 * wrong subject is worse than no number, because it is mistaken for assurance.
 *
 * So this suite certifies `CanonicalIntent` directly, from the frozen cases in
 * `eval/gold/regression.frozen.json` — the versioned half of the store
 * `loadRegressionExtras()` reads, so the cases serve both the legacy scorer and
 * this one rather than forking into a second corpus.
 *
 * `naiveParseQuery` remains legitimate for LEGACY FINDER paths. What it may not
 * be is the thing that certifies /api/ask.
 */

interface FrozenCase {
  id: string;
  rawQuery: string;
  archetype: string;
  canonical?: Record<string, unknown>;
}

const CASES: FrozenCase[] = JSON.parse(
  fs.readFileSync(path.resolve('eval/gold/regression.frozen.json'), 'utf8'),
) as FrozenCase[];

/** Injected so a date expectation is pinned rather than drifting each January. */
const NOW = Date.parse('2026-08-18T00:00:00Z');

describe('the frozen corpus is intact', () => {
  it('carries every discovered failure family', () => {
    const families = new Set(CASES.map((c) => c.archetype));
    for (const required of [
      'relative_dates',
      'media_ownership',
      'provider_ownership',
      'count_ownership',
      'person_ownership',
      'title_protection',
    ]) {
      expect(families, `missing frozen family: ${required}`).toContain(required);
    }
  });

  it('every case states a canonical expectation — a case that asserts nothing certifies nothing', () => {
    for (const c of CASES) {
      expect(Object.keys(c.canonical ?? {}).length, `${c.id} has no canonical expectation`).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });
});

describe('CanonicalIntent certification — every frozen case', () => {
  for (const c of CASES) {
    it(`${c.id} — ${c.rawQuery}`, () => {
      const intent = interpret(c.rawQuery);
      const e = (c.canonical ?? {}) as Record<string, never>;
      const has = (k: string) => Object.prototype.hasOwnProperty.call(c.canonical ?? {}, k);

      if (has('media')) expect(intent.media, 'media').toBe(e['media']);
      if (has('requestedCount')) expect(intent.requestedCount, 'requestedCount').toBe(e['requestedCount']);
      if (has('requestedCountNull')) expect(intent.requestedCount, 'requestedCount').toBeNull();

      if (has('lookback')) expect(intent.date.lookback, 'date.lookback').toEqual(e['lookback']);
      if (has('lookbackUnit')) expect(intent.date.lookback?.unit, 'lookback unit').toBe(e['lookbackUnit']);
      if (has('lookbackDirection')) expect(intent.date.lookback?.direction, 'lookback direction').toBe(e['lookbackDirection']);
      if (has('lookbackAbsent')) expect(intent.date.lookback, 'lookback must be absent').toBeUndefined();
      // THE PURITY BOUNDARY: the interpreter never resolves a year itself.
      if (has('minYearAbsent')) expect(intent.date.minYear, 'interpreter must not compute a year').toBeUndefined();

      if (has('providerContains')) {
        expect(intent.providers.join('|').toLowerCase(), 'providers').toContain(String(e['providerContains']));
      }
      if (has('personContains')) {
        expect(intent.people.map((p) => p.span).join('|'), 'people').toContain(String(e['personContains']));
      }
      if (has('personNeverContains')) {
        for (const p of intent.people) {
          expect(p.span.toLowerCase(), 'a request verb leaked into a person span').not.toContain(
            String(e['personNeverContains']).toLowerCase(),
          );
        }
      }
      if (has('notRecommendation')) expect(intent.kind, 'a title is not an order').not.toBe('recommendation');
      if (has('noPeople')) expect(intent.people.map((p) => p.span), 'no person named').toEqual([]);
    });
  }
});

describe('a relative window survives all the way to the executable query', () => {
  it('"movies from the last 5 years" reaches the Finder as minReleaseDate', () => {
    const { query } = intentToQuery(interpret('movies from the last 5 years'), { now: NOW });
    expect(query.minReleaseDate).toBe('2021-08-18');
    expect(query.mediaType).toBe('movie');
  });

  it('"recent crime movies" also reaches it — the bare-noun-phrase request', () => {
    const { query } = intentToQuery(interpret('recent crime movies'), { now: NOW });
    expect(query.minReleaseDate).toBe('2021-08-18');
  });
});

/**
 * CODE, NOT COMMENTARY.
 *
 * The first cut of these guards searched raw file text and failed on the very
 * doc comments that explain the rule — naming a legacy parser in prose is how
 * you document that it is forbidden. A guard that cannot tell an import from a
 * sentence would push every future author to stop writing the explanation, so
 * it strips comments and string literals and asserts against what EXECUTES.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""');
}

const LEGACY_OWNERS = ['naiveParseQuery', 'parseTopicTerms', 'parseRequestedCount', 'resolvePerson'];

describe('certification does not re-derive meaning with the legacy parser', () => {
  it('this suite certifies through interpret(), never through a legacy parser', () => {
    const src = codeOnly(fs.readFileSync(__filename, 'utf8'));
    for (const legacy of LEGACY_OWNERS) {
      expect(src, `certification must not call ${legacy}`).not.toContain(`${legacy}(`);
    }
    expect(src).toContain('interpret(');
  });

  it('the canonical execution module does not re-run the legacy parsers', () => {
    /* The ownership rule at the seam that matters: once canonical
       interpretation has happened, nothing downstream may quietly re-read the
       raw sentence with the old parser and disagree with it. */
    const exec = codeOnly(fs.readFileSync(path.resolve('src/lib/ask/canonicalExecution.ts'), 'utf8'));
    for (const legacy of LEGACY_OWNERS) {
      expect(exec, `canonicalExecution must not call ${legacy}`).not.toContain(`${legacy}(`);
    }
  });

  it('the interpreter does not re-run them either', () => {
    const dir = path.resolve('src/lib/interpret');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = codeOnly(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const legacy of LEGACY_OWNERS) {
        expect(src, `${f} must not call ${legacy}`).not.toContain(`${legacy}(`);
      }
    }
  });
});
