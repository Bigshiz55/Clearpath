// The Reader Interview — a fast, progressive onboarding that turns explicit
// answers into Reader DNA observations. This is honest structured profiling:
// every answer maps to interpretable dimension evidence. (Free-text answers can
// later be parsed by an LLM when OPENAI_API_KEY is configured; that is an
// enhancement, not a dependency — the interview works fully without it.)

import type { Observation } from '@/lib/domain/readerDna';
import { DNF_REASONS, type DnfReason } from '@/lib/domain/userBook';

export interface InterviewOption {
  value: string;
  label: string;
  /** Dimension evidence this option contributes. */
  observations: { key: string; observed: number; weight: number }[];
}

export interface InterviewQuestion {
  id: string;
  prompt: string;
  options: InterviewOption[];
}

/** The core interview. Kept short; the UI can reveal later questions over time. */
export const INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: 'pacing',
    prompt: 'How do you like a book to move?',
    options: [
      { value: 'fast', label: 'Fast — hook me early', observations: [{ key: 'pacing', observed: 0.9, weight: 0.7 }, { key: 'slow_burn_tolerance', observed: 0.2, weight: 0.6 }] },
      { value: 'balanced', label: 'Balanced', observations: [{ key: 'pacing', observed: 0.5, weight: 0.5 }] },
      { value: 'slow', label: 'Slow burn is fine', observations: [{ key: 'pacing', observed: 0.2, weight: 0.7 }, { key: 'slow_burn_tolerance', observed: 0.9, weight: 0.7 }] },
    ],
  },
  {
    id: 'emotional_intensity',
    prompt: 'How intense do you want it to feel?',
    options: [
      { value: 'light', label: 'Light and fun', observations: [{ key: 'emotional_intensity', observed: 0.2, weight: 0.6 }, { key: 'humor', observed: 0.7, weight: 0.5 }] },
      { value: 'moderate', label: 'Somewhere in between', observations: [{ key: 'emotional_intensity', observed: 0.5, weight: 0.5 }] },
      { value: 'intense', label: 'Gut-punch me', observations: [{ key: 'emotional_intensity', observed: 0.9, weight: 0.6 }] },
    ],
  },
  {
    id: 'darkness',
    prompt: 'How dark can it get?',
    options: [
      { value: 'cozy', label: 'Keep it light', observations: [{ key: 'darkness', observed: 0.2, weight: 0.6 }] },
      { value: 'some', label: 'Some darkness is fine', observations: [{ key: 'darkness', observed: 0.55, weight: 0.5 }] },
      { value: 'dark', label: 'The darker the better', observations: [{ key: 'darkness', observed: 0.9, weight: 0.6 }] },
    ],
  },
  {
    id: 'complexity',
    prompt: 'How much do you want to work for it?',
    options: [
      { value: 'easy', label: 'Easy to follow', observations: [{ key: 'complexity', observed: 0.2, weight: 0.6 }, { key: 'prose_density', observed: 0.3, weight: 0.5 }] },
      { value: 'meaty', label: 'Give me something meaty', observations: [{ key: 'complexity', observed: 0.85, weight: 0.6 }, { key: 'literary_vs_commercial', observed: 0.7, weight: 0.4 }] },
    ],
  },
  {
    id: 'series',
    prompt: 'Series or standalone?',
    options: [
      { value: 'standalone', label: 'One and done', observations: [{ key: 'series_commitment', observed: 0.15, weight: 0.7 }] },
      { value: 'either', label: 'Either is fine', observations: [{ key: 'series_commitment', observed: 0.5, weight: 0.4 }] },
      { value: 'series', label: 'I love a long series', observations: [{ key: 'series_commitment', observed: 0.9, weight: 0.7 }] },
    ],
  },
  {
    id: 'format',
    prompt: 'How do you usually read?',
    options: [
      { value: 'print', label: 'Print / e-book', observations: [{ key: 'audiobook_affinity', observed: 0.2, weight: 0.6 }] },
      { value: 'mix', label: 'A mix', observations: [{ key: 'audiobook_affinity', observed: 0.5, weight: 0.4 }] },
      { value: 'audio', label: 'Mostly audiobooks', observations: [{ key: 'audiobook_affinity', observed: 0.9, weight: 0.7 }] },
    ],
  },
  {
    id: 'romance',
    prompt: 'Romance in your reading?',
    options: [
      { value: 'none', label: 'Prefer none', observations: [{ key: 'romance', observed: 0.1, weight: 0.6 }] },
      { value: 'subplot', label: 'A subplot is nice', observations: [{ key: 'romance', observed: 0.5, weight: 0.5 }] },
      { value: 'central', label: 'Bring the romance', observations: [{ key: 'romance', observed: 0.9, weight: 0.6 }] },
    ],
  },
] as const;

export interface InterviewBookAnswer {
  sentiment: 'loved' | 'disliked' | 'abandoned';
  /** For abandoned books, the DNF reasons (drive strong signals). */
  reasons?: DnfReason[];
}

export interface InterviewAnswers {
  /** questionId -> chosen option value. */
  choices: Record<string, string>;
  books?: InterviewBookAnswer[];
}

/** Map a DNF reason to Reader DNA observations. */
function dnfReasonObservations(reason: DnfReason): { key: string; observed: number; weight: number }[] {
  switch (reason) {
    case 'too_slow':
      return [{ key: 'pacing', observed: 0.85, weight: 0.6 }, { key: 'slow_burn_tolerance', observed: 0.15, weight: 0.6 }];
    case 'too_dark':
      return [{ key: 'darkness', observed: 0.2, weight: 0.55 }];
    case 'too_long':
      return [{ key: 'book_length', observed: 0.2, weight: 0.55 }];
    case 'prose':
      return [{ key: 'prose_density', observed: 0.3, weight: 0.5 }];
    case 'confusing':
      return [{ key: 'complexity', observed: 0.3, weight: 0.5 }];
    case 'characters':
      return [{ key: 'character_likability', observed: 0.85, weight: 0.5 }];
    case 'too_graphic':
      return [{ key: 'violence', observed: 0.2, weight: 0.55 }, { key: 'gore', observed: 0.2, weight: 0.5 }];
    default:
      return [];
  }
}

const QUESTION_MAP: Record<string, InterviewQuestion> = Object.fromEntries(
  INTERVIEW_QUESTIONS.map((q) => [q.id, q]),
);

/** Convert interview answers into Reader DNA observations. Pure. */
export function interviewToObservations(answers: InterviewAnswers, now: string): Observation[] {
  const out: Observation[] = [];
  for (const [qid, value] of Object.entries(answers.choices)) {
    const q = QUESTION_MAP[qid];
    const opt = q?.options.find((o) => o.value === value);
    if (!opt) continue;
    for (const o of opt.observations) out.push({ ...o, at: now });
  }
  for (const book of answers.books ?? []) {
    if (book.sentiment === 'abandoned') {
      for (const reason of book.reasons ?? []) {
        for (const o of dnfReasonObservations(reason)) out.push({ ...o, at: now });
      }
    }
  }
  return out;
}

/** Human labels for DNF reasons, re-exported for the interview UI. */
export { DNF_REASONS };
