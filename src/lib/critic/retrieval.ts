/**
 * OBJECTIVE-AWARE CANDIDATE RETRIEVAL — GC5.
 *
 * ── THE FAILURE THIS CLOSES ───────────────────────────────────────────────
 * GC4 gave the critic a plan. A plan cannot rank a title that was never
 * retrieved. Today the ONLY thing an anchor contributes to retrieval is the
 * union of its TMDB keywords (`ask/route.ts` -> `referenceKeywordIds` ->
 * `FinderQuery.keywordIds` -> `with_keywords`, which TMDB evaluates as OR).
 * That union is simultaneously too weak and too strong:
 *
 *   TOO STRONG  it is the discovery gate. A title carrying none of the anchors'
 *               keywords cannot enter the pool at all, no matter how well it
 *               satisfies the plan. The right answer is filtered out before any
 *               judgment happens, and the ranker's order is then a choice among
 *               survivors of an arbitrary tag filter.
 *   TOO WEAK    it is the anchors' ONLY representation. Identity, relation and
 *               plan all collapse into a bag of keyword ids, so `better than X`
 *               and `like X` issue a byte-identical search.
 *
 * ── THE ONE IDEA ──────────────────────────────────────────────────────────
 * RETRIEVAL MAXIMISES RECALL. RANKING SUPPLIES JUDGMENT. They are different
 * jobs and this module refuses to collapse them. A critic inference widens the
 * pool by adding a STRAND — an additional legitimate query whose results are
 * unioned in — and may never narrow it. The narrowing constraints are exactly
 * the ones the user actually stated.
 *
 * ── HARD vs SOFT, AND THE THIRD CLASS ─────────────────────────────────────
 *   HARD          a fact of the sentence: media type, year bounds, providers,
 *                 explicit exclusions. Applied to EVERY strand. The user said
 *                 it, so a candidate violating it is not an answer.
 *   SOFT          a critic INFERENCE: the anchors' keywords, the anchors'
 *                 genres. Seeds a strand, never gates one. There is always a
 *                 strand that does not use it, which is what makes the
 *                 inference structurally incapable of losing the right answer.
 *   RANKING-ONLY  a trait with NO legitimate retrieval representation. Every
 *                 fingerprint axis is in this class, because TMDB cannot query
 *                 any of them (see `TMDB_QUERYABLE`). These are carried through
 *                 to the plan and applied by `planNudge`, and are recorded here
 *                 explicitly so "we could not search for this" is visible
 *                 evidence rather than a silent omission.
 *
 * A critic inference must never become `WHERE candidate MUST have X`. The type
 * system enforces it: nothing on the SOFT path can reach `hard`.
 *
 * PURE. No I/O and no model call — the strands are descriptions of queries, and
 * the caller issues them. No request-path AI expansion is introduced.
 */

import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { CriticRelation, ResolvedAnchor } from './objective';
import type { CriticPlan, TraitInstruction } from './plan';

/**
 * EXACTLY what `discoverTitlesChecked` can put on the wire, verified against
 * `src/lib/tmdb/client.ts` on this branch rather than assumed from the GC1
 * audit. This list is the honesty boundary of the whole gate.
 *
 * Note what is absent: every one of `DIMENSION_KEYS`. There is no
 * `with_darkness`, no `with_pacing`, no `warmth.gte`. A plan instruction on a
 * fingerprint axis has NO search representation, and inventing a proxy for one
 * ("high violence, so require the Action genre") would be a fabricated filter
 * wearing the authority of a real one.
 */
export const TMDB_QUERYABLE = [
  'with_genres',
  'without_genres',
  'with_keywords',
  'without_keywords',
  'with_original_language',
  'with_origin_country',
  'with_watch_providers',
  'with_watch_monetization_types',
  'vote_count.gte',
  'vote_average.gte',
  'with_runtime.lte',
  'with_cast',
  'primary_release_date.gte',
  'primary_release_date.lte',
  'first_air_date.gte',
  'first_air_date.lte',
  'sort_by',
] as const;

/** True when an axis can be expressed as a search filter at all. */
export const isQueryableAxis = (axis: string): boolean =>
  !(DIMENSION_KEYS as readonly string[]).includes(axis);

/** Facts of the sentence. Every strand carries these; none may be relaxed here. */
export interface HardConstraints {
  mediaType?: 'any' | 'movie' | 'tv';
  minYear?: number | null;
  maxYear?: number | null;
  providerIds?: number[];
  excludeGenreIds?: number[];
  excludeKeywordIds?: number[];
  /** A named subject ("a boxing movie") — already HARD in production. */
  subjectKeywordIds?: number[];
}

/** One legitimate query. Results across strands are UNIONED, never intersected. */
export interface RetrievalStrand {
  /** Why this strand exists — the attribution trail for a retrieved candidate. */
  label: string;
  /** Anchor keywords (OR). Absent on the strands that must not depend on them. */
  keywordIds?: number[];
  /** Anchor genres (OR). */
  genreIds?: number[];
  /** Minimum crowd score — the only honest search expression of "better". */
  minRating?: number;
  /** Minimum vote count. */
  minVotes?: number;
  sortBy?: string;
}

