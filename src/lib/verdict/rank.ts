/**
 * THE VERD1CT — one call, one backup, and why the runner-up lost.
 *
 * A ranked list of five is the same shrug in a new hat. The output here is a
 * DECISION: the title to watch, the one to fall back on, and a sentence that
 * names the specific thing that separated them. If it cannot say what separated
 * them, it says the two are level rather than inventing a reason.
 *
 * The order of operations is the whole design:
 *
 *   1. HARD ELIGIBILITY FIRST. A title you cannot actually watch tonight is not
 *      a candidate at any score. Ruled-out titles are returned WITH their
 *      reason — silently dropping a candidate someone deliberately added is how
 *      a verdict loses trust.
 *   2. THEN THE BLEND. The deterministic Watchability score is the base; the
 *      personal DNA match moves it, weighted by how much evidence stands behind
 *      that match. A confident match should count for more than a guess, and a
 *      cold-start profile should barely move the general score at all.
 *   3. THEN EVIDENCE QUALITY BREAKS TIES. Two titles a point apart are not
 *      meaningfully different; the one we know more about wins, and the copy
 *      says that is why.
 *
 * Pure. No I/O, no clock.
 */

export interface Candidate {
  key: string;
  title: string;
  /** 0..100 deterministic Watchability. Null when we could not compute one. */
  watchability: number | null;
  /** 0..100 personal match. Null when the profile cannot speak to this title. */
  personalMatch: number | null;
  /** 0..1 — how much evidence stands behind `personalMatch`. */
  matchConfidence: number;
  /** Runtime in minutes; null when unknown. */
  runtimeMinutes: number | null;
  /** Services it is on, for this viewer. Empty = we found none. */
  availableOn: readonly string[];
  /** A hard line the user drew that this title crosses. Rules it out outright. */
  hardExclusion?: string | null;
}

export interface VerdictConstraints {
  /** "I have ninety minutes" — a title longer than this is out. */
  maxRuntimeMinutes?: number | null;
  /** Only things on a service the viewer actually has. */
  requireAvailable?: boolean;
}

export interface RankedCandidate {
  candidate: Candidate;
  /** 0..100 — what the ranking sorted by. */
  score: number;
  /** Everything true about it that helped. */
  strengths: string[];
}

export interface RuledOut {
  candidate: Candidate;
  reason: string;
}

export interface Verdict {
  winner: RankedCandidate | null;
  backup: RankedCandidate | null;
  /** Everything else that survived eligibility, in order. */
  alsoRan: RankedCandidate[];
  ruledOut: RuledOut[];
  /** Why the winner beat the backup. Null when nothing separated them. */
  margin: string | null;
  /** The honest one-liner about how firm this call is. */
  confidence: string;
}

/** How far the personal match can pull the general score at full confidence. */
export const MATCH_WEIGHT = 0.55;
/** Scores closer than this are not meaningfully different. */
export const TIE_BAND = 3;
/**
 * What it costs a candidate to be on nothing you subscribe to.
 *
 * Deliberately a nudge and not a veto: a much better film is still the right
 * call even if you have to rent it, and hiding it would be the app deciding
 * your budget for you. But "I can press play right now" is real, so it counts.
 */
export const UNAVAILABLE_PENALTY = 12;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** The blend. A cold profile barely moves the general score; a hot one moves it a lot. */
export function blendedScore(c: Candidate): number {
  const base = c.watchability ?? 50;
  const friction = c.availableOn.length === 0 ? UNAVAILABLE_PENALTY : 0;
  if (c.personalMatch == null) return clamp(base - friction, 0, 100);
  const w = MATCH_WEIGHT * clamp(c.matchConfidence, 0, 1);
  const blended = base * (1 - w) + c.personalMatch * w;
  return clamp(blended - (c.availableOn.length === 0 ? UNAVAILABLE_PENALTY : 0), 0, 100);
}

