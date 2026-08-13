import 'server-only';

/**
 * ISSUING THE GC5 STRANDS AGAINST THE REAL FINDER.
 *
 * ── THE RULE THIS ENFORCES AT RUNTIME ─────────────────────────────────────
 * Every strand runs through the SAME `runFinder` with the SAME base query, so
 * every hard constraint the user stated — subject strictness, providers,
 * runtime, years, exclusions, media type — is enforced on every strand. A
 * strand may only ADD soft seeds on top of that base. There is no code path
 * here that can remove a constraint, which is what makes "no critic inference
 * becomes a hard exclusion" a property of the implementation rather than a
 * promise in a comment.
 *
 * ── WHY NOT ONE CLEVER QUERY ──────────────────────────────────────────────
 * TMDB's `with_keywords` and `with_genres` are OR *within* a parameter but AND
 * *across* parameters, so a single query asking for the anchors' keywords AND
 * the anchors' genres is strictly narrower than either — the opposite of what
 * a recall stage is for. Separate queries, unioned, is the only shape that
 * widens.
 *
 * ── COST ──────────────────────────────────────────────────────────────────
 * N strands means N finder invocations. They are issued CONCURRENTLY, so
 * wall-clock is roughly one strand rather than N, but the TMDB call budget is
 * genuinely N×. Bounded by `MAX_STRANDS`. Tuning that budget is GC11's job and
 * is recorded there rather than silently absorbed here.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 * It does not rank. The union is returned in each strand's own finder order
 * with duplicates removed; applying the critic plan to the final ordering is
 * GC6, and doing it here would be exactly the "sneak critic ranking into
 * Finder" the brief rules out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runFinder, type FinderItem, type FinderQuery, type Watcher } from '@/lib/finder';
import type { CriticRetrievalHints } from './retrieval';
import { MAX_STRANDS } from './strandBudget';

export interface StrandRun {
  label: string;
  count: number;
}

export interface StrandsResult {
  items: FinderItem[];
  /** `${mediaType}-${id}` for every candidate that reached the boundary. */
  candidateIds: string[];
  perStrand: StrandRun[];
  scoredFor: string;
  relaxed: string | null;
}

/**
 * Run every strand and union the candidates.
 *
 * `base` must already carry the user's stated constraints; this function copies
 * it per strand and only ever adds. It never deletes a key from `base`.
 */
export async function runStrands(
  supabase: SupabaseClient,
  userId: string,
  hints: CriticRetrievalHints,
  base: FinderQuery,
  watcher: Watcher | Watcher[] | null,
  limit: number,
): Promise<StrandsResult> {
  const strands = hints.strands.slice(0, MAX_STRANDS);

  const runs = await Promise.all(
    strands.map(async (s) => {
      /* THE BASE IS THE FLOOR, NEVER THE CEILING. Spreading `base` first means
         a strand cannot drop a stated constraint even by accident — the only
         keys it can set are its own soft seeds. */
      const q: FinderQuery = { ...base };

      /* A SUBJECT OUTRANKS AN ANCHOR SEED. `runFinder` already drops soft
         `keywordIds` from discovery whenever `subjectKeywordIds` is present, so
         setting them here would be inert at best; leaving them off keeps the
         intent legible: the thing the user NAMED wins. */
      const subjectPresent = (base.subjectKeywordIds?.length ?? 0) > 0;
      if (s.keywordIds?.length && !subjectPresent) q.keywordIds = s.keywordIds;

      /* Anchor genres REPLACE rather than intersect: TMDB ANDs across
         parameters, so unioning a guessed genre into a stated one would narrow
         the pool. A strand carrying its own genres is a separate net. */
      if (s.genreIds?.length) q.genreIds = s.genreIds;

      // The strand's own quality bars, in the finder's units (% → 0..10).
      if (s.minRating != null) q.minAudience = Math.round(s.minRating * 10);
      if (s.minVotes != null) q.minVotes = s.minVotes;
      /* The strand's own sort. Acclaim asks for `vote_average.desc`; without
         this it inherited popularity and returned the popular subset of the
         acclaimed pool — the opposite of what the strand is for. */
      if (s.sortBy) q.sortBy = s.sortBy;

      const r = await runFinder(supabase, userId, q, watcher, limit).catch(() => null);
      return { label: s.label, items: r?.items ?? [], scoredFor: r?.scoredFor ?? '', relaxed: r?.relaxed ?? null };
    }),
  );

  const seen = new Set<string>();
  const items: FinderItem[] = [];
  const perStrand: StrandRun[] = [];
  for (const run of runs) {
    let added = 0;
    for (const it of run.items) {
      const key = `${it.mediaType}-${it.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
      added += 1;
    }
    perStrand.push({ label: run.label, count: added });
  }

  /* Read-back copy comes from the FIRST strand that produced any, so the user
     still sees the finder's own honest description of what ran. */
  const withCopy = runs.find((r) => r.items.length > 0) ?? runs[0];
  return {
    items,
    candidateIds: [...seen],
    perStrand,
    scoredFor: withCopy?.scoredFor ?? '',
    // A shortfall message only makes sense when the UNION is short, not a strand.
    relaxed: items.length === 0 ? (withCopy?.relaxed ?? null) : null,
  };
}
