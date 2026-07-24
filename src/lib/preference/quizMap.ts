/**
 * Quiz answer → preference event mapping. The single, shared translation from a
 * two-step quiz answer ("Have you seen this?" → a rating) into the real Watch DNA
 * engine's event. Pure, so the server action and the tests use identical logic
 * and can't drift. There is NO parallel scoring here — this only shapes the event
 * that `deriveDna` consumes.
 */
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import type { ExperienceGrade, PreferenceEvent, PrimaryAction, ReasonCode } from './types';

/** Recognition step outcome. */
export type Recognition = 'seen' | 'unseen' | 'unsure';

/** The post-watch rating choices surfaced after "Seen it". */
export type QuizRating = 'loved' | 'liked' | 'okay' | 'disliked' | 'hated';

export interface QuizAnswer {
  /** Client-generated stable id → dedup + Undo target. */
  eventId: string;
  /** "movie:603" / "tv:1396". */
  titleId: string;
  /** Epoch ms the answer was made. */
  at: number;
  recognition: Recognition;
  /** Present only when recognition === 'seen'. */
  rating?: QuizRating;
  /** Seen but stopped before the end → overrides the grade with DNF. */
  dnf?: boolean;
  /** Optional high-value follow-up reasons. */
  reasons?: ReasonCode[];
  /** Title fingerprint (server-enriched from cache when available). */
  dims?: TitleDimensions;
  genres?: string[];
  /** ms the card was shown before answering (quality signal). */
  dwellMs?: number;
  source?: string;
}

/** Map a rating choice to an Experience grade (DNF wins when the user bailed). */
export function gradeFor(answer: QuizAnswer): ExperienceGrade | null {
  if (answer.recognition !== 'seen') return null;
  if (answer.dnf) return 'dnf';
  return answer.rating ?? null;
}

/** Coarse action tag (stats/analytics); the fine grade drives the actual signal. */
function actionFor(answer: QuizAnswer): PrimaryAction {
  if (answer.recognition !== 'seen') return 'skip'; // haven't-seen / unsure = zero DNA
  const g = gradeFor(answer);
  if (!g) return 'skip';
  return g === 'disliked' || g === 'hated' || g === 'dnf' ? 'seen_disliked' : 'seen_liked';
}

/**
 * Legacy 1–10 rating for the watchlist mirror (keeps the existing recommendation
 * seed working). Only for SEEN titles. Null for unseen/unsure (no watched row).
 * Loved > Liked, Hated < Disliked, "okay" ≈ neutral — mirroring the engine's
 * relative evidence strengths at the 1–10 layer.
 */
export const LEGACY_RATING: Record<ExperienceGrade, number> = {
  loved: 10,
  liked: 8,
  okay: 6,
  disliked: 3,
  hated: 1,
  dnf: 2,
};

export function legacyRatingFor(answer: QuizAnswer): number | null {
  const g = gradeFor(answer);
  return g ? LEGACY_RATING[g] : null;
}

/**
 * Build the preference event. ALWAYS returns an event (unseen/unsure are still
 * persisted as zero-DNA "exposure" so we don't re-ask), but only a SEEN rating
 * carries an Experience grade → real taste evidence.
 *   - Haven't seen it → exposure only, no taste penalty.
 *   - Not sure / Skip → zero DNA.
 *   - Loved/Hated → strongest evidence; Okay → weak; DNF → negative + reason.
 */
export function quizAnswerToEvent(answer: QuizAnswer): PreferenceEvent {
  const grade = gradeFor(answer);
  return {
    id: answer.eventId,
    at: answer.at,
    titleId: answer.titleId,
    dims: answer.dims,
    genres: answer.genres,
    action: actionFor(answer),
    experienceGrade: grade ?? undefined,
    reasons: answer.reasons,
    dwellMs: answer.dwellMs,
    source: answer.source ?? 'quiz',
    familiarity: answer.recognition === 'seen' ? 1 : undefined,
  };
}
