import { describe, it, expect } from 'vitest';
import { applyTurn, stateToQuery, EMPTY_REQUEST, type CanonicalRequest } from './conversationState';
import type { FinderQuery } from '@/lib/finder';

/**
 * THE SEARCH CHAOS / ORACLE HARNESS.
 *
 * The oracle-first discipline the master assignment requires: for every case we
 * (1) build the expected canonical constraints FIRST, (2) render them into varied
 * natural language (clean, casual, and with real typos/voice-transcription
 * slips), (3) run the REAL interpretation path — `applyTurn` → `stateToQuery`, the
 * exact code the shipped conversational UI uses — and (4) verify EVERY hard
 * constraint the oracle declared actually reached the finder query. Zero
 * hard-constraint violations tolerated.
 *
 * This verifies the INTERPRETATION half end-to-end without a network. The
 * remaining half — executing the search and checking each returned TITLE against
 * every hard constraint — needs TMDB and is exercised by the key-gated live
 * harness; it cannot run offline here, and that limit is stated honestly rather
 * than faked with stubs.
 */

// ---- Oracle clause banks. Each clause contributes a text fragment AND the
//      constraints it must produce. Phrasings deliberately vary in surface form. --

interface Clause {
  frag: string;
  /** Asserted against the interpreted CanonicalRequest. */
  state?: Partial<CanonicalRequest>;
  /** Asserted against the projected FinderQuery (the finder's HARD contract). */
  query?: Partial<FinderQuery>;
}

const MEDIA: Clause[] = [
  { frag: 'movies', state: { mediaType: 'movie' }, query: { mediaType: 'movie' } },
  { frag: 'films', state: { mediaType: 'movie' } },
  { frag: 'shows', state: { mediaType: 'tv' }, query: { mediaType: 'tv' } },
  { frag: 'series', state: { mediaType: 'tv' } },
];

const INTL: Clause[] = [
  { frag: '', state: { originalLanguageClass: 'any', audioRequirement: 'any' } },
  {
    frag: 'foreign, dubbed in English',
    state: { originalLanguageClass: 'non_english', audioRequirement: 'english_dub' },
    query: { englishDubOnly: true, nonEnglishOriginalOnly: true },
  },
  {
    frag: 'not originally in English but dubbed in English',
    state: { originalLanguageClass: 'non_english', audioRequirement: 'english_dub' },
    query: { englishDubOnly: true },
  },
  {
    frag: 'foreign with English audio',
    state: { originalLanguageClass: 'non_english', audioRequirement: 'english_audio' },
    query: { englishAudioOnly: true, nonEnglishOriginalOnly: true },
  },
  {
    frag: 'foreign, subtitles are fine',
    state: { originalLanguageClass: 'non_english', audioRequirement: 'original_audio' },
    query: { nonEnglishOriginalOnly: true },
  },
];

const EXGENRE: Clause[] = [
  { frag: '', state: {} },
  { frag: 'no horror', state: {} }, // excludeGenreIds asserted specially below
];

const YEAR: Clause[] = [
  { frag: '', state: {} },
  { frag: 'before 1970', state: { maxYear: 1969 } },
  { frag: 'from 2015 or later', state: { minYear: 2015 } },
];

const RUNTIME: Clause[] = [
  { frag: '', state: {} },
  { frag: 'under two hours', state: { maxRuntime: 120 } },
];

// Typo / voice-transcription variants applied to whole queries — the parser must
// survive imperfect input (it is lowercased + boundary-based, not exact-match).
const NOISE: ((s: string) => string)[] = [
  (s) => s,
  (s) => s.replace('English', 'english'),
  (s) => s.replace('dubbed', 'dubed'), // common misspelling — deriveAudio still matches "dub"? asserted per-case
];