export interface CriticRetrievalHints {
  strands: RetrievalStrand[];
  hard: HardConstraints;
  /** Plan instructions with no search representation. Ranking applies these. */
  rankingOnly: TraitInstruction[];
  relation: CriticRelation;
}

export interface HintInput {
  relation: CriticRelation;
  anchors: readonly ResolvedAnchor[];
  plan: CriticPlan | undefined;
  hard: HardConstraints;
  /** TMDB keyword ids for the named anchors — what production already fetches. */
  anchorKeywordIds: number[];
  /** TMDB genre ids for the named anchors. */
  anchorGenreIds: number[];
}

/**
 * THE FEWER CONSTRAINTS A STRAND HAS, THE HIGHER ITS QUALITY BAR MUST BE.
 *
 * `recall-floor` is deliberately ungated — no genre, no keyword, nothing the
 * critic inferred. That is the whole point of it, and it is also why it cannot
 * reuse the finder's general `minVotes: 80`: that floor is safe there because a
 * genre or keyword is already narrowing the pool. An unconstrained
 * popularity sweep at 80 votes returns noise. This bar is what makes the sweep
 * mean "the well-known titles that satisfy what the user actually said".
 */
const RECALL_MIN_VOTES = 1000;

/**
 * ACCLAIM, WHICH IS NOT POPULARITY. The quality strand exists to reach exactly
 * what a popularity sweep hides: a well-reviewed title with a modest audience.
 * So it TRADES the vote bar for a rating bar rather than stacking both — a
 * strand that demanded high votes AND high rating would return a subset of the
 * sweep and add nothing.
 *
 * Provisional values. They are set so the two strands are non-redundant, and
 * they should be tuned against real TMDB pools when GC6 issues these queries
 * for real; nothing downstream depends on the specific numbers.
 */
const ACCLAIM_MIN_RATING = 7.0;
const ACCLAIM_MIN_VOTES = 200;

/**
 * Turn an understood request into a set of legitimate searches.
 *
 * The contract, in one line: `hard` is the only thing that can REMOVE a title,
 * and nothing the critic inferred is ever in `hard`.
 */
export function planToHints(input: HintInput): CriticRetrievalHints {
  const { relation, plan, hard, anchorKeywordIds, anchorGenreIds } = input;

  const strands: RetrievalStrand[] = [];

  /* 1 · THE RECALL FLOOR. Hard constraints and nothing else.
     ALWAYS PRESENT, AND THAT IS THE LOAD-BEARING PROPERTY OF THIS MODULE.
     Because a strand exists that no anchor inference gates, a wrong keyword
     union can only fail to ADD a title — it can never remove one. That is what
     turns "the critic guessed badly" from a lost answer into a smaller boost. */
  strands.push({
    label: 'recall-floor',
    minVotes: RECALL_MIN_VOTES,
    sortBy: 'popularity.desc',
  });

  /* 2 · THE ANCHORS' OWN TAGS. Production's only strand today; now one of
     several. Still valuable — a title sharing a named film's keywords is a
     genuinely good candidate — it simply no longer decides who is allowed to
     compete. */
  if (anchorKeywordIds.length > 0) {
    if (relation === 'blend') {
      /* "X meets Y": each seed gets its own strand and its own page budget.
         A single OR union under a popularity sort lets the better-tagged side
         fill the cap and silently drop the other, which is the one thing a
         blend must not do.

         PER SEED, NOT PER ANCHOR — honestly named, because `ResolvedAnchor`
         carries no keywords and the ids arrive here already flattened. Grouping
         by anchor is strictly better and needs that shape to exist first. */
      for (const kw of anchorKeywordIds) {
        strands.push({ label: `anchor-seed-${kw}`, keywordIds: [kw] });
      }
    } else {
      strands.push({ label: 'anchor-keywords', keywordIds: anchorKeywordIds });
    }
  }

  /* 3 · THE ANCHORS' NEIGHBOURHOOD. Genres are a coarser, wider net than tags,
     which is exactly why they belong in retrieval and not in judgment. */
  if (anchorGenreIds.length > 0) {
    strands.push({ label: 'anchor-genres', genreIds: anchorGenreIds });
  }

  /* 4 · RELATION. `better_than` is a claim about QUALITY, and quality is the
     one critic-side idea TMDB can genuinely express (`vote_average.gte`). This
     is not a proxy standing in for a fingerprint axis — it is the real thing
     the word means. `like` gets no such strand: resemblance is not a quality
     claim, and adding an acclaim floor there would quietly refuse to return the
     mediocre-but-similar title the user actually asked for. */
  if (relation === 'better_than') {
    strands.push({
      label: 'acclaim',
      minRating: ACCLAIM_MIN_RATING,
      minVotes: ACCLAIM_MIN_VOTES,
      sortBy: 'vote_average.desc',
    });
  }

  /* EVERYTHING THE SEARCH CANNOT SAY. Recorded rather than dropped, so the
     absence is auditable: these are the traits the critic reasoned about and
     retrieval was structurally unable to represent. They are applied by
     `planNudge` at ranking time, which is the correct place for them. */
  const rankingOnly = (plan?.instructions ?? []).filter((i) => !isQueryableAxis(i.axis));

  return { strands, hard, rankingOnly, relation };
}
