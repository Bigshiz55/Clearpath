/**
 * THE CANONICAL WATCHVERD1CT SCORE — one user, one title, one number.
 *
 * ── THE PRODUCTION DEFECT THIS EXISTS TO MAKE IMPOSSIBLE ──────────────────
 * Today's Case Briefing showed "Your Verdict 79" for The Golden Girls. Tapping
 * the same row opened QuickLook, which showed "83 · STREAM IT". Same user, same
 * title, same instant, two different headline numbers — and the briefing
 * explained its 79 with "Quality base 79", which is an OBJECTIVE number wearing
 * a personal label.
 *
 * Two independent bugs produced that, and both are addressed here:
 *
 *  1. TWO DIFFERENT FOUNDATIONS. `buildVerdict` personalized off
 *     `general.score` (the legacy blend) while `/api/quicklook`, `/api/dna`,
 *     `/api/ratings` and `rankByDna` all read `general.standardScore ??
 *     general.score` (the calibrated Standard Score). Nothing reconciled them,
 *     so the briefing and the card were answering the same question from
 *     different starting numbers.
 *
 *  2. PERSONALIZATION CLAIMED FROM AN ACCOUNT-LEVEL FACT. The briefing decided
 *     "Your Verdict" from a global threshold — has this ACCOUNT rated enough
 *     titles — and then printed it over scores that had received no
 *     title-specific personal contribution at all. "Enough ratings somewhere"
 *     is not evidence that THIS title's number moved.
 *
 * ── THE CONTRACT ──────────────────────────────────────────────────────────
 * A headline score is built in exactly one order, and every surface consumes
 * the result rather than recomputing its own:
 *
 *     Standard Score            the objective foundation
 *       → Taste-DNA blend       only when real qualifying taste signal exists
 *       → deterministic         explicit preference / hard-rule adjustments
 *          adjustments
 *       → clamp                 the final canonical WatchVerd1ct score
 *
 * ── WHY THE HONESTY FLAGS ARE PART OF THE SCORE, NOT THE UI ───────────────
 * Whether a number may be called "Your Verdict" is a property of HOW IT WAS
 * COMPUTED, so it is decided here, beside the arithmetic that knows. A
 * component handed a bare number cannot tell an objective 83 from a
 * personalized 83, and the old UI proved it: it guessed from an account
 * threshold and guessed wrong. `personalized` is returned as evidence, never
 * inferred downstream.
 *
 * PURE. No I/O, no clock. The I/O callers are `/api/dna/[type]/[id]` (cards,
 * QuickLook, the title page) and `src/lib/tv/scoreGuide.ts` (the TV guide).
 */
import type { ScoreAdjustment } from '@/lib/types';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * A Taste-DNA contribution for ONE title, already computed by the DNA layer
 * (`dnaScore`), which folds the objective score in itself.
 *
 * `available` is the title-specific half and the one that matters: it is true
 * only when THIS title had a vibe vector to compare against. A user with a
 * thousand ratings still has no title-specific signal for a title the model has
 * never seen, and `dnaScore` correctly returns `confidence: 0` there.
 */
export interface TasteContribution {
  /** The taste-blended score (the objective score is already folded in). */
  score: number;
  /** 0..1 — how far the taste model was trusted. 0 means it did not participate. */
  confidence: number;
  /** Rated titles behind the user's model. */
  sampleSize: number;
  /** Whether THIS title had a vibe vector. Without one there is no title signal. */
  available: boolean;
}

export interface CanonicalScoreInput {
  /** The Standard Score — the objective foundation. */
  objective: number;
  /** The taste blend, when one was resolved for this title. */
  taste?: TasteContribution | null;
  /** Deterministic explicit preference / hard-rule adjustments. */
  adjustments?: readonly ScoreAdjustment[];
}

/** What a surface may honestly call the number it is about to print. */
export type CanonicalLabel = 'Your Verdict' | 'Standard Score';

export interface CanonicalScore {
  /** THE headline number. Every surface shows this and nothing else. */
  score: number;
  /** The objective foundation it was built from. */
  objective: number;
  /** Real, TITLE-SPECIFIC personal signal participated in `score`. */
  personalized: boolean;
  tasteParticipated: boolean;
  rulesParticipated: boolean;
  /** The only label a surface may use for `score`. */
  label: CanonicalLabel;
  /** One line that distinguishes the objective base from personal contributions. */
  why: string;
  /** The deterministic adjustments that actually fired (non-zero only). */
  adjustments: ScoreAdjustment[];
}

/**
 * Did the taste model actually say something about THIS title?
 *
 * All three conditions are required, and each rules out a different way of
 * faking it: `available` means the title itself was modelled, `sampleSize`
 * means the user has rated anything at all, and `confidence > 0` means the
 * blend actually weighted the taste term rather than passing the objective
 * score straight through.
 */
export function tasteParticipates(t: TasteContribution | null | undefined): boolean {
  return !!t && t.available && t.sampleSize > 0 && t.confidence > 0;
}

/** The adjustments that actually moved the number — a 0-point rule is not evidence. */
function firing(adjustments: readonly ScoreAdjustment[] | undefined): ScoreAdjustment[] {
  return (adjustments ?? []).filter((a) => a.points !== 0);
}

/**
 * Build the one canonical headline score for a user and a title.
 *
 * THE ORDER IS THE CONTRACT. Taste blends against the objective foundation
 * first (it is a re-weighting of the same 0..100 quantity), and the explicit
 * deterministic rules apply last, on top — because a hard rule is a statement
 * the user made about themselves and must not be diluted by a model. A −20
 * "supernatural is a dealbreaker" stays −20 whatever the taste model thinks.
 */
export function canonicalScore(input: CanonicalScoreInput): CanonicalScore {
  const objective = clamp(Math.round(input.objective));
  const taste = input.taste ?? null;
  const tasteIn = tasteParticipates(taste);
  const adjustments = firing(input.adjustments);
  const rulesIn = adjustments.length > 0;

  // The taste blend replaces the base (it already contains the objective term);
  // without qualifying taste the objective foundation stands on its own.
  const base = tasteIn ? taste!.score : objective;
  const score = clamp(Math.round(base + adjustments.reduce((sum, a) => sum + a.points, 0)));

  const personalized = tasteIn || rulesIn;

  // THE "WHY" NAMES THE BASE AS A BASE. The old briefing line was
  // "Quality base 79" and nothing else, printed under a "Your Verdict" badge —
  // an objective number offered as proof of personalization. The base is still
  // shown, because showing the working is right, but it is labelled as the
  // standard score and it is never the whole story on a personalized line.
  const parts = [`Standard score ${objective}`];
  if (tasteIn) parts.push(`Taste-DNA ${taste!.score >= objective ? '+' : ''}${taste!.score - objective}`);
  for (const a of adjustments) parts.push(`${a.points > 0 ? '+' : ''}${a.points} ${a.label}`);
  const why = personalized ? parts.join(' · ') : `${parts[0]} · no personal signal for this title yet`;

  return {
    score,
    objective,
    personalized,
    tasteParticipated: tasteIn,
    rulesParticipated: rulesIn,
    label: personalized ? 'Your Verdict' : 'Standard Score',
    why,
    adjustments,
  };
}
