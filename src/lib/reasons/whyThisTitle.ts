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
 * a model. A reason we cannot substantiate is simply not produced.
 *
 * ── WHY THIS IS NOT A METADATA STRIP ──────────────────────────────────────
 * The first version of this module emitted "3 seasons · 30 episodes" and
 * "44-minute episodes" as ordinary reasons. Shipped, that produced a card
 * whose "Why it fits" repeated, word for word, the metadata line printed two
 * rows above it. Facts about a title are not reasons a PERSON should watch it.
 *
 * So run length and episode length are no longer reasons on their own. They
 * become reasons only when they satisfy an ACTIVE REQUEST — "you asked for
 * episodes under 45 minutes" is personalization; "43-minute episodes" is a
 * spec sheet. Everything else here is evidence about the viewer: what they
 * rate highly, who is watching with them, what they have already seen, who
 * they follow, and what they just asked for.
 */

/* THE FLOOR IS DECLARED ONCE, IN THE MODULE THAT DECLARED IT.
   `MIN_SAMPLES_FOR_FIT` is this repo's statement of when a taste profile stops
   being noise, and the title page has honoured it all along. This card did not:
   it gated every "your…" claim on `ratedCount > 0`, so one rating was enough to
   print "Strong match for your slow-burn preferences" — while the ranker scales
   the very same channel by `samples / 20` and moved that title by a twentieth
   of a nudge. The claim was loudest exactly where the ranking trusted it least,
   which is the mismatch P0-E is about. One floor, both surfaces, imported
   rather than restated. */
import { MIN_SAMPLES_FOR_FIT } from '@/lib/verdict/fitReasons';

export interface WhyInput {
  /** Dimensions the user's rated history agrees with, strongest first. */
  tasteAgreements?: string[];
  /** Axes of this title that CLASH with what the reader rates highly. The
   *  honest half of the same evidence — `/api/dna` has always returned it as
   *  `fit.clash`, and the card dropped it on the floor. */
  tasteConcerns?: string[];
  /** The title's own genres — used ONLY for the honest general fallback. */
  genres?: string[];
  /**
   * How many titles the viewer has rated. Below `MIN_SAMPLES_FOR_FIT` there is
   * not enough profile to stand on, and no claim beginning "your…" can honestly
   * be made.
   */
  ratedCount?: number;
  /** Household members this fits, when the request was for a group. */
  householdNames?: string[];
  /** Titles the user rated highly that this resembles. */
  similarTo?: string[];
  /** A person the viewer follows who appears in this title. */
  followedPerson?: string | null;
  /** True when we know NOBODY in the session has seen it. Undefined = unknown. */
  unwatchedByAll?: boolean;
  /** Pack this is currently trending in, e.g. "Crime Case Files". */
  trendingInPack?: string | null;
  /** True when the title released within the last 7 days. */
  newThisWeek?: boolean;
  /** True when a verified airing starts today. */
  airingTonight?: boolean;

  // ── Active request constraints ──────────────────────────────────────────
  // Present only when the viewer actually asked for these. A satisfied
  // constraint is personalization; the same number with no request behind it
  // is metadata, and belongs in the metadata line.
  /** e.g. 45 when the request was "episodes under 45 minutes". */
  requestedMaxMinutes?: number | null;
  /** The title's episode length, checked against `requestedMaxMinutes`. */
  episodeMinutes?: number | null;
  /** True when the viewer asked for a finished, multi-season series. */
  requestedCompletedSeries?: boolean;
  seasons?: number | null;
  seriesEnded?: boolean;
  /** A free-text constraint the retrieval layer confirmed, e.g.
   *  "clever but not supernatural". Only ever passed when SATISFIED. */
  satisfiedRequest?: string | null;
}

export type ReasonKind =
  | 'taste'
  | 'concern'
  | 'household'
  | 'similar'
  | 'person'
  | 'request'
  | 'length_request'
  | 'run_request'
  | 'unwatched'
  | 'trending'
  | 'new'
  | 'airing'
  | 'general';

export interface Reason {
  kind: ReasonKind;
  text: string;
}

/**
 * Rank order. Direct evidence about this viewer outranks everything; a
 * satisfied request outranks ambient signals; the general fallback is last
 * because it is the weakest honest thing we can say.
 */
const RANK: Record<ReasonKind, number> = {
  taste: 1,
  household: 2,
  similar: 3,
  person: 4,
  request: 5,
  length_request: 6,
  run_request: 7,
  unwatched: 8,
  airing: 9,
  trending: 10,
  new: 11,
  /* A concern QUALIFIES the case for a title; it never leads it. Ranked after
     every positive reason so the reader sees why it fits before why it might
     not, and ahead of the generic fallback so a real caution is never crowded
     out by "matches your general drama preferences". */
  concern: 12,
  general: 99,
};

