/**
 * Content-DNA dimensions — the interpretable "taste axes" every title is scored
 * on (0..100). This is pure math (no I/O): the AI classifier that *produces* a
 * title's raw scores lives outside `src/lib/scoring/` (in `titleDimensions.ts`),
 * but once produced the numbers are plain deterministic data, and everything
 * here — building a user's preference profile and matching a title to it — is
 * pure and unit-tested.
 */

export interface Dimension {
  key: string;
  label: string; // human name of the axis
  low: string; // what 0 means
  high: string; // what 100 means
}

/** The fixed 18 axes. Order is stable — profiles/vectors key off `key`, not index. */
export const DIMENSIONS: readonly Dimension[] = [
  { key: 'pacing', label: 'Pacing', low: 'Slow burn', high: 'Fast-paced' },
  { key: 'darkness', label: 'Tone', low: 'Light', high: 'Dark' },
  { key: 'suspense', label: 'Suspense', low: 'Low tension', high: 'Edge-of-seat' },
  { key: 'complexity', label: 'Complexity', low: 'Easy watch', high: 'Cerebral' },
  { key: 'emotion', label: 'Emotional weight', low: 'Breezy', high: 'Heavy' },
  { key: 'humor', label: 'Humor', low: 'Serious', high: 'Funny' },
  { key: 'realism', label: 'Realism', low: 'Fantastical', high: 'Grounded' },
  { key: 'scifi', label: 'Sci-fi', low: 'None', high: 'Core sci-fi' },
  { key: 'supernatural', label: 'Supernatural', low: 'None', high: 'Central' },
  { key: 'romance', label: 'Romance', low: 'None', high: 'Central' },
  { key: 'violence', label: 'Violence', low: 'Tame', high: 'Brutal' },
  { key: 'gore', label: 'Gore', low: 'Clean', high: 'Graphic' },
  { key: 'surprise', label: 'Surprise', low: 'Predictable', high: 'Unpredictable' },
  { key: 'dialogue', label: 'Dialogue', low: 'Sparse', high: 'Dialogue-driven' },
  { key: 'character', label: 'Focus', low: 'Plot-driven', high: 'Character-driven' },
  { key: 'serialized', label: 'Structure', low: 'Episodic', high: 'Serialized' },
  { key: 'family', label: 'Audience', low: 'Adult', high: 'Family-friendly' },
  { key: 'attention', label: 'Attention', low: 'Background-friendly', high: 'Demands focus' },
] as const;

export const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);

/** A title's raw fingerprint: every dimension key → 0..100. */
export type TitleDimensions = Record<string, number>;

/** True when `dims` has a finite 0..100 number for every dimension. */
export function isValidDimensions(dims: unknown): dims is TitleDimensions {
  if (!dims || typeof dims !== 'object') return false;
  const d = dims as Record<string, unknown>;
  return DIMENSION_KEYS.every((k) => {
    const v = d[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  });
}

/**
 * A user's preference profile: for each axis, the value liked titles cluster at
 * (`pref`, 0..100) and how decisive that preference is (`weight`, ≥0). Built by
 * accumulating rated titles, weighted by how far the rating sits from neutral.
 */
export interface DimensionProfile {
  pref: Record<string, number>;
  weight: Record<string, number>;
  samples: number;
}

interface ProfileAccumulator {
  wSum: Record<string, number>; // Σ |w|
  wvSum: Record<string, number>; // Σ w·value  (signed: liked pulls toward value, disliked away)
  samples: number;
}

export function emptyAccumulator(): ProfileAccumulator {
  const z: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) z[k] = 0;
  return { wSum: { ...z }, wvSum: { ...z }, samples: 0 };
}

/**
 * Fold one rated title into the accumulator. `rating` is 1..10; the signed
 * weight `rating - 5.5` means a 9 pulls the profile toward this title's values
 * and a 2 pushes it away. Titles rated near the middle barely move it.
 */
export function accumulate(acc: ProfileAccumulator, dims: TitleDimensions, rating: number): void {
  const w = rating - 5.5; // (-4.5 .. +4.5)
  if (w === 0) return;
  for (const k of DIMENSION_KEYS) {
    const v = dims[k];
    if (typeof v !== 'number') continue;
    // For a "like" (w>0) we credit the title's value; for a "dislike" (w<0) we
    // credit the *opposite* end, so avoidance shapes the profile too.
    const target = w >= 0 ? v : 100 - v;
    acc.wvSum[k]! += Math.abs(w) * target;
    acc.wSum[k]! += Math.abs(w);
  }
  acc.samples += 1;
}

