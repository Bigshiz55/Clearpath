/**
 * WHY THIS VERD1CT? (pure, no I/O). Assembles the transparent explanation the
 * mission mandates for every recommendation: what pushed it up, what held it
 * back, which hard requirements were checked, availability with a confidence
 * label, and WHY confidence is high/medium/low. Built strictly from data the
 * app already computed — it never invents evidence, and it never presents
 * mathematical precision the data can't support.
 */

export type AvailabilityConfidence = 'verified' | 'likely' | 'unconfirmed';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ExplainInput {
  /** Personal match 0–100 (null when the user has no profile signal yet). */
  matchScore: number | null;
  /** Blended general/watchability score 0–100. */
  generalScore: number | null;
  /** Trait matches that lifted it (e.g. "fast-paced investigative mystery"). */
  matchedTraits: string[];
  /** Traits the user commonly rejects that this title carries. */
  riskTraits: string[];
  /** Hard requirements that were CHECKED, with their outcome + evidence. */
  requirements: { label: string; satisfied: boolean; evidence: string }[];
  /** Number of independent rating sources actually present (RT/IMDb/TMDB…). */
  ratingSourceCount: number;
  /** Availability as the app verified it (null = nothing verifiable). */
  availability: { where: string; kind: 'included' | 'free_with_ads' | 'rent' | 'buy'; confidence: AvailabilityConfidence } | null;
}

export interface VerdictExplanation {
  rose: string[];
  heldBack: string[];
  requirements: { label: string; satisfied: boolean; evidence: string }[];
  availability: { text: string; confidence: AvailabilityConfidence } | null;
  confidence: { level: ConfidenceLevel; because: string[] };
}

const KIND_LABEL: Record<NonNullable<ExplainInput['availability']>['kind'], string> = {
  included: 'Included with subscription',
  free_with_ads: 'Free with ads',
  rent: 'Rental',
  buy: 'Purchase',
};

export function explainVerdict(i: ExplainInput): VerdictExplanation {
  const rose: string[] = [];
  const heldBack: string[] = [];

  if (i.matchScore != null && i.matchScore >= 75) rose.push(`Strong personal fit (${i.matchScore} match).`);
  for (const t of i.matchedTraits) rose.push(t);
  if (i.generalScore != null && i.generalScore >= 70) rose.push(`Well received overall (${i.generalScore}/100 across sources).`);
  const satisfied = i.requirements.filter((r) => r.satisfied);
  if (satisfied.length > 0) rose.push(`Meets every checked requirement (${satisfied.length}).`);

  for (const t of i.riskTraits) heldBack.push(t);
  if (i.matchScore != null && i.matchScore < 55) heldBack.push(`Below-average personal fit (${i.matchScore}).`);
  if (i.generalScore != null && i.generalScore < 55) heldBack.push(`Mixed reception (${i.generalScore}/100).`);
  const failed = i.requirements.filter((r) => !r.satisfied);
  for (const r of failed) heldBack.push(`Requirement not met: ${r.label}.`);
  if (i.availability && i.availability.confidence !== 'verified') heldBack.push('Availability not fully verified.');
  if (i.ratingSourceCount === 0) heldBack.push('No independent rating sources yet.');

  // Confidence is EXPLAINED, never asserted: it needs personal signal,
  // independent evidence, and verified availability to be high.
  const because: string[] = [];
  let points = 0;
  if (i.matchScore != null) { points += 1; because.push('Personal taste signal available.'); }
  else because.push('No personal taste signal yet — match is generic.');
  if (i.ratingSourceCount >= 2) { points += 1; because.push(`${i.ratingSourceCount} independent rating sources agree.`); }
  else if (i.ratingSourceCount === 1) because.push('Only one rating source available.');
  else because.push('No rating sources available.');
  if (i.availability?.confidence === 'verified') { points += 1; because.push('Availability verified.'); }
  else if (i.availability) because.push('Availability is inferred, not verified.');
  else because.push('No availability data.');
  if (failed.length === 0 && i.requirements.length > 0) { points += 1; because.push('Every hard requirement validated.'); }

  let level: ConfidenceLevel = points >= 3 ? 'high' : points === 2 ? 'medium' : 'low';
  // A failed hard requirement actively blocks high confidence — the result is
  // compromised regardless of how much other evidence agrees.
  if (failed.length > 0 && level === 'high') {
    level = 'medium';
    because.push(`${failed.length} requirement${failed.length === 1 ? '' : 's'} not met — confidence capped.`);
  }

  return {
    rose,
    heldBack,
    requirements: i.requirements,
    availability: i.availability
      ? { text: `${i.availability.where} · ${KIND_LABEL[i.availability.kind]}`, confidence: i.availability.confidence }
      : null,
    confidence: { level, because },
  };
}
