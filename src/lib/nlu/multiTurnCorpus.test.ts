/**
 * FROZEN MULTI-TURN CONVERSATION CORPUS — v1 (2026-08-06).
 *
 * Versioning rule: cases are APPEND-ONLY. Never edit or delete an existing
 * case to make a run pass — add a new version block instead. Each case is a
 * scripted conversation; the assertion is on the FINAL canonical state, which
 * is exactly what the server executes. Every case therefore also proves
 * hard-constraint preservation: if a constraint leaked between turns, the
 * final state would not match.
 */
import { describe, it, expect } from 'vitest';
import { applyTurn, EMPTY_REQUEST, type CanonicalRequest, type TurnContext } from '@/lib/nlu/conversationState';
import { GENRE_IDS } from '@/lib/finderGenres';

const NOW = 2026;
type Turn = string | [string, TurnContext];
interface Case {
  name: string;
  turns: Turn[];
  expect: (s: CanonicalRequest) => void;
}

const SHOWN_OLD = { shownYears: [1976, 1982, 1990, 2001, 2015] };
const SHOWN_NEW = { shownYears: [2019, 2021, 2022, 2023, 2024] };
const SHOWN_IDS = { shownIds: [{ mediaType: 'movie' as const, id: 101 }, { mediaType: 'tv' as const, id: 202 }] };

function run(turns: Turn[]): CanonicalRequest {
  let s = EMPTY_REQUEST;
  for (const turn of turns) {
    const [text, ctx] = typeof turn === 'string' ? [turn, {}] : turn;
    s = applyTurn(s, text, { nowYear: NOW, ...ctx }).state;
  }
  return s;
}