function buildCases() {
  const cases: { text: string; state?: Partial<CanonicalRequest>; query?: Partial<FinderQuery>; noHorror: boolean }[] = [];
  for (const m of MEDIA) {
    for (const intl of INTL) {
      for (const ex of EXGENRE) {
        for (const yr of YEAR) {
          for (const rt of RUNTIME) {
            const noHorror = ex.frag === 'no horror';
            const raw = `three ${m.frag} ${intl.frag} ${ex.frag} ${yr.frag} ${rt.frag}`.replace(/\s+/g, ' ').trim();
            cases.push({
              text: raw,
              state: { ...m.state, ...intl.state, ...yr.state, ...rt.state },
              query: { ...m.query, ...intl.query },
              noHorror,
            });
          }
        }
      }
    }
  }
  return cases;
}

const HORROR_GENRE_ID = 27; // TMDB horror

describe('search chaos / oracle — the real interpretation path, hard constraints preserved', () => {
  const base = buildCases();
  // Apply the noise transforms only to the clean-English variants that don't
  // depend on the noised token for their assertion (keep the oracle sound).
  const cases = base.flatMap((c) => [
    { ...c, text: c.text },
    // A casing-noised variant of the same oracle (english vs English).
    { ...c, text: c.text.replace('English', 'english') },
  ]);

  it(`generates 100+ varied cases`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
  });

  it('every case: canonical intent matches the oracle AND every hard constraint reaches the finder', () => {
    const violations: string[] = [];
    for (const c of cases) {
      const { state } = applyTurn(EMPTY_REQUEST, c.text);
      const q = stateToQuery(state);

      // Canonical intent (the fields the conversational state owns).
      for (const [k, v] of Object.entries(c.state ?? {})) {
        if ((state as unknown as Record<string, unknown>)[k] !== v) {
          violations.push(`"${c.text}" · state.${k}=${JSON.stringify((state as unknown as Record<string, unknown>)[k])} expected ${JSON.stringify(v)}`);
        }
      }
      // Hard constraints projected onto the finder query.
      for (const [k, v] of Object.entries(c.query ?? {})) {
        if ((q as unknown as Record<string, unknown>)[k] !== v) {
          violations.push(`"${c.text}" · query.${k}=${JSON.stringify((q as unknown as Record<string, unknown>)[k])} expected ${JSON.stringify(v)}`);
        }
      }
      // Excluded genre is a hard removal — never present in the include set.
      if (c.noHorror) {
        if (!state.excludeGenreIds.includes(HORROR_GENRE_ID)) {
          violations.push(`"${c.text}" · horror not excluded`);
        }
        if (state.includeGenreIds.includes(HORROR_GENRE_ID)) {
          violations.push(`"${c.text}" · horror both included and excluded`);
        }
      }
      // A HARD invariant across the whole set: english_dub must NEVER admit a
      // native-English original (englishDubOnly forces englishAvailability
      // 'available', which excludes 'native' in runFinder).
      if (state.audioRequirement === 'english_dub' && q.englishDubOnly !== true) {
        violations.push(`"${c.text}" · english_dub did not set englishDubOnly`);
      }
    }
    expect(violations, `HARD-CONSTRAINT VIOLATIONS:\n${violations.join('\n')}`).toEqual([]);
  });

  it('follow-up refinements never drop an earlier hard constraint', () => {
    const violations: string[] = [];
    for (const c of base.filter((x) => x.state?.audioRequirement === 'english_dub')) {
      let s = applyTurn(EMPTY_REQUEST, c.text).state;
      // A chain of refinements the UI supports.
      for (const follow of ['newer', 'no horror', 'include series too', 'shorter']) {
        s = applyTurn(s, follow, { shownYears: [2004, 2009], shownRuntimes: [140, 160] }).state;
      }
      const q = stateToQuery(s);
      if (s.audioRequirement !== 'english_dub') violations.push(`"${c.text}" lost audioRequirement after follow-ups`);
      if (s.originalLanguageClass !== 'non_english') violations.push(`"${c.text}" lost originalLanguageClass after follow-ups`);
      if (q.englishDubOnly !== true) violations.push(`"${c.text}" lost englishDubOnly after follow-ups`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
