/**
 * THE DNA REVEAL.
 *
 * Turns a finished interview into the "Your Verdict DNA is ready" payload: the
 * top axes (by how confident AND how opinionated the user was), the hard
 * dealbreakers, the must-haves, and a `distinctiveness` heuristic — how far this
 * taste sits from a mainstream baseline. Predicted loves/hates/discoveries are
 * left empty on purpose: the server resolves those from the real catalogue, and
 * fabricating titles here would be exactly the data dishonesty the repo forbids.
 *
 * Pure. A deterministic function of the interview state.
 */
import type { DnaReveal, DnaRevealCategory, InterviewState, Claim, Sentiment, TasteCategory } from './types';
import { TASTE_CATEGORIES } from './types';
import { CATEGORY_META } from './categories';

/** Net feeling of a sentiment, -1..1. */
function sentimentValue(s: Sentiment): number {
  switch (s) {
    case 'love':
      return 1;
    case 'like':
      return 0.5;
    case 'dislike':
      return -0.5;
    case 'hate':
      return -1;
    default:
      return 0;
  }
}

/** A strong statement worth surfacing as a must-have / dealbreaker. */
const STRONG = 0.6;

/**
 * The population baseline a distinctiveness score is measured against: most
 * people run mildly warm on the crowd-pleasers and neutral elsewhere. A profile
 * that diverges from this — strong loves, real dealbreakers, niche passions — is
 * what "distinctive" means.
 */
const MAINSTREAM_BASELINE: Partial<Record<TasteCategory, number>> = {
  feelGood: 0.4,
  comedyTolerance: 0.3,
  genres: 0.3,
  superheroes: 0.2,
  romance: 0.2,
  family: 0.2,
};

/** Net disposition per axis, -1..1, evidence-weighted over the claims. */
function dispositions(claims: Claim[]): Record<TasteCategory, number> {
  const acc: Record<string, { wv: number; w: number }> = {};
  for (const claim of claims) {
    const v = sentimentValue(claim.sentiment);
    const w = Math.max(0, claim.strength);
    if (w <= 0) continue;
    for (const cat of claim.categories) {
      const bucket = (acc[cat] ??= { wv: 0, w: 0 });
      bucket.wv += v * w;
      bucket.w += w;
    }
  }
  const out = {} as Record<TasteCategory, number>;
  for (const cat of TASTE_CATEGORIES) {
    const b = acc[cat];
    out[cat] = b && b.w > 0 ? Math.max(-1, Math.min(1, b.wv / b.w)) : 0;
  }
  return out;
}

/** Strong-sentiment claim subjects, strongest first, deduped by subject. */
function strongSubjects(claims: Claim[], want: (v: number) => boolean): string[] {
  const best = new Map<string, { subject: string; strength: number }>();
  for (const c of claims) {
    if (!want(sentimentValue(c.sentiment))) continue;
    if (c.strength < STRONG) continue;
    const key = c.subject.toLowerCase();
    const prev = best.get(key);
    if (!prev || c.strength > prev.strength) best.set(key, { subject: c.subject, strength: c.strength });
  }
  return [...best.values()].sort((a, b) => b.strength - a.strength).map((x) => x.subject);
}

/** How far the profile sits from the mainstream baseline, 0..1. */
function computeDistinctiveness(state: InterviewState, disp: Record<TasteCategory, number>): number {
  let acc = 0;
  let weight = 0;
  for (const cat of TASTE_CATEGORIES) {
    const conf = state.confidence[cat].confidence;
    if (conf <= 0) continue;
    const baseline = MAINSTREAM_BASELINE[cat] ?? 0;
    acc += conf * Math.abs(disp[cat] - baseline);
    weight += conf;
  }
  return weight > 0 ? Math.max(0, Math.min(1, acc / weight)) : 0;
}

/** Build the reveal payload. Predicted titles are left for the caller to fill. */
export function buildDnaReveal(state: InterviewState): DnaReveal {
  const disp = dispositions(state.claims);

  const topCategories: DnaRevealCategory[] = TASTE_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    confidence: state.confidence[category].confidence,
    disposition: disp[category],
  }))
    .filter((c) => c.confidence > 0)
    .sort((a, b) => b.confidence * Math.abs(b.disposition) - a.confidence * Math.abs(a.disposition))
    .slice(0, 8);

  return {
    overallConfidence: state.overallConfidence,
    distinctiveness: computeDistinctiveness(state, disp),
    topCategories,
    dealBreakers: strongSubjects(state.claims, (v) => v < 0),
    mustHaves: strongSubjects(state.claims, (v) => v > 0),
    predictedLoves: [],
    predictedHates: [],
    hiddenDiscoveries: [],
  };
}
