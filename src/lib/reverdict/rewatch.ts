/**
 * THE RE-VERD1CT — what is worth watching AGAIN.
 *
 * ASSUMPTION, stated loudly because the whole module rests on it: reVerdict
 * rules on RE-WATCHING. Where the W marks something you have not seen and the
 * gavel picks what to watch, the R marks something you HAVE seen and the gavel
 * picks what to revisit. If reVerdict was meant to be something else, this file
 * is the thing to redirect — the docket, tray and quiz around it are agnostic.
 *
 * A rewatch is not a first watch with the score adjusted. Different question,
 * different evidence:
 *
 *   • THE REVIEWS BARELY MATTER. You already know whether you like it — you
 *     watched it. Your own rating outranks any critic, and the deterministic
 *     Watchability is only a fallback for a title you never rated.
 *   • TIME IS THE AXIS NOBODY ELSE MODELS. The same film is a bad call three
 *     weeks after you saw it and a great one three years after. Nothing about
 *     the title changed; the gap did.
 *   • ABANDONING IS NOT WATCHING. A title you gave up on is a different
 *     question — "should I give this another go" — and folding it in here would
 *     quietly recommend, as a beloved rewatch, something you actively bailed on.
 *     It is ruled out with that reason rather than scored low.
 *
 * The architecture rule holds: the base score is DETERMINISTIC and computed
 * without the profile. The learned rewatch profile may then move it by a bounded
 * ±10 and no more, and it is a strict no-op until there are answers behind it.
 * So `rewatchScore` with an empty profile is exactly `baseRewatchScore`.
 *
 * Pure. No I/O, no clock — `now` is always a parameter.
 */
import { UNAVAILABLE_PENALTY } from '@/lib/verdict/rank';

export interface RewatchCandidate {
  /** `movie:603` — the same key the preference log uses. */
  key: string;
  title: string;
  /** Epoch ms of the last viewing. Null when we have no date for it. */
  lastWatchedAt: number | null;
  /** Times watched. Below 1 this is not a rewatch candidate at all. */
  timesWatched: number;
  /** Their OWN rating, 0..100. Outranks every critic here. */
  userRating: number | null;
  /** Did they finish it? Null when we do not know. */
  finished: boolean | null;
  runtimeMinutes: number | null;
  /** Services it is on for this viewer. Empty = we found none. */
  availableOn: readonly string[];
  /** 0..100 deterministic Watchability — the fallback for an unrated title. */
  watchability: number | null;
}

/** What the rewatch quiz learns. Every field neutral = a no-op. */
export interface RewatchProfile {
  /** −1 pure rediscovery … 0 neither … +1 pure comfort. */
  comfort: number;
  /** 0 revisits quickly … 0.5 typical … 1 needs a long gap. */
  cooling: number;
  /** Answers behind it. Zero means this profile changes nothing. */
  samples: number;
}

export const NEUTRAL_REWATCH_PROFILE: RewatchProfile = { comfort: 0, cooling: 0.5, samples: 0 };

const DAY = 86_400_000;

/** Inside this, it is a repeat rather than a decision. Ruled out, with a reason. */
export const TOO_SOON_DAYS = 21;
/** The gap at which a title is as ready as it will ever get. */
export const FULLY_READY_DAYS = 900;
/** Your own rating is most of the answer. */
export const AFFECTION_WEIGHT = 0.6;
/** How long it has been is the rest. */
export const READINESS_WEIGHT = 0.4;
/** The hard ceiling on what the learned profile may move. Mirrors ±15 / ±8. */
export const PROFILE_NUDGE_MAX = 10;
/** Repeats past this stop counting either way. */
export const REPEAT_SATURATION = 5;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Days since the last viewing. Null when we have no date to work from. */
export function daysSince(lastWatchedAt: number | null, now: number): number | null {
  if (lastWatchedAt == null || !Number.isFinite(lastWatchedAt)) return null;
  return Math.max(0, (now - lastWatchedAt) / DAY);
}

/**
 * How ready it is to be seen again, 0..1, on the gap alone.
 *
 * An unknown date returns 0.5 — genuinely neutral. Guessing "long ago" would
 * promote every title we happen to have no date for, which is a data gap
 * masquerading as a recommendation.
 */
export function readiness(days: number | null): number {
  if (days == null) return 0.5;
  if (days <= TOO_SOON_DAYS) return 0;
  if (days >= FULLY_READY_DAYS) return 1;
  return (days - TOO_SOON_DAYS) / (FULLY_READY_DAYS - TOO_SOON_DAYS);
}

/**
 * How much they liked it, 0..100.
 *
 * Their rating first. Only when they never gave one does the general verdict
 * stand in — and `affectionIsOwn` says which happened, so the copy never claims
 * "you loved it" about a number the user did not supply.
 */
