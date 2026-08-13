import { describe, it, expect } from 'vitest';
import { rankWithPreference, MIN_RANK_CONF } from '@/lib/preference/rank';
import { deriveDna } from '@/lib/preference/engine';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { PreferenceEvent } from '@/lib/preference/types';
import { buildPlan } from './plan';
import { objectiveAuthority, type ResolvedAnchor } from './objective';
import {
  planToHints,
  isQueryableAxis,
  TMDB_QUERYABLE,
  type CriticRetrievalHints,
  type HintInput,
} from './retrieval';

/**
 * GC5 — OBJECTIVE-AWARE CANDIDATE RETRIEVAL. Written to FAIL FIRST.
 *
 * The gate is not "does retrieval look smarter". It is the one thing that
 * cannot be faked: A TITLE THE PLAN PREFERS MUST BE ABLE TO REACH THE POOL.
 * Ranking is already proven causal (GC8/GC4), and a causal ranker is worthless
 * on a pool the right answer was filtered out of — which is precisely today's
 * behaviour, because the anchors' TMDB keyword union IS the discovery gate.
 *
 * ── WHAT IS HELD CONSTANT BETWEEN RED AND GREEN ───────────────────────────
 *   this file                     never edited to make GREEN happen
 *   the catalogue                 same titles, same tags, same dims
 *   the user's Taste DNA          same events, same derived state
 *   the plan                      real `buildPlan`, not hand-authored
 *   the ranker                    real `rankWithPreference` + real `planNudge`
 *   MIN_RANK_CONF                 imported, never redefined or lowered
 *
 * The only thing allowed to change is `planToHints`.
 */

// ───────────────────────────────────────────────────────────────────────────
// A CATALOGUE THAT ANSWERS QUERIES THE WAY TMDB ACTUALLY DOES
//
// Modelled directly on `discoverTitlesChecked` in `src/lib/tmdb/client.ts`:
// `with_keywords` and `with_genres` are OR (`join('|')`), `without_*` are
// AND-NOT, `vote_average.gte` / `vote_count.gte` are floors. Nothing here can
// filter on a fingerprint axis, because TMDB cannot.
// ───────────────────────────────────────────────────────────────────────────

interface CatalogueTitle {
  id: string;
  year: number;
  mediaType: 'movie' | 'tv';
  keywords: number[];
  genres: number[];
  rating: number;
  votes: number;
  /** Not searchable. Only ranking ever sees these. */
  dims: Record<string, number>;
  /** Deterministic Watchability — identical for A and B so retrieval is the
   *  only thing that can decide the answer. */
  objective: number;
}

const KW_HEIST = 9001;
const KW_STREET_RACE = 9002;
const KW_SMALL_TOWN = 9003;
const GENRE_THRILLER = 53;

/**
 * THE SCENARIO, in the shape of the real complaint that started this
 * workstream. The user names two titles they were not satisfied by and asks for
 * better. Both anchors are tagged {heist, street-race}.
 *
 *   B  "anchor-alike"   carries an anchor keyword, so today's `with_keywords`
 *                       gate retrieves it. Its shape REPRODUCES the anchors on
 *                       the axes this user's mature DNA rejects.
 *   A  "the-answer"     carries NO anchor keyword. Shares the anchors' genre
 *                       and clears a quality floor. Its shape is what the plan
 *                       actually asks for. Today it cannot be retrieved at all.
 *
 * A and B have the SAME deterministic objective, so if A ever outranks B it is
 * because the critic plan moved it — and it can only be moved if it was
 * retrieved.
 */
