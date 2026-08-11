/**
 * SHOWDOWN — THE TWO LEDGERS, SEPARATED BY THE TYPE SYSTEM.
 *
 * Showdown asked "Tonight — which one are you watching?" and wrote the answer
 * into permanent Taste DNA at the heaviest weight in the product. A Tuesday
 * mood became a personality, and a recommender that makes that mistake gets
 * quietly worse every time it is used.
 *
 * The fix is not a flag. `PreferenceEvent` already carries `decay: 'mood'`, and
 * that is precisely the shape of the problem: a boolean buried in a generic
 * evidence object, correct only for as long as every future caller remembers to
 * set it. Mood evidence still lands in the same `ChannelProfile` and merely
 * fades over fourteen days.
 *
 * So the two kinds of evidence are DIFFERENT TYPES that do not convert, and the
 * functions that produce them have incompatible signatures:
 *
 *   PermanentTraitEvidence   a claim about the PERSON. Outlives the session.
 *                            Produced only in `dna` mode.
 *   SessionContextEvidence   a claim about TONIGHT. Dies with the session.
 *                            Produced only in `tonight` mode.
 *
 * Neither structurally contains the other, `sessionEvidenceFor` neither accepts
 * nor returns a `TraitProfile`, and `applyPermanent` accepts only the permanent
 * type. A contributor who wants to write tonight's mood into someone's identity
 * has to add a conversion function and name it, which is the point: the mistake
 * becomes visible in review instead of invisible in a field.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { observeAll, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';

/**
 * Which question is being asked. The mode decides which ledger receives the
 * answer, and it is threaded explicitly rather than inferred, so no code path
 * can produce evidence without having stated what it was asking.
 */
export type ShowdownMode = 'dna' | 'tonight';

/**
 * A claim about the person: "leans toward slow builds".
 *
 * `attribution` travels with the evidence rather than being folded into
 * `weight` at the source, because a later reader needs to distinguish "we are
 * confident and it was a small effect" from "it was a big effect but the
 * observation was confounded". Collapsing them loses that.
 */
export interface PermanentTraitEvidence {
  readonly kind: 'permanent';
  readonly key: TraitKey;
  /** Belief target, 0..100. */
  readonly target: number;
  /** Final evidence weight, already scaled by separation and attribution. */
  readonly weight: number;
  /** 0..1 — how cleanly this observation isolates `key`. 1 = single-axis. */
  readonly attribution: number;
}

/**
 * A claim about tonight: "wants something lighter than usual".
 *
 * Deliberately NOT shaped like `PermanentTraitEvidence`. It carries a `lean`
 * (a signed tilt) rather than a `target` + `weight`, because it is not a belief
 * being accumulated — it is a temporary bias applied at ranking time and then
 * discarded. Two different jobs, two different shapes; the asymmetry is what
 * stops one being passed where the other is expected.
 */
export interface SessionContextEvidence {
  readonly kind: 'session';
  readonly key: TraitKey;
  /** Signed tilt for tonight, roughly -1..1. Never a belief. */
  readonly lean: number;
}

/** Everything one decision produced, split by ledger. */
export interface DecisionEvidence {
  readonly permanent: readonly PermanentTraitEvidence[];
  readonly session: readonly SessionContextEvidence[];
}

/** Nothing learned — the shape returned by "haven't seen either". */
export const NO_EVIDENCE: DecisionEvidence = { permanent: [], session: [] };

/**
 * Fold permanent evidence into a profile.
 *
 * THE ONLY ROUTE FROM EVIDENCE TO A `TraitProfile`, and it accepts exactly one
 * type. `SessionContextEvidence` cannot be passed here — it has no `target` and
 * no `weight`, so it does not type-check, and it would not silently coerce even
 * if someone cast it, because the fields it lacks are the ones this reads.
 */
export function applyPermanent(
  profile: TraitProfile,
  evidence: readonly PermanentTraitEvidence[],
): TraitProfile {
  return observeAll(
    profile,
    evidence.map((e) => ({ key: e.key, target: e.target, weight: e.weight })),
  );
}

/**
 * Tonight's accumulated tilt: trait → signed lean, clamped.
 *
 * Returns a plain map, NOT a `TraitProfile`. That is deliberate — a
 * `TraitProfile` is the permanent thing, and handing tonight back in that shape
 * would make `profile = tonight` a one-character mistake instead of a type
 * error.
 */
export type SessionLean = Partial<Record<TraitKey, number>>;

/** How far one session may tilt a single axis, either way. */
export const MAX_SESSION_LEAN = 1;

export function accumulateSession(
  lean: SessionLean,
  evidence: readonly SessionContextEvidence[],
): SessionLean {
  const next: SessionLean = { ...lean };
  for (const e of evidence) {
    const prior = next[e.key] ?? 0;
    const sum = prior + e.lean;
    next[e.key] = Math.max(-MAX_SESSION_LEAN, Math.min(MAX_SESSION_LEAN, sum));
  }
  return next;
}
