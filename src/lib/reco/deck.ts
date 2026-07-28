/**
 * THE RULING DECK — a deck, not a page.
 *
 * "It will stop usually at 12, then a couple kind of automatically randomly
 * update, then a few may show up again."
 *
 * Three symptoms, three different causes, one wrong idea underneath: the
 * recommendations were a PAGE — a list rebuilt from scratch on every request
 * and re-sorted by a score that the user's own taps were changing.
 *
 *   • It stopped at 12 because only eighteen candidates were ever scored.
 *   • It reshuffled because every FOR/AGAINST rewrites the profile, the profile
 *     moves `personalScore`, and the list was re-sorted by it — under the thumb
 *     already reaching for a button.
 *   • Titles came back because the list was rebuilt rather than continued, so
 *     anything that had been below the cut could rise back above it.
 *
 * A deck fixes all three by holding four rules:
 *
 *   1. ORDER IS FROZEN WHEN IT IS DEALT. Ranking happens at deal time. What is
 *      already on screen never moves again, whatever the user does next.
 *   2. LEARNING LANDS AT THE SEAM. New ratings sharpen the NEXT deal, never the
 *      cards in front of you. A recommender that re-ranks instantly feels
 *      broken; one that improves at a seam feels like it is paying attention.
 *   3. "DEALT" IS MONOTONIC AND CARRIED BY THE CLIENT. Every key ever dealt goes
 *      back with the next request, so a title cannot be dealt twice — no matter
 *      what the ranking does between requests.
 *   4. SUPPLY IS TIERED AND PAGED, so it does not run dry after one pass over
 *      the user's favourites.
 *
 * This module is pure: the cursor, the tiers, the thresholds and the merge. The
 * fetching lives in the action, and the deterministic engine is untouched — it
 * still scores every candidate exactly as before. All this decides is WHICH
 * candidates get put in front of it, and in what order they reach the screen.
 */

/**
 * Where the next batch comes from. The tiers get broader and the bar gets
 * lower, which is a real trade the UI has to admit to — see `tierNote`.
 */
export type Tier = 1 | 2 | 3;

export interface DeckCursor {
  tier: Tier;
  /** 1-based page within the tier. Tier 1 has exactly one. */
  page: number;
}

export const START: DeckCursor = { tier: 1, page: 1 };

/** Titles per deal — a screenful and a bit, so a scroll never lands on the end. */
export const BATCH = 12;

/**
 * Fetch the next batch once the user is this close to the bottom. The point is
 * that the list never visibly stops: by the time the last card is on screen the
 * next twelve are already under it. The button is the fallback for when a
 * prefetch fails, not the normal way through.
 */
export const PREFETCH_WITHIN = 6;

/**
 * The same rule, in pixels, for an IntersectionObserver `rootMargin`.
 *
 * The observer watches a sentinel BELOW the grid rather than an element
 * interleaved with the cards: a wrapper around each card would have to be
 * `display: contents` to avoid disturbing the layout, and an element with no
 * box takes `.poster-grid > *` — and therefore the Safari min-width guard —
 * off every card in the grid. Roughly `PREFETCH_WITHIN` row-cards tall.
 */
export const PREFETCH_PX = 900;

/**
 * How many pages each tier has.
 *
 * Tier 1 is "similar to what you rated highest" and is genuinely finite — six
 * seeds times TMDB's twenty neighbours, minus everything already handled. Tiers
 * 2 and 3 are TMDB discover, which is thousands of titles deep, so they are
 * paged. The totals here are a real ceiling (21 deals ≈ 250 titles in one
 * sitting), not a display cap: past that the tail is well below anything worth
 * putting a gavel to, and a session that long has earned a fresh deck.
 */
const TIER_PAGES: Record<Tier, number> = { 1: 1, 2: 8, 3: 12 };

/** Consecutive empty deals before we accept that the supply is spent. */
export const EMPTY_STREAK_LIMIT = 3;

