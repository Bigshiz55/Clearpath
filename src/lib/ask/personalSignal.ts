/**
 * WHICH ELIGIBLE ANSWER THIS PERSON IS MOST LIKELY TO LOVE.
 *
 * ── WHERE THIS SITS, AND WHY MEMBERSHIP IS SAFE ───────────────────────────
 *     hard constraints  →  who may be an answer      (membership)
 *     taste             →  which answer comes first  (order)
 *
 * Be precise about the mechanism, because the obvious story is the wrong one.
 * In `runFinder` this ranks the pool BEFORE `qualifyCandidates` enforces the
 * person/media requirements — so a title the request rules out IS present here
 * and can be ranked first. What makes that safe is not absence but direction:
 * the gate is a downstream FILTER over the ranked list, and `evaluateCandidate`
 * reads a candidate's own facts, never its position. Ranking therefore decides
 * which candidates are verified first, and never whether one qualifies. Only
 * the subject-centrality pre-filter runs ahead of this layer.
 *
 * That order-independence is pinned in `hardConstraints.test.ts`: reverse the
 * pool and the survivors are identical.
 *
 * ── BOUNDED ON PURPOSE ────────────────────────────────────────────────────
 * The whole personal term is capped at PERSONAL_NUDGE_CEILING. Taste re-orders
 * within a window; it does not overpower quality. A film cannot leap the field
 * because the model likes its genre, and a decisive quality gap survives a
 * strong dislike. That cap is what makes personalization a preference rather
 * than a veto.
 *
 * ── NO CLAIM WITHOUT EVIDENCE ─────────────────────────────────────────────
 * `personalScore` is null unless something real participated: a cached content
 * fingerprint, an explicit preference nudge, or a named reason/concern from the
 * user's own history. A user we know nothing about gets the quality order back
 * unchanged and no personal number at all — never a fabricated 50 dressed up as
 * neutrality. "Because you like movies like this" is unrepresentable here:
 * every movement carries the evidence that caused it.
 *
 * PURE. No I/O, no clock. The gathering happens in `personalRanking.ts`.
 */
import type { ExplainReason } from '@/lib/preference/explain';
/* IMPORTED, NOT RESTATED. A copied bound is a bound that drifts: the day
   someone widens the preference nudge, this ceiling must widen with it or
   PERSONAL_NUDGE_CEILING quietly becomes a lie. */
import { PREF_NUDGE_MAX } from '@/lib/preference/rank';

/* `dna.ts` does not export its fingerprint bound, so these two are mirrored
   rather than imported. `personalSignal.test.ts` pins the agreement so the
   mirror cannot rot silently. */
const DIM_NUDGE_MAX = 8;
const DIM_NUDGE_SLOPE = 0.16;

/**
 * Ratings at which the fingerprint channel is trusted in full.
 *
 * Chosen from the measurement, not from taste: the harness showed the ceiling
 * was never the binding constraint (the widest base gap a weaker title crossed
 * was 7 points against a cap of 18), while evidence DEPTH was not consulted at
 * all. A linear ramp to twenty ratings keeps a first-session profile from
 * reordering a field as hard as a long-established one, and leaves an
 * established reader exactly where they were.
 */
const FULL_CONFIDENCE_SAMPLES = 20;

/**
 * The most the personal term may move a title, in either direction.
 *
 * Deliberately smaller than a decisive quality gap: a 90 the user dislikes must
 * still outrank a 40 they would love, because the 40 is not secretly a better
 * film. Personalization breaks ties and shapes the middle; it does not rewrite
 * the field.
 */
export const PERSONAL_NUDGE_CEILING = DIM_NUDGE_MAX + PREF_NUDGE_MAX;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface PersonalInputs {
  /** The quality/eligibility score this candidate already earned. */
  objective: number;
  /** 0..100 fit against the user's dimension profile. `null` = no fingerprint. */
  dimMatch: number | null;
  /** ±PREF_NUDGE_MAX from the explicit three-channel preference DNA. */
  prefNudge: number;
  /** Named evidence for the fit, from the user's own history. */
  reasons: ExplainReason[];
  /** Named evidence against it. */
  concerns: ExplainReason[];
  /** 0..100 — how one-sided and well-evidenced the explanation is. */
  explainConfidence: number;
  /**
   * How many rated titles the dimension profile was built from.
   *
   * MEASURED DEFECT: this was consulted only as a binary gate, so a profile
   * built from ONE rating moved a title exactly as far as one built from four
   * hundred — `scripts/measure/scoreDistribution.ts` produced byte-identical
   * distributions at samples=3 and samples=40. Omitted means "already
   * confident", which preserves every caller that predates this.
   */
  profileSamples?: number;
}

export interface PersonalEvidence {
  reasons: ExplainReason[];
  concerns: ExplainReason[];
  /** The fingerprint fit that participated, or null when we hold none. */
  dimensionMatch: number | null;
  /** The explicit-preference movement that participated. */
  preferenceNudge: number;
  /** 0..100 — strength of what this rests on. */
  confidence: number;
}

export interface PersonalSignal {
  /** 0..100 personal fit, or null when nothing about this user participated. */
  personalScore: number | null;
  /** What the ranker sorts on. Equals `objective` when nothing participated. */
  rankScore: number;
  participated: boolean;
  evidence: PersonalEvidence;
}

export function personalSignal(input: PersonalInputs): PersonalSignal {
  /* Evidence depth scales the fingerprint channel. The explicit-preference
     channel is NOT scaled: a preference the reader stated outright is not a
     statistical estimate that needs more samples to be trusted. */
  const depth =
    input.profileSamples == null
      ? 1
      : Math.max(0, Math.min(1, input.profileSamples / FULL_CONFIDENCE_SAMPLES));
  const dimN =
    input.dimMatch == null
      ? 0
      : Math.max(-DIM_NUDGE_MAX, Math.min(DIM_NUDGE_MAX, (input.dimMatch - 50) * DIM_NUDGE_SLOPE)) * depth;
  const prefN = Math.max(-PREF_NUDGE_MAX, Math.min(PREF_NUDGE_MAX, input.prefNudge));

  /* PARTICIPATION IS EVIDENCE, NOT VOLUME. A fingerprint we hold, a preference
     the user set, or a reason we can name — any of those is something to point
     at. An account with ratings but nothing that touches THIS title is not
     personalization, and saying otherwise is the failure this guards. */
  const participated =
    input.dimMatch != null || prefN !== 0 || input.reasons.length > 0 || input.concerns.length > 0;

  const evidence: PersonalEvidence = {
    reasons: input.reasons,
    concerns: input.concerns,
    dimensionMatch: input.dimMatch,
    preferenceNudge: prefN,
    // Confidence leans on the explanation's own measure and on the strength of
    // the strongest named evidence — never on how MANY reasons were produced.
    confidence: participated
      ? clamp(
          Math.round(
            Math.max(
              input.explainConfidence,
              100 * Math.max(0, ...input.reasons.map((r) => r.strength), ...input.concerns.map((r) => r.strength)),
            ),
          ),
        )
      : 0,
  };

  if (!participated) {
    return { personalScore: null, rankScore: input.objective, participated: false, evidence };
  }

  const moved = clamp(Math.round(input.objective + dimN + prefN));
  return { personalScore: moved, rankScore: moved, participated: true, evidence };
}
