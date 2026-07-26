/**
 * FIVE-TITLE CALIBRATION.
 *
 * The interview produces beliefs from what someone SAID. People are unreliable
 * narrators about their own taste — the point of calibration is to test the
 * profile against five concrete titles and see whether it holds.
 *
 * The five are not popular titles or a fixed set. They are chosen to be
 * maximally diagnostic: each one probes the axes the interview left least
 * certain, and each pick discounts the axes it tests so the next one probes
 * somewhere else. Five near-identical prestige dramas would confirm nothing.
 *
 * Pure. Deterministic given the same pool and profile — no shuffling, no clock.
 */
import { DIMENSION_KEYS, type TitleDimensions } from '@/lib/scoring/dimensions';
import type { Claim, VoiceProfile } from './types';
import { DIMENSIONS } from '@/lib/scoring/dimensions';

/** How much a single answer is assumed to shrink an axis's uncertainty. */
export const LEARN_RATE = 0.6;
/** Evidence at which an axis stops being worth probing. */
export const AXIS_HALF = 1.5;
export const CALIBRATION_SIZE = 5;

export interface CalibrationCandidate {
  titleId: string;
  title: string;
  dims: TitleDimensions;
  genres?: string[];
}

export interface CalibrationPick extends CalibrationCandidate {
  infoGain: number;
  /** Why this title is on the list — shown to the user, not just logged. */
  reason: string;
}

/** Verdicts the calibration screen offers. `skip` teaches nothing, by design. */
export type CalibrationVerdict = 'would_watch' | 'not_for_me' | 'seen_liked' | 'seen_disliked' | 'skip';

function axisUncertainty(profile: VoiceProfile): Record<string, number> {
  const u: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) {
    const ev = profile.dims[k]?.evidence ?? 0;
    u[k] = AXIS_HALF / (ev + AXIS_HALF);
  }
  return u;
}

/** How strongly a title expresses each axis (0..1). */
function informativeness(dims: TitleDimensions): Record<string, number> {
  const info: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) {
    const v = dims[k];
    info[k] = typeof v === 'number' ? Math.abs(v - 50) / 50 : 0;
  }
  return info;
}

export function expectedGain(dims: TitleDimensions, uncertainty: Record<string, number>): number {
  let g = 0;
  const info = informativeness(dims);
  for (const k of DIMENSION_KEYS) g += (info[k] ?? 0) * (uncertainty[k] ?? 1);
  return g;
}

/** The axis this title tests hardest, phrased for a human. */
function reasonFor(dims: TitleDimensions, uncertainty: Record<string, number>): string {
  const info = informativeness(dims);
  let bestKey = '';
  let bestScore = -1;
  for (const k of DIMENSION_KEYS) {
    const s = (info[k] ?? 0) * (uncertainty[k] ?? 1);
    if (s > bestScore) { bestScore = s; bestKey = k; }
  }
  const dim = DIMENSIONS.find((d) => d.key === bestKey);
  if (!dim) return 'This one tests something I am still unsure about.';
  const v = dims[bestKey] ?? 50;
  const pole = v >= 50 ? dim.high : dim.low;
  return `Tests where you stand on “${pole.toLowerCase()}”.`;
}

/**
 * Choose the calibration set. `exclude` skips titles the user already named in
 * the interview — asking about Severance right after they told us they loved it
 * teaches nothing and looks like we were not listening.
 */
