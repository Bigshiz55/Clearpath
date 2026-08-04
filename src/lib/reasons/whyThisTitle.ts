/**
 * WHY THIS TITLE IS HERE — the other half of the card's split.
 *
 * The card answers two different questions and used to blur them. This module
 * owns the first: why we surfaced this title at all. It never touches the
 * second (where you can watch it), which belongs to
 * `src/lib/availability/watchPresentation.ts`.
 *
 * Pure, client-safe, no I/O. Every reason must be derivable from a signal the
 * caller already holds — nothing here infers, guesses or generates prose from
 * a model. A reason we cannot substantiate is simply not produced, which is
 * why the output is frequently short and occasionally empty.
 *
 * The card shows the strongest one or two; the rest are revealed behind
 * "Why?". That split is deliberate — the request was explicit that this must
 * not clutter the card, and a stack of six reasons is how a recommendation
 * starts looking like an argument.
 */

export interface WhyInput {
  /** Dimensions the user's rated history agrees with, strongest first. */
  tasteAgreements?: string[];
  /** Household members this fits, when the request was for a group. */
  householdNames?: string[];
  /** Typical episode length in minutes. */
  episodeMinutes?: number | null;
  /** Total seasons / episodes, for a series. */
  seasons?: number | null;
  episodes?: number | null;
  /** Titles the user rated highly that this resembles. */
  similarTo?: string[];
  /** True when we know the user has NOT seen it. Undefined = we don't know. */
  unwatched?: boolean;
  /** Pack this is currently trending in, e.g. "Crime Case Files". */
  trendingInPack?: string | null;
  /** True when the title released within the last 7 days. */
  newThisWeek?: boolean;
  /** True when a verified airing starts today. */
  airingTonight?: boolean;
}

export type ReasonKind =
  | 'taste'
  | 'household'
  | 'similar'
  | 'length'
  | 'run'
  | 'unwatched'
  | 'trending'
  | 'new'
  | 'airing';

export interface Reason {
  kind: ReasonKind;
  text: string;
}

/**
 * Rank order. Personal reasons beat situational ones, because "this matches
 * your taste" is the claim the product is actually making; "airing tonight" is
 * timing, and "42-minute episodes" is a fact about the title that is only
 * interesting once you already care.
 */
const RANK: Record<ReasonKind, number> = {
  taste: 1,
  household: 2,
  similar: 3,
  airing: 4,
  trending: 5,
  new: 6,
  unwatched: 7,
  length: 8,
  run: 9,
};

/** Joins a list the way a person would: "crime and forensic", "a, b and c". */
export function joinNatural(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0]!;
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]!}`;
}

export function buildWhyReasons(input: WhyInput): Reason[] {
  const out: Reason[] = [];

  // Cap at two dimensions: "matches your crime, forensic, procedural, dark and
  // slow-burn preferences" is not a reason, it is a dump of the profile.
  const taste = (input.tasteAgreements ?? []).filter(Boolean).slice(0, 2);
  if (taste.length > 0) {
    out.push({ kind: 'taste', text: `Matches your ${joinNatural(taste)} preferences` });
  }

  const names = (input.householdNames ?? []).filter(Boolean);
  if (names.length > 0) {
    out.push({ kind: 'household', text: `Strong fit for ${joinNatural(names)}` });
  }

  const similar = (input.similarTo ?? []).filter(Boolean).slice(0, 2);
  if (similar.length > 0) {
    out.push({ kind: 'similar', text: `Similar to ${joinNatural(similar)}, which you rated highly` });
  }

  if (input.airingTonight) out.push({ kind: 'airing', text: 'Airing tonight' });

  if (input.trendingInPack) {
    out.push({ kind: 'trending', text: `Trending in ${input.trendingInPack}` });
  }

  if (input.newThisWeek) out.push({ kind: 'new', text: 'New this week' });

  // Only stated when we positively know it is unwatched. `undefined` means we
  // have no viewing record for it, which is not the same as "you haven't seen
  // it" — a user who watched it elsewhere would be told something false.
  if (input.unwatched === true) out.push({ kind: 'unwatched', text: 'Unwatched' });

  if (input.episodeMinutes && input.episodeMinutes > 0) {
    out.push({ kind: 'length', text: `${Math.round(input.episodeMinutes)}-minute episodes` });
  }

  if (input.seasons && input.seasons > 0) {
    const eps = input.episodes && input.episodes > 0 ? ` · ${input.episodes} episodes` : '';
    out.push({ kind: 'run', text: `${input.seasons} season${input.seasons === 1 ? '' : 's'}${eps}` });
  }

  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/** What the card shows without being asked. */
export function primaryReasons(reasons: Reason[], limit = 2): Reason[] {
  return reasons.slice(0, limit);
}

/** What "Why?" reveals — everything not already on the card. */
export function additionalReasons(reasons: Reason[], limit = 2): Reason[] {
  return reasons.slice(limit);
}