const CATALOGUE: CatalogueTitle[] = [
  {
    id: 'anchor-alike',
    year: 2021,
    mediaType: 'movie',
    keywords: [KW_STREET_RACE],
    genres: [GENRE_THRILLER],
    rating: 6.4,
    votes: 900,
    dims: { darkness: 20, warmth: 85, humor: 80, complexity: 20, suspense: 25 },
    objective: 70,
  },
  {
    id: 'the-answer',
    year: 2022,
    mediaType: 'movie',
    keywords: [KW_SMALL_TOWN],
    genres: [GENRE_THRILLER],
    rating: 7.8,
    votes: 4200,
    dims: { darkness: 88, warmth: 15, humor: 12, complexity: 85, suspense: 90 },
    objective: 70,
  },
  // Filler so a widened pool is never trivially the whole catalogue.
  {
    id: 'unrelated-romcom',
    year: 2019,
    mediaType: 'movie',
    keywords: [],
    genres: [10749],
    rating: 6.1,
    votes: 300,
    dims: { darkness: 10, warmth: 92, humor: 88, complexity: 15, suspense: 10 },
    objective: 55,
  },
  {
    id: 'unrelated-doc',
    year: 2020,
    mediaType: 'movie',
    keywords: [],
    genres: [99],
    rating: 7.2,
    votes: 800,
    dims: { darkness: 45, warmth: 40, humor: 20, complexity: 60, suspense: 30 },
    objective: 52,
  },
];

/** A strand + the hard constraints, evaluated exactly as TMDB discover would. */
function discover(hints: CriticRetrievalHints): CatalogueTitle[] {
  const out = new Map<string, CatalogueTitle>();
  for (const s of hints.strands) {
    for (const t of CATALOGUE) {
      // ── HARD constraints, applied to every strand ──────────────────────
      const h = hints.hard;
      if (h.mediaType && h.mediaType !== 'any' && t.mediaType !== h.mediaType) continue;
      if (h.minYear != null && t.year < h.minYear) continue;
      if (h.maxYear != null && t.year > h.maxYear) continue;
      if (h.excludeGenreIds?.some((g) => t.genres.includes(g))) continue;
      if (h.excludeKeywordIds?.some((k) => t.keywords.includes(k))) continue;
      if (h.subjectKeywordIds?.length && !h.subjectKeywordIds.some((k) => t.keywords.includes(k))) continue;

      // ── the strand's own SOFT seeds ────────────────────────────────────
      if (s.keywordIds?.length && !s.keywordIds.some((k) => t.keywords.includes(k))) continue;
      if (s.genreIds?.length && !s.genreIds.some((g) => t.genres.includes(g))) continue;
      if (s.minRating != null && t.rating < s.minRating) continue;
      if (s.minVotes != null && t.votes < s.minVotes) continue;

      out.set(t.id, t);
    }
  }
  return [...out.values()];
}

// ───────────────────────────────────────────────────────────────────────────
// THE USER. Mature, decisive DNA: likes dark / complex / tense, dislikes warm
// and jokey. Derived by the real engine — never hand-authored.
// ───────────────────────────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 5, 1);
const events: PreferenceEvent[] = Array.from({ length: 16 }, (_, i) => ({
  id: `e${i}`,
  at: NOW - (i + 1) * 86_400_000,
  titleId: `movie:${2000 + i}`,
  action: 'seen_liked' as const,
  dims: { darkness: 84, warmth: 18, humor: 15, complexity: 82, suspense: 86 },
  genres: ['thriller'],
}));
const DNA = deriveDna(events, NOW);

const anchor = (id: string, dims: Record<string, number>): ResolvedAnchor => ({
  titleId: `movie:${id}`,
  tmdbId: Number(id),
  mediaType: 'movie',
  spokenAs: `Title ${id}`,
  dims: dims as ResolvedAnchor['dims'],
  confidence: 1,
});

/** Both anchors are warm, jokey and shallow — the shape this user rejects. */
const ANCHORS: ResolvedAnchor[] = [
  anchor('101', { darkness: 22, warmth: 82, humor: 78, complexity: 22, suspense: 28 }),
  anchor('102', { darkness: 25, warmth: 80, humor: 75, complexity: 25, suspense: 30 }),
];

const AUTHORITY = objectiveAuthority(ANCHORS);

const baseInput = (relation: HintInput['relation']): HintInput => ({
  relation,
  anchors: ANCHORS,
  plan: buildPlan({ relation, anchors: ANCHORS, dna: DNA, modifiers: {}, authority: AUTHORITY }),
  hard: { mediaType: 'movie' },
  anchorKeywordIds: [KW_HEIST, KW_STREET_RACE],
  anchorGenreIds: [GENRE_THRILLER],
});