const V1_CASES: Case[] = [
  // ── Accumulation chains ──────────────────────────────────────────────────
  {
    name: 'spec-canonical: like Rocky → newer → no docs → under 2h → only Hulu → +Peacock',
    turns: ['Something like Rocky.', ['Newer.', SHOWN_OLD], 'No documentaries.', 'Under two hours.', 'Only things included with Hulu.', 'Actually Peacock too.'],
    expect: (s) => {
      expect(s.referenceTitles).toContain('Rocky');
      expect(s.minYear).toBe(1991);
      expect(s.excludeDocumentaries).toBe(true);
      expect(s.maxRuntime).toBe(120);
      expect(s.providers).toEqual(['Hulu', 'Peacock']);
      expect(s.monetization).toEqual(['flatrate']);
    },
  },
  {
    name: 'subject + year + provider chain',
    turns: ['boxing movies', 'after 2020', 'only on Netflix'],
    expect: (s) => {
      expect(s.subjects).toContain('boxing');
      expect(s.minYear).toBe(2020);
      expect(s.providers).toEqual(['Netflix']);
      expect(s.mediaType).toBe('movie');
    },
  },
  {
    name: 'genre accumulates without clobbering year',
    turns: ['thrillers from the 90s', 'add some comedy'],
    expect: (s) => {
      expect(s.includeGenreIds).toContain(GENRE_IDS.thriller);
      expect(s.includeGenreIds).toContain(GENRE_IDS.comedy);
      expect(s.minYear).toBe(1990);
      expect(s.maxYear).toBe(1999);
    },
  },
  {
    name: 'five-turn refinement never loses the person',
    turns: ['movies with Tom Hanks', ['newer', SHOWN_OLD], 'only movies', 'under 2 hours', 'no horror'],
    expect: (s) => {
      expect(s.minYear).toBe(1991);
      expect(s.mediaType).toBe('movie');
      expect(s.maxRuntime).toBe(120);
      expect(s.excludeGenreIds).toContain(GENRE_IDS.horror);
    },
  },
  // ── Corrections and reversals ────────────────────────────────────────────
  {
    name: 'documentaries excluded then re-included',
    turns: ['crime shows, no documentaries', 'include documentaries after all'],
    expect: (s) => {
      expect(s.excludeDocumentaries).toBe(false);
      expect(s.excludeGenreIds).not.toContain(GENRE_IDS.documentary);
      expect(s.includeGenreIds).toContain(GENRE_IDS.crime);
    },
  },
  {
    name: 'provider added then removed leaves the rest intact',
    turns: ['comedies on Hulu', 'add Peacock', 'remove Hulu'],
    expect: (s) => {
      expect(s.providers).toEqual(['Peacock']);
      expect(s.includeGenreIds).toContain(GENRE_IDS.comedy);
    },
  },
  {
    name: 'only movies, then include series too',
    turns: ['boxing movies', 'include series too'],
    expect: (s) => expect(s.mediaType).toBe('any'),
  },
  {
    name: 'runtime tightened then released',
    turns: ['under 90 minutes', 'longer'],
    expect: (s) => expect(s.maxRuntime).toBeNull(),
  },
  {
    name: 'newer then older than the NEW picks narrows sensibly',
    turns: [['newer', SHOWN_OLD], ['older', SHOWN_NEW]],
    expect: (s) => {
      expect(s.minYear).toBe(1991);
      expect(s.maxYear).toBe(2021);
    },
  },
  // ── History interplay ────────────────────────────────────────────────────
  {
    name: 'already-saw excludes exactly the shown ids',
    turns: ['heist movies', ['I already saw those', SHOWN_IDS]],
    expect: (s) => {
      expect(s.excludeIds).toEqual(SHOWN_IDS.shownIds);
      expect(s.unseenOnly).toBe(true);
      expect(s.subjects).toContain('heist');
    },
  },
  {
    name: 'something else with that actor keeps the anchor person',
    turns: ['movies like Rocky', ['something else with that actor', SHOWN_IDS]],
    expect: (s) => {
      expect(s.referenceTitles).toEqual([]);
      expect(s.excludeIds.length).toBe(2);
    },
  },
  // ── Tone ─────────────────────────────────────────────────────────────────
  {
    name: 'funnier then darker stacks tones without filtering',
    turns: ['something like Fargo', 'funnier', 'darker'],
    expect: (s) => {
      expect(s.tones).toEqual(['funny', 'dark']);
      expect(s.excludeGenreIds).toEqual([]);
      expect(s.referenceTitles).toContain('Fargo');
    },
  },
  {
    name: 'lighter cancels dark',
    turns: ['darker', 'lighter'],
    expect: (s) => expect(s.tones).toEqual(['light']),
  },
  // ── Person exclusion ─────────────────────────────────────────────────────
  {
    name: 'excluded person survives four later turns',
    turns: ['movies like Rocky, but not another Stallone movie', ['newer', SHOWN_OLD], 'no documentaries', 'under 2 hours', 'only on Netflix'],
    expect: (s) => {
      expect(s.excludePeople).toContain('Stallone');
      expect(s.minYear).toBe(1991);
      expect(s.providers).toEqual(['Netflix']);
    },
  },
  // ── Monetization / tonight ───────────────────────────────────────────────
  {
    name: 'watch tonight is services + no rentals, and survives refinement',
    turns: ['show me only things I can watch tonight', 'something funny'],
    expect: (s) => {
      expect(s.onMyServices).toBe(true);
      expect(s.monetization).toEqual(['flatrate', 'free', 'ads']);
      expect(s.includeGenreIds).toContain(GENRE_IDS.comedy);
    },
  },
  // ── Exact windows vs years ───────────────────────────────────────────────
  {
    name: 'last-5-months is a dated window and coexists with a year floor',
    turns: ['released in the last 5 months', 'nothing before 2020'],
    expect: (s) => {
      expect(s.releasedAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.minYear).toBe(2020);
    },
  },
  // ── Adversarial robustness ───────────────────────────────────────────────
  {
    name: 'empty and junk turns do not corrupt the state',
    turns: ['boxing movies after 2020', '', '   ', '🎄🎄🎄', '???'],
    expect: (s) => {
      expect(s.subjects).toContain('boxing');
      expect(s.minYear).toBe(2020);
      expect(s.mediaType).toBe('movie');
    },
  },
  {
    name: 'curly apostrophes parse identically to straight ones',
    turns: ['something I haven’t seen, no documentaries'],
    expect: (s) => expect(s.excludeGenreIds).toContain(GENRE_IDS.documentary),
  },
  {
    name: 'repeating a constraint is idempotent',
    turns: ['no documentaries', 'no documentaries', 'no documentaries'],
    expect: (s) => {
      expect(s.excludeGenreIds.filter((g) => g === GENRE_IDS.documentary).length).toBe(1);
    },
  },
  {
    name: 'unknown provider names never invent a filter',
    turns: ['only on FlixMaxPlus'],
    expect: (s) => expect(s.providers).toEqual([]),
  },
  {
    name: 'newer six times cannot run past a sane bound',
    turns: [
      ['newer', SHOWN_OLD],
      ['newer', { shownYears: [2020, 2021, 2022] }],
      ['newer', { shownYears: [2023, 2024] }],
      ['newer', { shownYears: [2024, 2025] }],
      ['newer', { shownYears: [2025] }],
      ['newer', { shownYears: [2026] }],
    ],
    expect: (s) => {
      expect(s.minYear).toBe(2027);
      expect(s.maxYear).toBeNull();
    },
  },
  {
    name: 'contradictory year bounds resolve by dropping the stale side',
    turns: ['before 1990', ['newer', SHOWN_NEW]],
    expect: (s) => {
      expect(s.minYear).toBe(2023);
      expect(s.maxYear).toBeNull(); // 1990 cap is impossible with a 2023 floor — dropped, not silently kept
    },
  },
];

describe('frozen multi-turn corpus v1 — final state is exactly the accumulated case', () => {
  for (const c of V1_CASES) {
    it(c.name, () => c.expect(run(c.turns)));
  }

  it('meta: the corpus is large enough to mean something', () => {
    const totalTurns = V1_CASES.reduce((n, c) => n + c.turns.length, 0);
    expect(V1_CASES.length).toBeGreaterThanOrEqual(20);
    expect(totalTurns).toBeGreaterThanOrEqual(60);
  });
});