function strengthsFor(c: Candidate): string[] {
  const out: string[] = [];
  if (c.personalMatch != null && c.personalMatch >= 70) out.push(`matches your taste (${Math.round(c.personalMatch)})`);
  if (c.watchability != null && c.watchability >= 70) out.push(`well reviewed (${Math.round(c.watchability)})`);
  if (c.availableOn.length > 0) out.push(`on ${c.availableOn.slice(0, 2).join(' and ')}`);
  if (c.runtimeMinutes != null && c.runtimeMinutes <= 100) out.push(`short — ${c.runtimeMinutes} min`);
  return out;
}

function eligibility(c: Candidate, k: VerdictConstraints): string | null {
  if (c.hardExclusion) return `Crosses a line you set: ${c.hardExclusion}.`;
  if (k.maxRuntimeMinutes != null && c.runtimeMinutes != null && c.runtimeMinutes > k.maxRuntimeMinutes) {
    return `Runs ${c.runtimeMinutes} min — longer than the ${k.maxRuntimeMinutes} you have.`;
  }
  if (k.requireAvailable && c.availableOn.length === 0) {
    return 'Not on any service you have.';
  }
  return null;
}

/**
 * What actually separated the top two. Checked in the order a person would
 * care about, and it returns null rather than manufacturing a difference.
 */
export function marginBetween(a: Candidate, b: Candidate, scoreGap: number): string | null {
  if (a.availableOn.length > 0 && b.availableOn.length === 0) {
    return `${a.title} is on a service you have and ${b.title} is not.`;
  }
  if (
    a.personalMatch != null &&
    b.personalMatch != null &&
    Math.abs(a.personalMatch - b.personalMatch) >= 8
  ) {
    return `${a.title} fits your taste better — ${Math.round(a.personalMatch)} against ${Math.round(b.personalMatch)}.`;
  }
  if (
    a.watchability != null &&
    b.watchability != null &&
    Math.abs(a.watchability - b.watchability) >= 8
  ) {
    return `${a.title} is the stronger title on the reviews — ${Math.round(a.watchability)} against ${Math.round(b.watchability)}.`;
  }
  if (
    a.runtimeMinutes != null &&
    b.runtimeMinutes != null &&
    b.runtimeMinutes - a.runtimeMinutes >= 30
  ) {
    return `${a.title} is ${b.runtimeMinutes - a.runtimeMinutes} minutes shorter.`;
  }
  if (scoreGap < TIE_BAND) return null;
  return `${a.title} came out ahead overall, but not by much.`;
}

function confidenceLine(winner: RankedCandidate | null, backup: RankedCandidate | null, gap: number): string {
  if (!winner) return 'Nothing on the docket could be watched tonight.';
  if (!backup) return 'Only one candidate survived, so this is the call by default rather than by comparison.';
  if (gap < TIE_BAND) {
    return 'These two are level. Either is a good call — take the one you fancy.';
  }
  if (winner.candidate.personalMatch == null) {
    return 'Called on the general verdict — your profile does not have enough on this one yet.';
  }
  if (winner.candidate.matchConfidence < 0.35) {
    return 'A confident call on the reviews, a tentative one on your taste — the profile is still thin.';
  }
  return 'A clear call on both the reviews and your taste.';
}

export function deliverVerdict(
  candidates: readonly Candidate[],
  constraints: VerdictConstraints = {},
): Verdict {
  const ruledOut: RuledOut[] = [];
  const eligible: Candidate[] = [];
  for (const c of candidates) {
    const reason = eligibility(c, constraints);
    if (reason) ruledOut.push({ candidate: c, reason });
    else eligible.push(c);
  }

  const ranked: RankedCandidate[] = eligible
    .map((c) => ({ candidate: c, score: blendedScore(c), strengths: strengthsFor(c) }))
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) >= 0.001) return b.score - a.score;
      // Level on score — prefer the one we actually know something about.
      const ea = a.candidate.matchConfidence;
      const eb = b.candidate.matchConfidence;
      if (Math.abs(eb - ea) >= 0.001) return eb - ea;
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
    margin: winner && backup ? marginBetween(winner.candidate, backup.candidate, gap) : null,
    confidence: confidenceLine(winner, backup, gap),
  };
}
