/**
 * HOW WELL DOES THIS CANDIDATE ANSWER *THIS REQUEST*?
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 * The ranking score is `objective + personal`. `objective` is the Standard
 * Score — a QUALITY number blended from correlated critic sources and shrunk
 * toward a neutral prior on thin evidence. Both of those are correct, and both
 * compress: measured over sixty scenario×profile cells, a field of ~24
 * candidates spans a median of 18 points, so adjacent candidates sit under a
 * point apart and three quarters of the order is a near tie.
 *
 * The measurement's real finding was not that the base is too narrow. It is
 * that the ranking has no term for the thing the user actually asked about.
 * `evaluateSubjectCentrality` already produces a per-candidate 0..100 on
 * exactly that question — is the requested subject CENTRAL to this title, or
 * merely present — and the pipeline used it to FILTER and to DISPLAY and never
 * to ORDER. Same shape as every other defect in this pass: computed correctly,
 * then dropped one layer down.
 *
 * ── WHY NOT WIDEN THE QUALITY SCALE INSTEAD ───────────────────────────────
 * Because the Standard Score means something, and it means the same thing on
 * the card, in the briefing and in the verdict. Stretching it to make a list
 * look decisive would break that agreement and would still be answering the
 * wrong question: two boxing films can be equally good and still differ
 * enormously in how much they are ABOUT boxing.
 *
 * ── CENTRED ON THE FIELD, SO IT REORDERS RATHER THAN INFLATES ─────────────
 * The nudge is measured against the mean of the field it is ranking, so the
 * set's average movement is zero by construction: this can promote a candidate
 * over another, and cannot lift a whole answer's scores. A field whose
 * candidates all answer the request equally well produces no movement at all,
 * which is the honest outcome — for a plain genre browse every eligible title
 * satisfies the request identically, and pretending otherwise would be
 * inventing a distinction the request did not draw.
 *
 * ── BOUNDED, AND SMALLER THAN THE PERSON ──────────────────────────────────
 * `RELEVANCE_NUDGE_MAX` is deliberately under `PERSONAL_NUDGE_CEILING`: what
 * you asked for shapes the order, what we know about you shapes it more.
 * Nothing here can overturn a large quality gap on its own.
 *
 * PURE. No I/O.
 */

/** The most the request-fit channel may move a candidate, in points. */
export const RELEVANCE_NUDGE_MAX = 12;

export type SubjectCentrality = 'CENTRAL' | 'MATERIAL' | 'INCIDENTAL' | 'UNSUPPORTED';

export interface RelevanceInput {
  /** `evaluateSubjectCentrality`'s 0..100, or null when no subject was asked. */
  confidence: number | null;
  centrality: SubjectCentrality | null;
}

export interface RelevanceSignal {
  /** Points added to the ORDERING score. Never shown as a quality number. */
  nudge: number;
  /** True when this candidate carried request-fit evidence at all. */
  participated: boolean;
  /** Consumer-facing, or null when there is nothing to say. */
  reason: string | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * The whole field at once, because the centre is the field's own mean.
 *
 * Returns one signal per input, in the same order. Candidates with no evidence
 * are inert and are excluded from the mean — a title we cannot judge must not
 * drag the centre and thereby move the ones we can.
 */
export function relevanceSignals(inputs: readonly RelevanceInput[]): RelevanceSignal[] {
  const scored = inputs.filter((i) => typeof i.confidence === 'number');
  const INERT: RelevanceSignal = { nudge: 0, participated: false, reason: null };
  /* ONE JUDGED CANDIDATE CANNOT BE ABOVE OR BELOW AVERAGE. With nothing to
     compare against, the honest movement is none. */
  if (scored.length < 2) return inputs.map(() => INERT);

  const mean = scored.reduce((a, i) => a + (i.confidence as number), 0) / scored.length;
  const spread = Math.max(...scored.map((i) => Math.abs((i.confidence as number) - mean)));
  /* A FIELD THAT AGREES WITH ITSELF PRODUCES NOTHING. Dividing by a spread of
     zero would be a division by zero; dividing by a tiny one would magnify
     noise into a confident-looking order. */
  if (spread < 1) return inputs.map(() => INERT);

  return inputs.map((i) => {
    if (typeof i.confidence !== 'number') return INERT;
    const centred = (i.confidence - mean) / spread; // -1 … +1
    const nudge = clamp(centred * RELEVANCE_NUDGE_MAX, -RELEVANCE_NUDGE_MAX, RELEVANCE_NUDGE_MAX);
    return {
      nudge,
      participated: true,
      reason:
        nudge > 0.5
          ? 'It is more squarely about what you asked for than the rest of this list'
          : nudge < -0.5
            ? 'It fits what you asked for less squarely than the rest of this list'
            : null,
    };
  });
}