/**
 * The personal-fit floor at each depth.
 *
 * The engine's own threshold is 55 — "Possible Watch and above". Holding every
 * tier to it would run the deck dry in one pass, so the bar comes down as the
 * pool broadens. It comes down in the UI's words too (`tierNote`); a lowered
 * bar that nobody is told about is just a worse recommendation wearing the same
 * label.
 */
export function minScoreFor(tier: Tier): number {
  return tier === 1 ? 55 : tier === 2 ? 50 : 40;
}

/**
 * What to say at the seam where the supply changes character. Null while we are
 * still on the strong stuff — a note on every batch is noise.
 */
export function tierNote(tier: Tier): string | null {
  if (tier === 1) return null;
  if (tier === 2) return 'Widening to the genres your DNA leans on — still ranked for you.';
  return 'Past your strongest matches now. Ruling these still teaches the engine.';
}

/**
 * The next place to look. Called when a deal came back empty or thin — walking
 * pages within a tier, then falling through to the next tier.
 *
 * Returns null when there is nowhere left, which is the ONE condition under
 * which the UI may claim there is nothing more.
 */
export function advance(c: DeckCursor): DeckCursor | null {
  const pages = TIER_PAGES[c.tier];
  if (c.page < pages) return { tier: c.tier, page: c.page + 1 };
  if (c.tier === 1) return { tier: 2, page: 1 };
  if (c.tier === 2) return { tier: 3, page: 1 };
  return null;
}

/** Should the client go and get the next batch yet? */
export function shouldPrefetch(shown: number, dealt: number): boolean {
  if (dealt <= 0) return false;
  return dealt - shown <= PREFETCH_WITHIN;
}

/**
 * Append what has not been dealt before, in the order the recommender returned
 * it. NEVER reorders what is already on screen — rule 1, enforced in code
 * rather than trusted to the caller.
 */
export function mergeDealt<T>(shown: readonly T[], incoming: readonly T[], key: (t: T) => string): T[] {
  const seen = new Set(shown.map(key));
  const out = [...shown];
  for (const item of incoming) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** The one key format, so the client's "already dealt" set and the server's
 *  exclusion set can never disagree about what a title is called. */
export function dealtKey(t: { mediaType: string; id: number }): string {
  return `${t.mediaType}-${t.id}`;
}

/**
 * Is the deck spent?
 *
 * Two ways to be done, and both have to be true statements about real
 * inventory: we walked off the end of the last tier, or several consecutive
 * deals came back with nothing new. A single thin batch is not an ending — the
 * engine's fit threshold can empty one page and fill the next.
 */
export function isSpent(cursor: DeckCursor | null, emptyStreak: number): boolean {
  return cursor === null || emptyStreak >= EMPTY_STREAK_LIMIT;
}

/**
 * The whole state machine for one deal, in one place, so the client and the
 * tests agree about what happens.
 *
 * `dealt` is the FULL list on screen; `incoming` is what the server just sent.
 */
export interface DealResult<T> {
  items: T[];
  cursor: DeckCursor | null;
  emptyStreak: number;
  spent: boolean;
  /** Set only when this deal crossed into a broader tier. */
  note: string | null;
}

export function applyDeal<T>(
  shown: readonly T[],
  incoming: readonly T[],
  from: DeckCursor,
  emptyStreak: number,
  key: (t: T) => string,
): DealResult<T> {
  const items = mergeDealt(shown, incoming, key);
  const gained = items.length - shown.length;

  // A full batch means this page still has more to give — stay put and take the
  // next page of it next time. Anything less and we move on.
  const cursor = gained >= BATCH ? { ...from, page: from.page + 1 <= TIER_PAGES[from.tier] ? from.page + 1 : from.page } : advance(from);
  const streak = gained === 0 ? emptyStreak + 1 : 0;
  const spent = isSpent(cursor, streak);

  return {
    items,
    cursor,
    emptyStreak: streak,
    spent,
    note: cursor && cursor.tier !== from.tier ? tierNote(cursor.tier) : null,
  };
}