export function pickCalibrationTitles(
  pool: CalibrationCandidate[],
  profile: VoiceProfile,
  opts: { count?: number; exclude?: Set<string> } = {},
): CalibrationPick[] {
  const count = opts.count ?? CALIBRATION_SIZE;
  const exclude = opts.exclude ?? new Set<string>();
  const uncertainty = { ...axisUncertainty(profile) };
  const remaining = pool.filter((t) => !exclude.has(t.titleId));
  const picks: CalibrationPick[] = [];
  const used = new Set<string>();

  while (picks.length < count && used.size < remaining.length) {
    let best: CalibrationCandidate | null = null;
    let bestGain = -1;
    for (const t of remaining) {
      if (used.has(t.titleId)) continue;
      const g = expectedGain(t.dims, uncertainty);
      // Ties break on titleId so the set is stable across runs.
      if (g > bestGain || (g === bestGain && best && t.titleId < best.titleId)) {
        bestGain = g;
        best = t;
      }
    }
    if (!best) break;
    used.add(best.titleId);
    picks.push({ ...best, infoGain: bestGain, reason: reasonFor(best.dims, uncertainty) });
    // Discount the axes this pick will teach, so the next one probes elsewhere.
    const info = informativeness(best.dims);
    for (const k of DIMENSION_KEYS) {
      uncertainty[k] = (uncertainty[k] ?? 1) * (1 - LEARN_RATE * (info[k] ?? 0));
    }
  }

  return picks;
}

/** Polarity, strength and evidence source for each verdict. */
const VERDICTS: Record<
  Exclude<CalibrationVerdict, 'skip'>,
  { polarity: -1 | 1; strength: number; reaction: Claim['reaction'] }
> = {
  seen_liked: { polarity: 1, strength: 0.9, reaction: 'liked' },
  seen_disliked: { polarity: -1, strength: 0.9, reaction: 'disliked' },
  would_watch: { polarity: 1, strength: 0.55, reaction: 'curious' },
  not_for_me: { polarity: -1, strength: 0.55, reaction: 'avoided' },
};

/**
 * Turn a calibration answer into a claim. Note the strength gap: having watched
 * and liked something is far stronger evidence than thinking it looks good, and
 * the model must not treat them alike.
 */
export function calibrationClaim(
  pick: CalibrationCandidate,
  verdict: CalibrationVerdict,
  ctx: { at: number; idPrefix?: string },
): Claim | null {
  if (verdict === 'skip') return null;
  const v = VERDICTS[verdict];
  const claim: Claim = {
    id: `${ctx.idPrefix ?? 'cal'}:${pick.titleId}`,
    attribute: null,
    polarity: v.polarity,
    strength: v.strength,
    confidence: 0.9,
    durability: 'durable',
    scope: 'general',
    title: { titleId: pick.titleId, text: pick.title, needsConfirmation: false },
    source: 'quiz',
    quote: `Calibration: ${pick.title}`,
    at: ctx.at,
  };
  if (v.reaction) claim.reaction = v.reaction;
  return claim;
}

/**
 * Does the calibration agree with what the interview concluded? Returns the
 * share of answers the profile would have predicted, so the reveal can say
 * "four of five matched" instead of asserting the profile is right.
 */
export function calibrationAgreement(
  picks: CalibrationCandidate[],
  verdicts: Record<string, CalibrationVerdict>,
  profile: VoiceProfile,
): { answered: number; agreed: number } {
  let answered = 0;
  let agreed = 0;
  for (const p of picks) {
    const v = verdicts[p.titleId];
    if (!v || v === 'skip') continue;
    answered += 1;
    const positive = v === 'would_watch' || v === 'seen_liked';

    // Predicted fit: how close the title sits to the profile on axes we have
    // evidence for. Axes with no evidence are ignored, not assumed neutral.
    let wSum = 0;
    let dSum = 0;
    for (const k of DIMENSION_KEYS) {
      const d = profile.dims[k];
      const v2 = p.dims[k];
      if (!d || d.evidence <= 0 || typeof v2 !== 'number') continue;
      wSum += d.evidence;
      dSum += d.evidence * (1 - Math.abs(v2 - d.pref) / 100);
    }
    if (wSum === 0) continue;
    const predictedPositive = dSum / wSum >= 0.6;
    if (predictedPositive === positive) agreed += 1;
  }
  return { answered, agreed };
}
