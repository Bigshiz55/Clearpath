/**
 * Quiz answer → preference event mapping. The single, shared translation from a
 * Watch DNA card answer into the real engine's event. Pure, so the server action
 * and the tests use identical logic and can't drift. There is NO parallel scoring
 * here — this only shapes the event that `deriveDna` consumes.
 *
 * Four primary intents map to the engine's THREE channels, so pre-watch pull is
 * never confused with post-watch enjoyment:
 *   • Looks good     → ATTRACTION positive (interested) — a taste signal only.
 *   • Watchlist      → ATTRACTION strong-positive (must_watch) + a real save.
 *   • Not interested → ATTRACTION negative (not_interested) — DISTINCT from a
 *                      watched-and-disliked EXPERIENCE signal.
 *   • Seen it → rating → EXPERIENCE grade (loved/liked/okay/disliked).
 */
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import type {
  AttractionGrade,
  ExperienceGrade,
  PreferenceEvent,
  PrimaryAction,
  ReasonCode,
} from './types';

/** The four primary card actions. */
export type QuizIntent = 'looks_good' | 'watchlist' | 'not_interested' | 'seen';

/** The four post-watch ratings surfaced after "Seen it". */
export type QuizRating = 'loved' | 'liked' | 'okay' | 'disliked';

export interface QuizAnswer {
  /** Client-generated stable id → dedup + Undo target. */
  eventId: string;
  /** "movie:603" / "tv:1396". */
  titleId: string;
  /** Epoch ms the answer was made. */
  at: number;
  intent: QuizIntent;
  /** Present only when intent === 'seen'. */
  rating?: QuizRating;
  /** Optional high-value follow-up reasons. */
  reasons?: ReasonCode[];
  /** Title fingerprint (server-enriched from cache when available). */
  dims?: TitleDimensions;
  genres?: string[];
  /** ms the card was shown before answering (quality signal). */
  dwellMs?: number;
  source?: string;
}

interface EventFields {
  action: PrimaryAction;
  experienceGrade?: ExperienceGrade;
  attractionGrade?: AttractionGrade;
}

/** The primary signal fields for an intent. `primarySignal` reads grade-first. */
function eventFieldsFor(answer: QuizAnswer): EventFields {
  switch (answer.intent) {
    case 'looks_good':
      return { action: 'unseen_interested', attractionGrade: 'interested' };
    case 'watchlist':
      // Actively saving is a stronger pull than a passing "looks good".
      return { action: 'unseen_interested', attractionGrade: 'must_watch' };
    case 'not_interested':
      return { action: 'unseen_not_interested', attractionGrade: 'not_interested' };
    case 'seen': {
      const g = answer.rating;
      if (!g) return { action: 'skip' };
      return { action: g === 'disliked' ? 'seen_disliked' : 'seen_liked', experienceGrade: g };
    }
  }
}

/** The Experience grade for a SEEN answer (null for pre-watch intents). */
export function gradeFor(answer: QuizAnswer): ExperienceGrade | null {
  return answer.intent === 'seen' ? answer.rating ?? null : null;
}

/**
 * Legacy 1–10 rating for the watchlist mirror (keeps the existing recommendation
 * seed working). Only for SEEN titles. Null for pre-watch intents (no watched row).
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

/** True when the answer should also be saved to the user's watchlist. */
export function savesToWatchlist(answer: QuizAnswer): boolean {
  return answer.intent === 'watchlist';
}

/**
 * Build the preference event. ALWAYS returns an event, but the channel it feeds
 * depends on the intent: pre-watch intents carry an ATTRACTION grade, "Seen it"
 * carries an EXPERIENCE grade. `deriveDna` routes each to the correct channel.
 */
export function quizAnswerToEvent(answer: QuizAnswer): PreferenceEvent {
  const f = eventFieldsFor(answer);
  return {
    id: answer.eventId,
    at: answer.at,
    titleId: answer.titleId,
    dims: answer.dims,
    genres: answer.genres,
    action: f.action,
    experienceGrade: f.experienceGrade,
    attractionGrade: f.attractionGrade,
    reasons: answer.reasons,
    dwellMs: answer.dwellMs,
    source: answer.source ?? 'quiz',
    familiarity: answer.intent === 'seen' ? 1 : undefined,
  };
}