export function affection(c: RewatchCandidate): { value: number; isOwn: boolean } {
  if (c.userRating != null && Number.isFinite(c.userRating)) {
    return { value: clamp(c.userRating, 0, 100), isOwn: true };
  }
  if (c.watchability != null && Number.isFinite(c.watchability)) {
    return { value: clamp(c.watchability, 0, 100), isOwn: false };
  }
  return { value: 50, isOwn: false };
}

/** The deterministic score, with no profile anywhere in it. */
export function baseRewatchScore(c: RewatchCandidate, now: number): number {
  const a = affection(c).value;
  const r = readiness(daysSince(c.lastWatchedAt, now)) * 100;
  const friction = c.availableOn.length === 0 ? UNAVAILABLE_PENALTY : 0;
  return clamp(a * AFFECTION_WEIGHT + r * READINESS_WEIGHT - friction, 0, 100);
}

/**
 * What the learned profile is allowed to move, clamped to ±PROFILE_NUDGE_MAX.
 *
 * Two things it knows, and they pull in opposite directions for different
 * people. A comfort watcher WANTS the one they have seen five times and wants it
 * sooner; someone who rewatches to rediscover wants the opposite. With no
 * answers behind the profile this returns exactly 0.
 */
export function profileNudge(c: RewatchCandidate, profile: RewatchProfile, now: number): number {
  if (profile.samples <= 0) return 0;

  // Repeats: comfort rewards them, rediscovery penalises them.
  const repeats = clamp(c.timesWatched - 1, 0, REPEAT_SATURATION);
  const repeatMove = clamp(profile.comfort, -1, 1) * (repeats / REPEAT_SATURATION) * 6;

  // Cooling: someone who needs a long gap is pushed away from recent titles and
  // toward old ones; someone who does not is pulled the other way.
  const days = daysSince(c.lastWatchedAt, now);
  const gap = readiness(days); // 0..1
  const coolingBias = (clamp(profile.cooling, 0, 1) - 0.5) * 2; // −1..1
  const coolingMove = coolingBias * (gap - 0.5) * 2 * 4;

  return clamp(repeatMove + coolingMove, -PROFILE_NUDGE_MAX, PROFILE_NUDGE_MAX);
}

/** Base plus the bounded nudge. With an empty profile this IS the base. */
export function rewatchScore(c: RewatchCandidate, profile: RewatchProfile, now: number): number {
  return clamp(baseRewatchScore(c, now) + profileNudge(c, profile, now), 0, 100);
}

/**
 * Their rating, back in the /10 they actually gave it.
 *
 * `Math.round(value / 10)` looks obvious and is wrong: it turns a 9.5 into
 * "10/10", which reports a perfect score the user never gave. Keeping one
 * decimal is exact — 95 reads as 9.5, 80 reads as 8 — and the whole point of
 * this screen is that the numbers are the user's own.
 */
export function ratingOutOfTen(value0to100: number): number {
  return Math.round(value0to100) / 10;
}

/** "three weeks" / "8 months" / "4 years" — for copy, from the gap alone. */
export function gapLabel(days: number | null): string | null {
  if (days == null) return null;
  if (days < 45) return `${Math.max(1, Math.round(days / 7))} weeks`;
  if (days < 550) return `${Math.round(days / 30)} months`;
  const years = days / 365;
  const rounded = years >= 10 ? Math.round(years) : Math.round(years * 10) / 10;
  return `${rounded} years`;
}

export interface ReVerdictConstraints {
  maxRuntimeMinutes?: number | null;
  requireAvailable?: boolean;
  /** Relax the too-soon floor — for someone who genuinely wants it again now. */
  allowRecent?: boolean;
}

export interface RankedRewatch {
  candidate: RewatchCandidate;
  score: number;
  strengths: string[];
}

export interface RuledOutRewatch {
  candidate: RewatchCandidate;
  reason: string;
}

export interface ReVerdict {
  winner: RankedRewatch | null;
  backup: RankedRewatch | null;
  alsoRan: RankedRewatch[];
  ruledOut: RuledOutRewatch[];
  /** Why the winner beat the backup. Null when nothing separated them. */
  margin: string | null;
  confidence: string;
}

/** Scores closer than this are not meaningfully different. */
export const TIE_BAND = 3;

function eligibility(c: RewatchCandidate, k: ReVerdictConstraints, now: number): string | null {
  if (!(c.timesWatched >= 1)) {
    return 'You have not watched this one — the R is for things you have already seen.';
  }
  if (c.finished === false) {
    return 'You gave up on this one. Whether to give it another go is a different question.';
  }
  const days = daysSince(c.lastWatchedAt, now);
  if (!k.allowRecent && days != null && days <= TOO_SOON_DAYS) {
    return `You watched it ${gapLabel(days)} ago — that is a repeat, not a decision.`;
  }
  if (k.maxRuntimeMinutes != null && c.runtimeMinutes != null && c.runtimeMinutes > k.maxRuntimeMinutes) {
    return `Runs ${c.runtimeMinutes} min — longer than the ${k.maxRuntimeMinutes} you have.`;
  }
  if (k.requireAvailable && c.availableOn.length === 0) {
    return 'Not on any service you have.';
  }
  return null;
}

