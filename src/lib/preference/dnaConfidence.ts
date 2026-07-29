/**
 * Watch DNA CONFIDENCE (pure) — a metric that answers "how well does WatchVerd1ct
 * understand this user?" It is DELIBERATELY SEPARATE from onboarding Quiz Progress
 * (answered/20). The two must never mirror each other:
 *
 *   Quiz Progress   = how far through the finite 20-title onboarding you are.
 *   DNA Confidence  = how much diverse, real evidence we've gathered about you.
 *
 * Confidence grows ONLY from real signals — calibration answers, recommendations
 * accepted/rejected, "Not For Me", "I'd Watch This", saved/watched/completed
 * titles, follow-up corrections, searches, watchlists, and optional calibration
 * packs. It NEVER increases just because another quiz question was shown, and it
 * is hard-capped at 100.
 *
 * Model: each signal type contributes a saturating share `weight·(1 − e^(−n/k))`,
 * so (a) one signal type alone can never reach 100 — breadth of evidence is
 * required, and (b) the more of a signal you have, the less each extra one adds.
 * Calibration answers alone saturate around ~60, matching the product spec
 * (Quiz 100% ⇒ DNA Confidence ~61%). No I/O; fully deterministic and testable.
 */

/** Every distinct signal we count toward understanding the user. */
export interface DnaSignalTally {
  /** Onboarding calibration answers (the finite 20). Real preference signal. */
  calibrationAnswers: number;
  /** Optional calibration-pack answers (Crime, Anime, …). Confidence only. */
  packAnswers: number;
  /** "I'd Watch This" / Looks Good on a recommendation. */
  wouldWatch: number;
  /** "Not For Me" / Skip on a recommendation (a rejection is real signal too). */
  notForMe: number;
  /** Saved to a watchlist (deliberate high-intent). */
  saved: number;
  /** Marked watched. */
  watched: number;
  /** Completed / finished a watch (stronger than started). */
  completed: number;
  /** Explicit 1–10 or Loved/Liked/Disliked ratings. */
  ratings: number;
  /** Follow-up corrections to a prediction ("this score is wrong because…"). */
  corrections: number;
  /** Recommendation slates accepted (acted on a rec positively). */
  recsAccepted: number;
  /** Recommendation slates rejected/dismissed. */
  recsRejected: number;
  /** Searches performed (weak intent signal). */
  searches: number;
  /** Distinct watchlists maintained. */
  watchlists: number;
}

export function emptyTally(): DnaSignalTally {
  return {
    calibrationAnswers: 0,
    packAnswers: 0,
    wouldWatch: 0,
    notForMe: 0,
    saved: 0,
    watched: 0,
    completed: 0,
    ratings: 0,
    corrections: 0,
    recsAccepted: 0,
    recsRejected: 0,
    searches: 0,
    watchlists: 0,
  };
}

/**
 * Per-signal contribution model. `weight` is the MOST that signal can ever add;
 * `k` sets how fast it saturates (contribution reaches ~63% of weight at n=k).
 * Weights intentionally sum to > 100 so a broadly-engaged user can reach 100,
 * while any single channel caps well below it. Calibration is weighted so the 20
 * onboarding answers alone land near ~60.
 */
interface SignalModel {
  key: keyof DnaSignalTally;
  weight: number;
  k: number;
  /** Human label + why-it-counts, surfaced in "what we learned" evidence. */
  label: string;
}

export const SIGNAL_MODEL: readonly SignalModel[] = [
  { key: 'calibrationAnswers', weight: 64, k: 7.4, label: 'Calibration answers' },
  { key: 'ratings', weight: 8, k: 6, label: 'Ratings' },
  { key: 'watched', weight: 10, k: 4, label: 'Watched titles' },
  { key: 'completed', weight: 6, k: 4, label: 'Completed watches' },
  { key: 'corrections', weight: 6, k: 3, label: 'Score corrections' },
  { key: 'saved', weight: 6, k: 5, label: 'Saved titles' },
  { key: 'wouldWatch', weight: 6, k: 6, label: '“I’d watch this”' },
  { key: 'notForMe', weight: 5, k: 6, label: '“Not for me”' },
  { key: 'recsAccepted', weight: 6, k: 5, label: 'Recommendations accepted' },
  { key: 'recsRejected', weight: 5, k: 5, label: 'Recommendations rejected' },
  { key: 'packAnswers', weight: 6, k: 6, label: 'Calibration packs' },
  { key: 'searches', weight: 3, k: 4, label: 'Searches' },
  { key: 'watchlists', weight: 2, k: 2, label: 'Watchlists' },
] as const;

/** The theoretical max before the 100 cap (for docs/tests). */
export const RAW_WEIGHT_TOTAL = SIGNAL_MODEL.reduce((s, m) => s + m.weight, 0);

const sat = (n: number, k: number) => (n > 0 ? 1 - Math.exp(-n / k) : 0);

export interface ConfidenceContribution {
  key: keyof DnaSignalTally;
  label: string;
  count: number;
  /** Points this signal added toward the (pre-cap) total. */
  points: number;
  /** How saturated this channel is, 0..1. */
  saturation: number;
}

export interface DnaConfidenceResult {
  /** 0..100, hard-capped. This is the number the UI shows. */
  percent: number;
  /** Pre-cap sum (can exceed 100 internally; never displayed). */
  raw: number;
  /** How many distinct signal types have any evidence (breadth). */
  breadth: number;
  /** Per-signal breakdown, richest first — the evidence behind the number. */
  contributions: ConfidenceContribution[];
  tier: 'new' | 'forming' | 'sharp' | 'elite';
}

function tierFor(percent: number): DnaConfidenceResult['tier'] {
  if (percent >= 80) return 'elite';
  if (percent >= 55) return 'sharp';
  if (percent >= 25) return 'forming';
  return 'new';
}

/**
 * Compute the DNA Confidence percent (0..100) and the evidence behind it.
 * Guaranteed: monotonic non-decreasing in every count, never exceeds 100, and
 * `0` for an empty tally.
 */
export function computeDnaConfidence(tally: DnaSignalTally): DnaConfidenceResult {
  const contributions: ConfidenceContribution[] = [];
  let raw = 0;
  let breadth = 0;
  for (const m of SIGNAL_MODEL) {
    const count = Math.max(0, Math.floor(tally[m.key] || 0));
    const s = sat(count, m.k);
    const points = m.weight * s;
    raw += points;
    if (count > 0) breadth += 1;
    contributions.push({ key: m.key, label: m.label, count, points, saturation: s });
  }
  contributions.sort((a, b) => b.points - a.points);
  const percent = Math.min(100, Math.round(raw));
  return { percent, raw, breadth, contributions, tier: tierFor(percent) };
}

/** Convenience: just the capped percent. */
export function dnaConfidencePercent(tally: DnaSignalTally): number {
  return computeDnaConfidence(tally).percent;
}
