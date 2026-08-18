/**
 * WHICH ELIGIBLE ANSWER THIS PERSON IS MOST LIKELY TO LOVE.
 *
 * ── WHERE THIS SITS, AND WHY THAT ORDER IS THE WHOLE POINT ────────────────
 * Hard constraints have already decided WHO MAY BE AN ANSWER. This layer only
 * decides the ORDER of those answers. It runs strictly after the eligibility
 * gate, on the survivors, so there is no path by which taste can resurrect a
 * candidate the request ruled out — the rejected title is simply not here to
 * be re-ranked.
 *
 *     hard constraints  →  who may be an answer      (membership)
 *     taste             →  which answer comes first  (order)
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

/** Matches `dna.ts` — the fingerprint nudge is bounded to ±8. */
const DIM_NUDGE_MAX = 8;
const DIM_NUDGE_SLOPE = 0.16;
/** Matches `preference/rank.ts` — the explicit-preference nudge is bounded to ±10. */
const PREF_NUDGE_MAX = 10;

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
  const dimN =
    input.dimMatch == null
      ? 0
      : Math.max(-DIM_NUDGE_MAX, Math.min(DIM_NUDGE_MAX, (input.dimMatch - 50) * DIM_NUDGE_SLOPE));
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