/** Finalize an accumulator into a profile (pref defaults to neutral 50). */
export function finalizeProfile(acc: ProfileAccumulator): DimensionProfile {
  const pref: Record<string, number> = {};
  const weight: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) {
    const ws = acc.wSum[k]!;
    pref[k] = ws > 0 ? acc.wvSum[k]! / ws : 50;
    weight[k] = ws;
  }
  return { pref, weight, samples: acc.samples };
}

/** Build a profile from a list of (dims, rating) in one call. */
export function buildProfile(rows: { dims: TitleDimensions; rating: number }[]): DimensionProfile {
  const acc = emptyAccumulator();
  for (const r of rows) if (isValidDimensions(r.dims)) accumulate(acc, r.dims, r.rating);
  return finalizeProfile(acc);
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));

/**
 * How well a title's fingerprint matches a user's profile, 0..100.
 * Per axis: similarity = 100 - |title - pref|, weighted by how *decisive* the
 * user is on that axis (|pref - 50|) and how much evidence backs it. Axes the
 * user is neutral on don't sway the score. Returns 50 (neutral) with no signal.
 */
export function dimensionMatch(dims: TitleDimensions, profile: DimensionProfile): number {
  let num = 0;
  let den = 0;
  for (const k of DIMENSION_KEYS) {
    const v = dims[k];
    if (typeof v !== 'number') continue;
    const decisiveness = Math.abs(profile.pref[k]! - 50) / 50; // 0..1
    const evidence = Math.min(1, (profile.weight[k] ?? 0) / 12); // saturates ~ a few strong ratings
    const w = decisiveness * evidence;
    if (w <= 0) continue;
    const sim = 100 - Math.abs(v - profile.pref[k]!);
    num += w * sim;
    den += w;
  }
  return den > 0 ? clamp100(Math.round(num / den)) : 50;
}

/** The axes the user cares most about (decisive + backed by evidence), for "your taste dials". */
export function topDials(profile: DimensionProfile, limit = 4): { dim: Dimension; pref: number; lean: string }[] {
  return DIMENSIONS.map((dim) => ({
    dim,
    pref: profile.pref[dim.key]!,
    score: Math.abs(profile.pref[dim.key]! - 50) * Math.min(1, (profile.weight[dim.key] ?? 0) / 12),
  }))
    .filter((x) => x.score > 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ dim: x.dim, pref: x.pref, lean: x.pref >= 50 ? x.dim.high : x.dim.low }));
}

/**
 * Per-title "why": the axes where this title most agrees with and most clashes
 * against the user's profile (only decisive axes). For the match explainer.
 */
export function matchHighlights(
  dims: TitleDimensions,
  profile: DimensionProfile,
  limit = 3,
): { agree: { label: string; note: string }[]; clash: { label: string; note: string }[] } {
  const scored = DIMENSIONS.map((dim) => {
    const v = dims[dim.key];
    const pref = profile.pref[dim.key]!;
    const decisiveness = Math.abs(pref - 50) / 50;
    const evidence = Math.min(1, (profile.weight[dim.key] ?? 0) / 12);
    const w = decisiveness * evidence;
    const sim = typeof v === 'number' ? 100 - Math.abs(v - pref) : 50; // 0..100
    const end = pref >= 50 ? dim.high : dim.low;
    return { dim, w, sim, end };
  }).filter((x) => x.w > 0.08 && typeof dims[x.dim.key] === 'number');

  const agree = [...scored]
    .filter((x) => x.sim >= 70)
    .sort((a, b) => b.w * b.sim - a.w * a.sim)
    .slice(0, limit)
    .map((x) => ({ label: x.dim.label, note: x.end.toLowerCase() }));
  const clash = [...scored]
    .filter((x) => x.sim <= 45)
    .sort((a, b) => b.w * (100 - b.sim) - a.w * (100 - a.sim))
    .slice(0, limit)
    .map((x) => ({ label: x.dim.label, note: `you lean ${x.end.toLowerCase()}` }));
  return { agree, clash };
}
