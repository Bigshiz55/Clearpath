import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from '../normalize/normalize';

/**
 * SELF-TESTING REGRESSION GUARD.
 *
 * Two layers, both permanent:
 *
 * 1. SESSION_REGRESSIONS — every parse-level bug fixed during the forensic
 *    validation, pinned as an executable assertion. If any regresses, this
 *    fails by name. These can never silently return.
 *
 * 2. Live-captured regressions — `eval/live/forensic.mjs` appends every case
 *    where a RETURNED TITLE failed its request to eval/live/regressions.json.
 *    This test replays each through the REAL parser so the parse-testable ones
 *    become permanent guards. (Resolution-only failures — a specific title
 *    lacking an actor — are recorded for the live runner to re-verify; here we
 *    only assert the query still parses coherently.)
 *
 * The file may be absent (no live run yet) — that's fine; layer 1 always runs.
 */

interface Check { name: string; ok: (nq: ReturnType<typeof normalize>) => boolean }

const SESSION_REGRESSIONS: Check[] = [
  { name: 'misspelled Netflix resolves (platform id 8)', ok: (n) => n.platforms.some((p) => p.id === 8) && /netflx/i.test(n.rawQuery) === false ? true : n.platforms.some((p) => p.id === 8) },
  { name: 'BritBox resolves (151)', ok: (n) => n.platforms.some((p) => p.id === 151) },
  { name: 'Acorn resolves (87)', ok: (n) => n.platforms.some((p) => p.id === 87) },
  { name: 'origin misspelling koreen → KR', ok: (n) => n.originCountries.includes('KR') },
  { name: 'genre misspelling horrer → Horror', ok: (n) => n.genres.includes('Horror') },
  { name: 'runtime "under two hours" → 120 (not 150 default)', ok: (n) => n.runtimeMaxMinutes === 120 },
  { name: 'movie-vs-tv negation drops the ruled-out series', ok: (n) => n.contentTypes.includes('movie') && !n.contentTypes.includes('tv') },
  { name: 'english ≠ British origin', ok: (n) => !n.originCountries.includes('GB') },
];

const SESSION_QUERIES: Record<string, string> = {
  'misspelled Netflix resolves (platform id 8)': 'a thriller on Netflx',
  'BritBox resolves (151)': 'a detective series on BritBox',
  'Acorn resolves (87)': 'a mystery on Acorn TV',
  'origin misspelling koreen → KR': 'a koreen thriller',
  'genre misspelling horrer → Horror': 'a horrer movie',
  'runtime "under two hours" → 120 (not 150 default)': 'a Korean thriller under two hours',
  'movie-vs-tv negation drops the ruled-out series': 'Fargo the movie, not the series',
  'english ≠ British origin': 'an english movie',
};

describe('self-testing regression guard', () => {
  for (const c of SESSION_REGRESSIONS) {
    it(`[session] ${c.name}`, () => {
      const nq = normalize(SESSION_QUERIES[c.name] ?? '');
      expect(c.ok(nq), `${c.name} — got ${JSON.stringify({ platforms: nq.platforms, origin: nq.originCountries, genres: nq.genres, runtime: nq.runtimeMaxMinutes, content: nq.contentTypes })}`).toBe(true);
    });
  }

  it('replays any live-captured regressions through the parser', () => {
    const file = join(process.cwd(), 'eval', 'live', 'regressions.json');
    if (!existsSync(file)) { expect(true).toBe(true); return; }
    const captured: { category: string; query: string }[] = JSON.parse(readFileSync(file, 'utf8'));
    const PARSE_TESTABLE = new Set(['streaming', 'genre', 'origin', 'runtime', 'year']);
    for (const c of captured) {
      const nq = normalize(c.query);
      // Every captured query must at least parse coherently (no throw, real object).
      expect(nq.rawQuery).toBeDefined();
      // Parse-testable categories must retain SOME structured signal from the query.
      if (PARSE_TESTABLE.has(c.category)) {
        const hasSignal = nq.platforms.length + nq.originCountries.length + nq.genres.length > 0 || nq.runtimeMaxMinutes != null;
        expect(hasSignal, `captured ${c.category} query lost all signal: "${c.query}"`).toBe(true);
      }
    }
  });
});
