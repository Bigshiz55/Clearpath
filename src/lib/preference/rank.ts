/**
 * The PREFERENCE NUDGE — how the three-DNA model contributes to ranking. This is
 * the one function `rankByDna` calls to fold Experience/Attraction/Discovery into
 * a title's rank score. Bounded (±PREF_NUDGE_MAX) so the deterministic
 * Watchability score stays authoritative, and a strict no-op when the user has no
 * preference evidence.
 *
 * Pure — no I/O, no AI. Given a title's dims/genres + a derived DnaState, returns
 * a bounded nudge and a confidence. The same function powers the before/after
 * ranking report, so the report reflects the real production math.
 */
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import type { DnaState, TraitConfidence } from './types';
import { resolveConfidence } from './confidence';
import { effectiveTaste } from './explain';
import { understanding } from './engine';

/** Max points the preference model can move a title (kept in the ±8/±6 family). */
export const PREF_NUDGE_MAX = 10;
/** A trait must be at least this confident to influence ranking. */
export const MIN_RANK_CONF = 0.25;
/** Genre affinity: experience weighted over attraction, matching effectiveTaste. */
const GENRE_EXP_W = 1.0;
const GENRE_ATT_W = 0.7;
/** Dimension vs genre split of the nudge. */
const DIM_SHARE = 0.7;
const GENRE_SHARE = 0.3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface RankTitle {
  dims?: TitleDimensions;
  genres?: string[];
  people?: string[];
}

export interface NudgeResult {
  /** Bounded rank delta in points (±PREF_NUDGE_MAX). */
  nudge: number;
  /** 0..1 confidence in this nudge (drives verdict confidence). */
  confidence: number;
  /** Raw agreement in [-1, 1] before scaling (for reports/debug). */
  agreement: number;
}

/** Effective taste with explicit corrections overriding inferred axes at full confidence. */
function correctedTaste(dna: DnaState, corrections?: Record<string, number>): Record<string, TraitConfidence> {
  const taste = effectiveTaste(dna);
  if (corrections) {
    for (const [k, target] of Object.entries(corrections)) {
      const lean = target - 50;
      taste[k] = {
        pref: target,
        evidence: 999,
        confidence: 1,
        decisiveness: Math.abs(lean) / 50,
        polarity: Math.abs(lean) < 6 ? 0 : lean > 0 ? 1 : -1,
        tier: 'strong',
      };
    }
  }
  return taste;
}

function genreBelief(dna: DnaState, slug: string): TraitConfidence | null {
  const e = dna.experience.genres[slug];
  const a = dna.attraction.genres[slug];
  if (!e && !a) return null;
  const ae = (e?.evidence ?? 0) * GENRE_EXP_W;
  const be = (a?.evidence ?? 0) * GENRE_ATT_W;
  const total = ae + be;
  if (total <= 0) return null;
  const pref = ((e?.pref ?? 50) * ae + (a?.pref ?? 50) * be) / total;
  return resolveConfidence({ pref, evidence: total });
}

/**
 * Compute the bounded preference nudge for one title. Positive = the user's DNA
 * favors it; negative = it matches patterns they rule out / DNF.
 */
export function preferenceNudge(
  title: RankTitle,
  dna: DnaState,
  opts: { corrections?: Record<string, number> } = {},
): NudgeResult {
  const taste = correctedTaste(dna, opts.corrections);

  // Dimensions: signed DIRECTION (confidence-weighted mean of per-axis agreement)
  // scaled by our average CONFIDENCE — so a higher-confidence belief (e.g.
  // Experience over Attraction) moves the nudge more, not just gates it.
  let dimContribution = 0;
  let dimWeight = 0;
  let dimCount = 0;
  if (title.dims) {
    for (const k of DIMENSION_KEYS) {
      const pref = taste[k];
      const v = title.dims[k];
      if (!pref || typeof v !== 'number' || pref.polarity === 0 || pref.confidence < MIN_RANK_CONF) continue;
      const express = Math.abs(v - 50) / 50; // how strongly the title shows this axis
      if (express < 0.2) continue;
      const titleDir = v >= 50 ? 1 : -1;
      const agree = (titleDir === pref.polarity ? 1 : -1) * express;
      dimContribution += agree * pref.confidence;
      dimWeight += pref.confidence;
      dimCount += 1;
    }
  }
  const dimDir = dimWeight > 0 ? dimContribution / dimWeight : 0; // [-1, 1]
  const dimConfAvg = dimCount > 0 ? dimWeight / dimCount : 0; // [0, 1]
  const dimSigned = dimDir * dimConfAvg;

  // Genres: same shape.
  let genreContribution = 0;
  let genreWeight = 0;
  let genreCount = 0;
  for (const g of title.genres ?? []) {
    const belief = genreBelief(dna, g);
    if (!belief || belief.polarity === 0 || belief.confidence < MIN_RANK_CONF) continue;
    genreContribution += belief.polarity * belief.confidence;
    genreWeight += belief.confidence;
    genreCount += 1;
  }
  const genreDir = genreWeight > 0 ? genreContribution / genreWeight : 0;
  const genreConfAvg = genreCount > 0 ? genreWeight / genreCount : 0;
  const genreSigned = genreDir * genreConfAvg;

  // Blend (drop the genre share entirely when there's no genre signal).
  const hasDim = dimCount > 0;
  const hasGenre = genreCount > 0;
  let agreement = 0;
  if (hasDim && hasGenre) agreement = DIM_SHARE * dimSigned + GENRE_SHARE * genreSigned;
  else if (hasDim) agreement = dimSigned;
  else if (hasGenre) agreement = genreSigned;

  const nudge = clamp(agreement * PREF_NUDGE_MAX, -PREF_NUDGE_MAX, PREF_NUDGE_MAX);
  return { nudge, agreement, confidence: preferenceConfidence(dna) };
}

/** 0..1 overall confidence in this user's taste model — low for new users. */
export function preferenceConfidence(dna: DnaState): number {
  return clamp(understanding(dna) / 100, 0, 1);
}

/** True when the model has any usable evidence (else ranking should be a no-op). */
export function hasPreferenceSignal(dna: DnaState): boolean {
  return dna.experience.samples > 0 || dna.attraction.samples > 0 || dna.discovery.samples > 0;
}

export interface RankInput {
  id: string;
  objective: number; // the deterministic base score (Watchability)
  dims?: TitleDimensions;
  genres?: string[];
}
export interface RankOutput extends RankInput {
  nudge: number;
  finalScore: number;
  confidence: number;
}

/**
 * Apply the preference nudge to a candidate set and re-sort — the exact term
 * `rankByDna` adds to each title's score, exposed as a pure helper so the
 * before/after report reflects production behavior (objective scores supplied).
 */
export function rankWithPreference(
  candidates: RankInput[],
  dna: DnaState,
  opts: { corrections?: Record<string, number> } = {},
): RankOutput[] {
  const out = candidates.map((c) => {
    const { nudge, confidence } = preferenceNudge({ dims: c.dims, genres: c.genres }, dna, opts);
    return { ...c, nudge, confidence, finalScore: clamp(c.objective + nudge, 0, 100) };
  });
  out.sort((a, b) => b.finalScore - a.finalScore);
  return out;
}