/** The real production ranker, given exactly what retrieval produced. */
function rank(pool: CatalogueTitle[], relation: HintInput['relation']) {
  const plan = buildPlan({ relation, anchors: ANCHORS, dna: DNA, modifiers: {}, authority: AUTHORITY });
  return rankWithPreference(
    pool.map((t) => ({ id: t.id, objective: t.objective, dims: t.dims, genres: [] })),
    DNA,
    { criticPlan: plan },
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1–3 · THE GATE ITSELF
// ───────────────────────────────────────────────────────────────────────────

describe('GC5 · the plan-preferred title can reach the pool', () => {
  it('1 · retrieves the correct answer that carries no anchor keyword', () => {
    const pool = discover(planToHints(baseInput('better_than')));
    expect(pool.map((t) => t.id)).toContain('the-answer');
  });

  it('2 · GC4 ranking then places it above the anchor-alike', () => {
    const pool = discover(planToHints(baseInput('better_than')));
    const order = rank(pool, 'better_than').map((r) => r.id);
    expect(order.indexOf('the-answer')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('the-answer')).toBeLessThan(order.indexOf('anchor-alike'));
  });

  it('3 · the anchor-alike is still retrieved — recall widened, not swapped', () => {
    /* A "fix" that merely inverted the filter would pass test 1 while losing
       the keyword-matched title. Retrieval may only ADD. */
    const pool = discover(planToHints(baseInput('better_than'))).map((t) => t.id);
    expect(pool).toContain('anchor-alike');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4–7 · HARD vs SOFT — an inference may never become a requirement
// ───────────────────────────────────────────────────────────────────────────

describe('GC5 · hard vs soft classification', () => {
  it('4 · no critic inference reaches the hard constraint set', () => {
    const hints = planToHints(baseInput('better_than'));
    /* The hard set must be EXACTLY what was passed in — the sentence's own
       facts. Anchor keywords and anchor genres are inferences and must be
       absent from it entirely. */
    expect(hints.hard).toEqual({ mediaType: 'movie' });
    expect(JSON.stringify(hints.hard)).not.toContain(String(KW_STREET_RACE));
    expect(JSON.stringify(hints.hard)).not.toContain(String(GENRE_THRILLER));
  });

  it('5 · stated facts survive into every strand', () => {
    const input = { ...baseInput('better_than'), hard: { mediaType: 'movie' as const, minYear: 2022 } };
    const pool = discover(planToHints(input));
    expect(pool.every((t) => t.year >= 2022)).toBe(true);
    expect(pool.map((t) => t.id)).toContain('the-answer');
  });

  it('6 · at least one strand does not depend on the anchor keywords', () => {
    /* THE STRUCTURAL GUARANTEE. As long as a strand exists that no anchor
       inference gates, a wrong or unlucky keyword union cannot remove a title
       from consideration — it can only fail to add one. */
    const hints = planToHints(baseInput('better_than'));
    expect(hints.strands.some((s) => !s.keywordIds?.length)).toBe(true);
  });

  it('7 · a hard exclusion the user stated still removes titles', () => {
    /* Widening recall must not become "ignore the user". */
    const input = {
      ...baseInput('better_than'),
      hard: { mediaType: 'movie' as const, excludeGenreIds: [GENRE_THRILLER] },
    };
    const pool = discover(planToHints(input)).map((t) => t.id);
    expect(pool).not.toContain('the-answer');
    expect(pool).not.toContain('anchor-alike');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8–10 · NO FAKE FILTERS — the honesty boundary
// ───────────────────────────────────────────────────────────────────────────

describe('GC5 · a trait with no search representation stays a ranking instruction', () => {
  it('8 · no fingerprint axis is queryable', () => {
    for (const axis of DIMENSION_KEYS) expect(isQueryableAxis(axis)).toBe(false);
    for (const axis of DIMENSION_KEYS) {
      expect(TMDB_QUERYABLE.some((p) => p.includes(axis))).toBe(false);
    }
  });

  it('9 · every dimension instruction is recorded as ranking-only', () => {
    const input = baseInput('better_than');
    const hints = planToHints(input);
    const planAxes = (input.plan?.instructions ?? []).map((i) => i.axis);
    expect(planAxes.length).toBeGreaterThan(0);
    expect(hints.rankingOnly.map((i) => i.axis).sort()).toEqual([...planAxes].sort());
  });

  it('10 · no strand carries a dimension axis as a filter', () => {
    const hints = planToHints(baseInput('better_than'));
    const serialized = JSON.stringify(hints.strands);
    for (const axis of DIMENSION_KEYS) expect(serialized).not.toContain(`"${axis}"`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 11–13 · RELATION AFFECTS RETRIEVAL WHERE LEGITIMATE
// ───────────────────────────────────────────────────────────────────────────

describe('GC5 · relation reaches retrieval', () => {
  it('11 · better_than adds a quality floor that like does not', () => {
    /* The ONE honest search expression of "better": TMDB really can filter on
       `vote_average.gte`. It is not a proxy for a fingerprint axis. */
    const better = planToHints(baseInput('better_than'));
    const like = planToHints(baseInput('like'));
    expect(better.strands.some((s) => s.minRating != null)).toBe(true);
    expect(like.strands.some((s) => s.minRating != null)).toBe(false);
  });

  it('12 · blend represents each anchor separately rather than as one union', () => {
    /* Not a cosmetic difference: an OR-union under a popularity sort lets the
       more popular anchor fill the cap and silently drop the other. */
    const blend = planToHints({
      ...baseInput('blend'),
      anchorKeywordIds: [KW_HEIST, KW_STREET_RACE],
    });
    const perAnchor = blend.strands.filter((s) => s.keywordIds?.length === 1);
    expect(perAnchor.length).toBeGreaterThanOrEqual(2);
  });

  it('13 · like and like_but both keep the anchors’ own tags as a seed', () => {
    for (const rel of ['like', 'like_but'] as const) {
      const hints = planToHints(baseInput(rel));
      expect(hints.strands.some((s) => s.keywordIds?.length)).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 14–15 · STARVATION — the question the brief asked to be measured
// ───────────────────────────────────────────────────────────────────────────

describe('GC5 · using the plan as a hint cannot starve the pool', () => {
  it('14 · a rich plan retrieves at least as much as an empty one', () => {
    const withPlan = discover(planToHints(baseInput('better_than'))).length;
    const noPlan = discover(planToHints({ ...baseInput('better_than'), plan: undefined })).length;
    expect(withPlan).toBeGreaterThanOrEqual(noPlan);
  });

  it('15 · MIN_RANK_CONF is untouched', () => {
    expect(MIN_RANK_CONF).toBe(0.25);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 16–17 · RETRIEVED POOL vs FINAL RANKING stay separable
// ───────────────────────────────────────────────────────────────────────────

describe('GC5 · retrieval and judgment are not collapsed', () => {
  it('16 · retrieval does not rank — it returns a pool the ranker then orders', () => {
    const pool = discover(planToHints(baseInput('better_than')));
    const order = rank(pool, 'better_than').map((r) => r.id);
    /* Everything retrieved is still present after ranking: retrieval decided
       membership, ranking decided order, neither did the other's job. */
    expect([...order].sort()).toEqual([...pool.map((t) => t.id)].sort());
  });

  it('17 · relation changes the POOL, and ranking orders whatever pool it is handed', () => {
    /* THE SEPARATION, stated as two independent facts.
       Deliberately NOT "relation changes the final order": GC4 decided that
       when a user's mature taste is confident the plan follows the USER, so
       `like` and `better_than` yield the same plan and the same order. That is
       GC4's semantics and this gate does not get to contradict it. What GC5
       owns is the stage BEFORE that — and there the relation genuinely differs,
       because "better" has an honest search expression and "like" does not. */
    const betterPool = discover(planToHints(baseInput('better_than'))).map((t) => t.id).sort();
    const likePool = discover(planToHints(baseInput('like'))).map((t) => t.id).sort();
    expect(betterPool).not.toEqual(likePool);

    // …and ranking is a pure function of the pool it receives, not of retrieval.
    const pool = discover(planToHints(baseInput('better_than')));
    const twice = rank(pool, 'better_than').map((r) => r.id);
    expect(rank(pool, 'better_than').map((r) => r.id)).toEqual(twice);
  });
});