/** Joins a list the way a person would: "crime and forensic", "a, b and c". */
export function joinNatural(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0]!;
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]!}`;
}

/**
 * A FIT AXIS, IN WORDS A READER CAN USE.
 *
 * `matchHighlights` returns axes as `{ label, note }` — the label is the AXIS
 * NAME ("Pace", "Tone", "Content edge") and the note is what it actually says
 * ("slow burn", "you lean fast-paced"). Passing the label alone produced chips
 * that named the dial without reading it: "Heads up: Pace" tells a reader
 * nothing, and the unit tests never caught it because they were written with
 * prose that no caller ever supplies. The browser proof did.
 *
 * So the note is the sentence and the label is the subject, and each phrase
 * uses whichever of the two actually carries meaning.
 */
const trimmed = (s: string | null | undefined): string => (s ?? '').trim();

/** "slow burn" — what the title IS, since agreement notes name the axis end. */
export function agreementPhrase(a: { label: string; note?: string | null }): string {
  const note = trimmed(a.note);
  return note.length > 0 ? note.toLowerCase() : trimmed(a.label).toLowerCase();
}

/** "pace — you lean fast-paced": the axis, then the direction the reader leans. */
export function concernPhrase(c: { label: string; note?: string | null }): string {
  const label = trimmed(c.label).toLowerCase();
  const note = trimmed(c.note);
  if (note.length === 0) return label;
  if (label.length === 0) return note;
  /* A note that already contains the axis name says it once, not twice — and
     WHOLE-WORD, because "pace" is a substring of "fast-paced" and a plain
     `includes` silently swallowed the axis on the commonest dial of all. */
  const saidAlready = new RegExp(`(?:^|\\W)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\W|$)`).test(
    note.toLowerCase(),
  );
  return saidAlready ? note : `${label} — ${note}`;
}

export function buildWhyReasons(input: WhyInput): Reason[] {
  const out: Reason[] = [];
  /* Every claim of the form "your …" answers to this, and nothing else does:
     a satisfied request, a followed person or an airing tonight is a fact about
     the session or the title, not a reading of a profile. */
  const profiled = (input.ratedCount ?? 0) >= MIN_SAMPLES_FOR_FIT;

  // Cap at two dimensions: "matches your crime, forensic, procedural, dark and
  // slow-burn preferences" is not a reason, it is a dump of the profile.
  const taste = profiled ? (input.tasteAgreements ?? []).filter(Boolean).slice(0, 2) : [];
  if (taste.length > 0) {
    out.push({ kind: 'taste', text: `Strong match for your ${joinNatural(taste)} preferences` });
  }

  const names = (input.householdNames ?? []).filter(Boolean);
  if (names.length > 0) {
    out.push({ kind: 'household', text: `Strong match for ${joinNatural(names)}` });
  }

  const similar = (input.similarTo ?? []).filter(Boolean).slice(0, 2);
  if (similar.length > 0) {
    out.push({ kind: 'similar', text: `Similar to ${joinNatural(similar)}, which you rated highly` });
  }

  if (input.followedPerson) {
    out.push({ kind: 'person', text: `Features ${input.followedPerson}, who you follow` });
  }

  if (input.satisfiedRequest) {
    out.push({ kind: 'request', text: `Matches your “${input.satisfiedRequest}” request` });
  }

  // A LENGTH REASON ONLY WHEN LENGTH WAS ASKED FOR.
  if (
    input.requestedMaxMinutes &&
    input.episodeMinutes &&
    input.episodeMinutes <= input.requestedMaxMinutes
  ) {
    out.push({
      kind: 'length_request',
      text: `${Math.round(input.episodeMinutes)}-minute episodes fit the time you asked for`,
    });
  }

  if (input.requestedCompletedSeries && input.seriesEnded && input.seasons && input.seasons > 1) {
    out.push({
      kind: 'run_request',
      text: `Completed ${input.seasons}-season run, as you asked`,
    });
  }

  // Only stated when we positively know nobody has seen it. `undefined` means
  // we have no viewing record, which is not the same claim — someone may have
  // watched it elsewhere.
  if (input.unwatchedByAll === true) {
    out.push({
      kind: 'unwatched',
      text: names.length > 0 ? 'Unwatched by everyone here' : 'You haven’t watched it',
    });
  }

  if (input.airingTonight) out.push({ kind: 'airing', text: 'Airing tonight' });
  if (input.trendingInPack) out.push({ kind: 'trending', text: `Trending in ${input.trendingInPack}` });
  if (input.newThisWeek) out.push({ kind: 'new', text: 'New this week' });

  // THE HONEST FALLBACK. Only when there is no stronger evidence AND the
  // viewer has actually rated something — with an empty profile there is no
  // "your preferences" to match, and saying otherwise would invent the very
  // evidence this module refuses to invent.
  const genres = (input.genres ?? []).filter(Boolean).slice(0, 2);
  if (out.length === 0 && genres.length > 0 && profiled) {
    out.push({
      kind: 'general',
      text: `Matches your general ${joinNatural(genres.map((g) => g.toLowerCase()))} preferences`,
    });
  }

  /* THE HONEST HALF. Capped at one — a card is a summary, not an audit — and
     gated on real rated history for the same reason the taste reason is: with
     nothing on file there is no personal ground to stand a caution on, and
     inventing one is the same dishonesty as inventing praise. */
  const concerns = (input.tasteConcerns ?? []).filter(Boolean);
  if (concerns.length > 0 && profiled) {
    out.push({ kind: 'concern', text: `Heads up: ${concerns[0]}` });
  }

  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/** What the card shows without being asked. Never more than two. */
export function primaryReasons(reasons: Reason[], limit = 2): Reason[] {
  return reasons.slice(0, limit);
}

/** What "Why?" reveals — everything not already on the card. */
export function additionalReasons(reasons: Reason[], limit = 2): Reason[] {
  return reasons.slice(limit);
}
