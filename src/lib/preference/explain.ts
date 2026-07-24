/**
 * Explainability — "we recommended this because…". Given a title (its dims,
 * genres, people) and the user's DNA, produce the ✓ reasons, the ⚠ concerns, and
 * an honest confidence %. Reasons only fire from CONFIDENT, directional traits,
 * so the app never claims a "why" it hasn't earned.
 *
 * Experience DNA (what they actually enjoyed) outweighs Attraction DNA (what drew
 * them in) when the two are merged into an effective taste. Pure.
 */
import { DIMENSIONS, DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import type { ChannelProfile, DnaState, TraitBelief, TraitConfidence } from './types';
import { emptyBelief, evidenceConfidence, resolveConfidence } from './confidence';

/** Experience is trusted more than Attraction when we merge them into "taste". */
export const EXPERIENCE_WEIGHT = 1.0;
export const ATTRACTION_WEIGHT = 0.7;
/** A trait must be at least this confident to produce a reason/concern. */
export const MIN_REASON_CONF = 0.3;

const DIM_BY_KEY = new Map(DIMENSIONS.map((d) => [d.key, d]));

function mergeBelief(a: TraitBelief | undefined, b: TraitBelief | undefined): TraitBelief {
  const ae = (a?.evidence ?? 0) * EXPERIENCE_WEIGHT;
  const be = (b?.evidence ?? 0) * ATTRACTION_WEIGHT;
  const total = ae + be;
  if (total <= 0) return emptyBelief();
  return { pref: ((a?.pref ?? 50) * ae + (b?.pref ?? 50) * be) / total, evidence: total };
}

/** The user's effective taste per axis: Experience and Attraction merged. */
export function effectiveTaste(state: DnaState): Record<string, TraitConfidence> {
  const out: Record<string, TraitConfidence> = {};
  for (const k of DIMENSION_KEYS) {
    out[k] = resolveConfidence(mergeBelief(state.experience.dims[k], state.attraction.dims[k]));
  }
  return out;
}

function humanize(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Phrase a matched dimension pole as consumer copy. */
function dimPhrase(key: string, leansHigh: boolean): string {
  const d = DIM_BY_KEY.get(key);
  if (!d) return key;
  // Special-cases that read better than the raw pole label.
  if (key === 'romance') return leansHigh ? 'Central romance' : 'Minimal romance';
  if (key === 'violence') return leansHigh ? 'Hard-edged content' : 'Easy on the violence';
  return leansHigh ? d.high : d.low;
}

export interface ExplainReason {
  text: string;
  kind: 'dim' | 'genre' | 'person' | 'similar';
  key: string;
  strength: number; // 0..1 confidence behind this reason
}

export interface Explanation {
  reasons: ExplainReason[];
  concerns: ExplainReason[];
  confidence: number; // 0..100
}

export interface ExplainInput {
  dims?: TitleDimensions;
  genres?: string[];
  people?: string[];
  similarTo?: string; // seed title name, e.g. "Sherlock"
}

export interface ExplainOptions {
  genreLabels?: Record<string, string>;
  personLabels?: Record<string, string>;
  maxReasons?: number;
  maxConcerns?: number;
}

function affinityReason(
  channel: ChannelProfile,
  map: 'genres' | 'people',
  key: string,
  label: string,
  kind: 'genre' | 'person',
): { reason?: ExplainReason; concern?: ExplainReason } {
  const belief = channel[map][key];
  if (!belief) return {};
  const conf = resolveConfidence(belief);
  if (conf.confidence < MIN_REASON_CONF || conf.polarity === 0) return {};
  const row: ExplainReason = { text: '', kind, key, strength: conf.confidence };
  if (conf.polarity > 0) {
    row.text = kind === 'genre' ? `You usually enjoy ${label}` : `You like ${label}`;
    return { reason: row };
  }
  row.text = kind === 'genre' ? `You tend to avoid ${label}` : `You usually avoid ${label}`;
  return { concern: row };
}

/**
 * Build the explanation. Reasons/concerns are sorted strongest-first; confidence
 * reflects how one-sided AND how well-evidenced the confident signals are.
 */
export function explainTitle(input: ExplainInput, state: DnaState, opts: ExplainOptions = {}): Explanation {
  const reasons: ExplainReason[] = [];
  const concerns: ExplainReason[] = [];
  const taste = effectiveTaste(state);

  // Dimension matches/clashes.
  if (input.dims) {
    for (const k of DIMENSION_KEYS) {
      const pref = taste[k];
      const v = input.dims[k];
      if (!pref || typeof v !== 'number' || pref.polarity === 0 || pref.confidence < MIN_REASON_CONF) continue;
      const titleLeansHigh = v >= 50;
      const userLeansHigh = pref.polarity > 0;
      const titleExpresses = Math.abs(v - 50) >= 10; // the title actually has this quality
      if (!titleExpresses) continue;
      const row: ExplainReason = { text: dimPhrase(k, userLeansHigh), kind: 'dim', key: k, strength: pref.confidence };
      if (titleLeansHigh === userLeansHigh) reasons.push(row);
      else concerns.push({ ...row, text: dimPhrase(k, titleLeansHigh) });
    }
  }

  // Genre affinity.
  for (const g of input.genres ?? []) {
    const label = opts.genreLabels?.[g] ?? humanize(g);
    const { reason, concern } = affinityReason(state.experience, 'genres', g, label, 'genre');
    const att = affinityReason(state.attraction, 'genres', g, label, 'genre');
    if (reason) reasons.push(reason);
    else if (att.reason) reasons.push(att.reason);
    if (concern) concerns.push(concern);
    else if (att.concern) concerns.push(att.concern);
  }

  // Person affinity.
  for (const p of input.people ?? []) {
    const label = opts.personLabels?.[p] ?? humanize(p);
    const exp = affinityReason(state.experience, 'people', p, label, 'person');
    const att = affinityReason(state.attraction, 'people', p, label, 'person');
    if (exp.reason) reasons.push(exp.reason);
    else if (att.reason) reasons.push(att.reason);
    if (exp.concern) concerns.push(exp.concern);
    else if (att.concern) concerns.push(att.concern);
  }

  // "Similar to X" is a strong, human reason when we have a seed.
  if (input.similarTo) {
    reasons.push({ text: `Similar to ${input.similarTo}`, kind: 'similar', key: input.similarTo, strength: 0.6 });
  }

  reasons.sort((a, b) => b.strength - a.strength);
  concerns.sort((a, b) => b.strength - a.strength);

  const agree = reasons.reduce((s, r) => s + r.strength, 0);
  const against = concerns.reduce((s, r) => s + r.strength, 0);
  const confidence = computeConfidence(agree, against);

  return {
    reasons: opts.maxReasons ? reasons.slice(0, opts.maxReasons) : reasons,
    concerns: opts.maxConcerns ? concerns.slice(0, opts.maxConcerns) : concerns,
    confidence,
  };
}

/** Center at 50 (unknown); one-sidedness × how much confident signal we have. */
export function computeConfidence(agreeMass: number, againstMass: number): number {
  const total = agreeMass + againstMass;
  if (total <= 0) return 50;
  const ratio = agreeMass / total; // 0..1 one-sided toward "for"
  const certainty = evidenceConfidence(total, 2.5); // more confident signal ⇒ more sure
  return Math.round(Math.min(99, Math.max(1, 50 + (ratio - 0.5) * 100 * certainty)));
}
