/**
 * A MATCH SCORE AND A CONFIDENCE ARE DIFFERENT THINGS.
 *
 * "87" answers *how well we think this fits you*. It says nothing about *how
 * sure we are* — and an 87 built from four ratings is not the same claim as an
 * 87 built from ninety. Showing only the number manufactures precision the
 * evidence does not support, which is the fastest way for a recommender to
 * lose a user's trust permanently.
 *
 * This module turns the evidence we already hold into ONE honest label:
 *
 *   High confidence   — enough of your taste, agreeing sources, verified where
 *   Medium confidence — real signal, but something is thin or disputed
 *   Early prediction  — we are still learning you; treat this as a guess
 *
 * It DECIDES NOTHING about the score. The deterministic engine
 * (`src/lib/scoring/`) produces the match; `explainVerdict` already produces an
 * evidence-based level from ratings/availability/requirements. This layer adds
 * the two things that level cannot see — how much of the user's own taste the
 * model is standing on, and whether this title sits outside the range they
 * normally rate — and renders the result in plain language.
 *
 * Pure. No I/O.
 */

/** The engine's evidence level, from `explainVerdict`. */
export type EvidenceLevel = 'high' | 'medium' | 'low';

/** What a viewer is shown. `early` is the honest name for "we don't know you
 *  well enough yet" — "low confidence" reads as "this title is bad". */
export type ConfidenceLabel = 'high' | 'medium' | 'early';

export interface ConfidenceInput {
  /** Evidence level from the deterministic explanation, when we have one. */
  evidence?: EvidenceLevel | null;
  /** Rated titles feeding this user's model (`DnaClientResult.sampleSize`). */
  sampleSize?: number | null;
  /** Whether the score shown is personal at all. A generic score can never be
   *  more than an early prediction ABOUT THIS USER, however solid the ratings. */
  personalized?: boolean;
  /** True when the title sits outside the genres/traits this user usually
   *  rates — a real prediction, but an extrapolation. */
  outsideUsualTaste?: boolean;
  /** For a group verdict: how many participants, and how many of them have
   *  enough DNA to be scored properly. */
  participants?: { total: number; withDna: number } | null;
}

export interface ConfidenceView {
  label: ConfidenceLabel;
  /** The short badge text. */
  text: string;
  /** Plain-language sentences — why it is what it is. Always non-empty. */
  because: string[];
}

/** Ratings below this and the model is still guessing about you. Matches the
 *  "rate 10 titles to unlock personalized match scores" promise elsewhere. */
export const DNA_PERSONAL_MIN = 10;
/** Enough of your taste for the model to stand on its own. */
export const DNA_CONFIDENT_MIN = 25;

const TEXT: Record<ConfidenceLabel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  early: 'Early prediction',
};

/**
 * The one place the label is decided.
 *
 * Deliberately conservative: every path that could overstate what we know
 * caps the label rather than averaging it away. We would rather say "early"
 * about a good call than "high" about a guess.
 */
export function verdictConfidence(i: ConfidenceInput): ConfidenceView {
  const because: string[] = [];
  const sample = i.sampleSize ?? 0;
  const personal = i.personalized !== false && sample > 0;

  // Start from the engine's evidence level; absent one, assume the middle.
  let label: ConfidenceLabel = i.evidence === 'high' ? 'high' : i.evidence === 'low' ? 'early' : 'medium';
  if (i.evidence === 'high') because.push('Independent rating sources agree, and availability checks out.');
  else if (i.evidence === 'medium') because.push('The evidence is real but not unanimous.');
  else if (i.evidence === 'low') because.push('We hold very little independent evidence on this title.');

  // HOW MUCH OF YOU IS IN THIS. The cap, not an average — a model that has
  // seen four of your ratings cannot be highly confident about you no matter
  // how many critics agree with each other.
  if (!personal) {
    label = 'early';
    because.push('No taste ratings from you yet — this is the general verdict, not a personal match.');
  } else if (sample < DNA_PERSONAL_MIN) {
    label = 'early';
    because.push(`Only ${sample} rated title${sample === 1 ? '' : 's'} so far — rate ${DNA_PERSONAL_MIN - sample} more to unlock a personal match.`);
  } else if (sample < DNA_CONFIDENT_MIN) {
    if (label === 'high') label = 'medium';
    because.push(`Built from ${sample} of your ratings — still sharpening.`);
  } else {
    because.push(`Built from ${sample} of your ratings.`);
  }

  // An extrapolation is a real prediction, but not a confident one.
  if (i.outsideUsualTaste && label === 'high') {
    label = 'medium';
    because.push('This sits outside what you usually watch, so the match is an extrapolation.');
  } else if (i.outsideUsualTaste) {
    because.push('This sits outside what you usually watch.');
  }

  // A GROUP IS ONLY AS KNOWN AS ITS LEAST-KNOWN MEMBER.
  if (i.participants && i.participants.total > 1) {
    const missing = i.participants.total - i.participants.withDna;
    if (missing > 0) {
      if (label === 'high') label = 'medium';
      because.push(
        `${missing} of ${i.participants.total} ${missing === 1 ? 'person has' : 'people have'} no taste profile yet — their side of this is a guess.`,
      );
    } else {
      because.push(`All ${i.participants.total} people have a taste profile.`);
    }
  }

  return { label, text: TEXT[label], because };
}

/** How many more ratings until the personal match unlocks. 0 once unlocked. */
export function ratingsUntilPersonal(sampleSize: number): number {
  return Math.max(0, DNA_PERSONAL_MIN - Math.max(0, sampleSize));
}

/**
 * The honest heading for a recommendation row, given how much we know.
 *
 * "Recommended for you" over a popularity list is the single most common lie a
 * recommender tells. Below the personal threshold the row says what it
 * actually is.
 */
export function recommendationHeading(sampleSize: number, personalized = true): { heading: string; note: string } {
  if (!personalized || sampleSize <= 0) {
    return {
      heading: 'Popular picks while we learn your taste',
      note: `Rate ${DNA_PERSONAL_MIN} titles to unlock personalized match scores.`,
    };
  }
  if (sampleSize < DNA_PERSONAL_MIN) {
    const left = ratingsUntilPersonal(sampleSize);
    return {
      heading: 'Early picks while we learn your taste',
      note: `Rate ${left} more title${left === 1 ? '' : 's'} to unlock personalized match scores.`,
    };
  }
  return {
    heading: 'Recommended for you',
    note: 'Ranked by your VERD1CT DNA — the more you rate, the sharper it gets.',
  };
}
