import 'server-only';

/**
 * THE PAYOFF, MEASURED AGAINST THE REAL RECOMMENDATION POOL.
 *
 * `payoff.ts` is the pure half — give it candidates and two DNA states and it
 * reports what moved. This is the half that decides WHICH CANDIDATES, and that
 * choice is the whole difference between a payoff and a party trick.
 *
 * ── WHY NOT THE DIAGNOSTIC POOL ───────────────────────────────────────────
 * The results screen ranked the 113 hand-authored diagnostic titles with
 * Showdown's own private scoring rule. Those are real films, so it did not
 * fabricate anything — but it is a closed loop: the only titles it can ever
 * return are the ones the player was just quizzed on, ordered by a model no
 * other surface in the product uses. "Here is what you should watch" earned
 * from that is a sentence about the instrument, not about the catalogue.
 *
 * So the candidates here are drawn from the SAME TMDB discover pool that
 * `/app/browse?sort=foryou` ranks — the actual recommendation surface — and the
 * diagnostic titles are removed from it by tmdb identity, so nothing the player
 * just answered about can appear as its own reward.
 *
 * ── WHY THE OBJECTIVE IS HELD CONSTANT ────────────────────────────────────
 * `computePayoff` orders by `objective + nudge`. Showdown cannot move
 * `objective` — it is the deterministic Watchability side, which knows nothing
 * about this session — so the same baseline is used for both orderings and
 * every place a title moves is attributable to `preferenceNudge` and to nothing
 * else. Re-deriving a fresh objective per side would let TMDB popularity drift
 * show up as "your session did this", which is the kind of number that is true
 * and dishonest at the same time.
 *
 * The baseline is the pool's own incoming order, which is what the player would
 * have been shown a moment ago. It is deliberately NOT called a Watchability
 * score anywhere: computing that needs per-title provider and rating data and
 * this endpoint is not going to make 60 of those calls.
 *
 * ── WHY THE COUNTERFACTUAL IS ONE QUERY ───────────────────────────────────
 * `before` is not "the DNA we read a moment ago" — between reading and writing,
 * another device could have recorded something and the difference would be
 * credited to this session. Instead the event log is read ONCE, after the
 * write, and folded twice: with the session's events and without them. Same
 * clock, same rows, one difference.
 */

import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { discoverTitles } from '@/lib/tmdb/client';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { fingerprintKey } from '@/lib/taste/fingerprint';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { mediaTypeFor } from './mediaType';
import { computePayoff, type Payoff, type PayoffCandidate } from './payoff';

/** How much of the discover pool to consider. Two pages is plenty to reorder. */
const POOL_PAGES = [1, 2] as const;

/** How many titles the screen will show. `climbed` is scoped to this. */
export const PAYOFF_TOP = 5;

/**
 * The pool's incoming order, expressed as a score.
 *
 * Descending integers rather than a rating: the gap between adjacent positions
 * has to be small enough that a bounded ±10 nudge can actually cross it, or the
 * payoff could only ever report zero and would be measuring the spacing rather
 * than the session.
 */
function baselineScore(index: number, total: number): number {
  return 50 + (30 * (total - index)) / Math.max(1, total);
}

/** Every tmdb identity the diagnostic pool occupies — excluded from candidates. */
function diagnosticIdentities(): Set<string> {
  return new Set(TITLES.map((t) => `${mediaTypeFor(t.id)}-${t.tmdbId}`));
}

export interface PayoffInput {
  /** Every event now on the user's log, read once AFTER the write. */
  events: readonly PreferenceEvent[];
  /** The ids this session just wrote. Removed to build the counterfactual. */
  writtenIds: readonly string[];
  now: number;
  region?: string;
}

/**
 * Build the real candidate pool and measure what this session did to it.
 *
 * Returns null when the pool cannot be built (no TMDB key, upstream down, or
 * nothing fingerprinted). Null is a real answer and the screen has a state for
 * it — inventing a movement figure because the network was unavailable is the
 * failure this whole module exists to replace.
 */
export async function measurePayoff(input: PayoffInput): Promise<Payoff | null> {
  const written = new Set(input.writtenIds);
  const before = deriveDna(
    input.events.filter((e) => !written.has(e.id)),
    input.now,
  );
  const after = deriveDna([...input.events], input.now);

  const region = input.region ?? 'US';
  const raw = (
    await Promise.all(
      POOL_PAGES.map((page) =>
        discoverTitles('movie', { region, sortBy: 'popularity.desc', minVotes: 80, page }).catch(
          () => [],
        ),
      ),
    )
  ).flat();
  if (raw.length === 0) return null;

  const excluded = diagnosticIdentities();
  const seen = new Set<string>();
  const pool = raw.filter((t) => {
    const k = `movie-${t.id}`;
    if (seen.has(k) || excluded.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (pool.length === 0) return null;

  const dims = await getCachedDimensions(pool.map((t) => ({ tmdb_id: t.id, media_type: 'movie' as const })));

  /* A CANDIDATE WITH NO FINGERPRINT CANNOT MOVE, and a pool made entirely of
     those would report "nothing happened" for a reason that has nothing to do
     with the player. Better to say we could not measure it. */
  const candidates: PayoffCandidate[] = pool.map((t, i) => ({
    id: `movie-${t.id}`,
    title: t.title,
    year: t.year,
    objective: baselineScore(i, pool.length),
    ...(dims.get(fingerprintKey({ mediaType: 'movie', tmdbId: t.id }))
      ? { dims: dims.get(fingerprintKey({ mediaType: 'movie', tmdbId: t.id })) }
      : {}),
  }));
  if (!candidates.some((c) => c.dims)) return null;

  return computePayoff(candidates, before, after, PAYOFF_TOP);
}
