/**
 * RESPONSE QUALITY — detect low-quality answering (rapid identical tapping,
 * answering too fast to have read the card) and turn it into a reliability scalar
 * that DOWN-weights suspect signals. It never punishes the user; it just lowers
 * confidence and (upstream) nudges them toward Skip. Pure.
 */
import type { PreferenceEvent } from './types';

/** Below this dwell (ms) a response is "too fast to have judged the title". */
export const MIN_DWELL_MS = 500;
/** An identical-action run longer than this looks like button-mashing. */
export const MAX_IDENTICAL_RUN = 5;
/** Reliability never drops below this — we degrade, never zero out. */
export const RELIABILITY_FLOOR = 0.3;

export interface QualityResult {
  /** 0..1 overall reliability of this user's signals. */
  reliability: number;
  /** Fraction of responses that were suspiciously fast. */
  tooFastRate: number;
  /** Longest run of the identical action. */
  longestIdenticalRun: number;
  /** A gentle nudge is warranted (offer Skip more prominently). */
  suggestSkipNudge: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function responseQuality(events: PreferenceEvent[]): QualityResult {
  const acted = events.filter((e) => e.action !== 'skip' || e.experienceGrade || e.attractionGrade || e.discoveryGrade);
  const n = acted.length;
  if (n === 0) {
    return { reliability: 0.85, tooFastRate: 0, longestIdenticalRun: 0, suggestSkipNudge: false };
  }

  let tooFast = 0;
  let dwellKnown = 0;
  let longestRun = 1;
  let run = 1;
  for (let i = 0; i < acted.length; i++) {
    const e = acted[i]!;
    if (typeof e.dwellMs === 'number') {
      dwellKnown += 1;
      if (e.dwellMs < MIN_DWELL_MS) tooFast += 1;
    }
    if (i > 0 && acted[i - 1]!.action === e.action) {
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 1;
    }
  }

  const tooFastRate = dwellKnown > 0 ? tooFast / dwellKnown : 0;
  // Penalties: fast-tapping and long identical runs erode reliability.
  const fastPenalty = tooFastRate * 0.5;
  const runPenalty = longestRun > MAX_IDENTICAL_RUN ? Math.min(0.4, (longestRun - MAX_IDENTICAL_RUN) * 0.05) : 0;
  const reliability = clamp01(Math.max(RELIABILITY_FLOOR, 1 - fastPenalty - runPenalty));

  return {
    reliability,
    tooFastRate,
    longestIdenticalRun: longestRun,
    suggestSkipNudge: tooFastRate > 0.4 || longestRun > MAX_IDENTICAL_RUN + 2,
  };
}

/** Per-event confidence weight (0..1) for a suspect response — used at write time. */
export function eventReliabilityWeight(event: PreferenceEvent): number {
  if (typeof event.dwellMs === 'number' && event.dwellMs < MIN_DWELL_MS) {
    // Scale from floor at 0ms up to 1.0 at MIN_DWELL_MS.
    return clamp01(RELIABILITY_FLOOR + (1 - RELIABILITY_FLOOR) * (event.dwellMs / MIN_DWELL_MS));
  }
  return 1;
}