function strengthsFor(c: RewatchCandidate, now: number): string[] {
  const out: string[] = [];
  const a = affection(c);
  if (a.isOwn && a.value >= 80) out.push(`you rated it ${ratingOutOfTen(a.value)}/10`);
  else if (!a.isOwn && a.value >= 75) out.push(`well reviewed (${Math.round(a.value)}) — you never rated it`);
  const gap = gapLabel(daysSince(c.lastWatchedAt, now));
  if (gap) out.push(`${gap} since you saw it`);
  if (c.timesWatched > 1) out.push(`you have watched it ${c.timesWatched} times`);
  if (c.availableOn.length > 0) out.push(`on ${c.availableOn.slice(0, 2).join(' and ')}`);
  return out;
}

/**
 * What actually separated the top two, in the order a person would care about.
 * Returns null rather than manufacturing a difference — and never cites a
 * rating the user did not give.
 */
export function marginBetween(
  a: RewatchCandidate,
  b: RewatchCandidate,
  scoreGap: number,
  now: number,
): string | null {
  if (a.availableOn.length > 0 && b.availableOn.length === 0) {
    return `${a.title} is on a service you have and ${b.title} is not.`;
  }
  const ra = affection(a);
  const rb = affection(b);
  if (ra.isOwn && rb.isOwn && Math.abs(ra.value - rb.value) >= 10) {
    return `You rated ${a.title} ${ratingOutOfTen(ra.value)}/10 against ${ratingOutOfTen(rb.value)}/10 for ${b.title}.`;
  }
  const da = daysSince(a.lastWatchedAt, now);
  const db = daysSince(b.lastWatchedAt, now);
  if (da != null && db != null && da - db >= 180) {
    return `It has been ${gapLabel(da)} since ${a.title} and only ${gapLabel(db)} since ${b.title}.`;
  }
  if (a.runtimeMinutes != null && b.runtimeMinutes != null && b.runtimeMinutes - a.runtimeMinutes >= 30) {
    return `${a.title} is ${b.runtimeMinutes - a.runtimeMinutes} minutes shorter.`;
  }
  if (scoreGap < TIE_BAND) return null;
  return `${a.title} came out ahead overall, but not by much.`;
}

function confidenceLine(
  winner: RankedRewatch | null,
  backup: RankedRewatch | null,
  gap: number,
  profile: RewatchProfile,
): string {
  if (!winner) return 'Nothing on the docket is ready for another go tonight.';
  // The missing-rating caveat comes FIRST. Hiding it behind the
  // single-candidate branch meant the one case where the call rests entirely on
  // a number the user never gave was also the case that never admitted it.
  if (!affection(winner.candidate).isOwn) {
    return 'Called without a rating from you on the winner — you watched it, but never said what you thought.';
  }
  if (!backup) return 'Only one survived, so this is the call by default rather than by comparison.';
  if (gap < TIE_BAND) return 'These two are level. Either is a good call — take the one you fancy.';
  if (profile.samples <= 0) {
    return 'A clear call on your own rating and how long it has been. Take the rewatch quiz and I can also weigh HOW you rewatch.';
  }
  return 'A clear call on your rating, the gap, and how you like to rewatch.';
}

export function deliverReVerdict(
  candidates: readonly RewatchCandidate[],
  now: number,
  profile: RewatchProfile = NEUTRAL_REWATCH_PROFILE,
  constraints: ReVerdictConstraints = {},
): ReVerdict {
  // Eligibility BEFORE scoring — a title that cannot be the answer is not a
  // candidate at any score, and it comes back with the reason attached.
  const ruledOut: RuledOutRewatch[] = [];
  const eligible: RewatchCandidate[] = [];
  for (const c of candidates) {
    const reason = eligibility(c, constraints, now);
    if (reason) ruledOut.push({ candidate: c, reason });
    else eligible.push(c);
  }

  const ranked: RankedRewatch[] = eligible
    .map((c) => ({ candidate: c, score: rewatchScore(c, profile, now), strengths: strengthsFor(c, now) }))
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) >= 0.001) return b.score - a.score;
      // Level on score — prefer the one they actually rated themselves.
      const oa = affection(a.candidate).isOwn ? 1 : 0;
      const ob = affection(b.candidate).isOwn ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return a.candidate.title.localeCompare(b.candidate.title);
    });

  const winner = ranked[0] ?? null;
  const backup = ranked[1] ?? null;
  const gap = winner && backup ? winner.score - backup.score : 0;

  return {
    winner,
    backup,
    alsoRan: ranked.slice(2),
    ruledOut,
    margin: winner && backup ? marginBetween(winner.candidate, backup.candidate, gap, now) : null,
    confidence: confidenceLine(winner, backup, gap, profile),
  };
}
