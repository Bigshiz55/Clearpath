/**
 * WITNESS TESTIMONY — the interview skeleton.
 *
 * Ten questions. Not "about ten": the counter the user sees is real, and a
 * follow-up never increments it, because "Question 14 of 20" is how an
 * interview turns into a form.
 *
 * Each STEP owns one main question and whatever follow-ups that answer earns.
 * A follow-up about the same topic stays inside its step:
 *
 *   Step 2  "What did you love most about Sherlock?"
 *     ↳     "So it was the puzzle-solving more than the setting?"   ← still 2
 *
 * The engine is still adaptive — a step whose ground is already covered is
 * skipped, and the interview can finish early when it has enough — but the
 * shape is fixed, so the user always knows how much is left.
 *
 * Pure: the next question is a function of the answers so far. No cursor.
 */

export type StepId =
  | 'favourites'
  | 'favourite_why'
  | 'disappointment'
  | 'quit'
  | 'story_types'
  | 'dealbreakers'
  | 'format'
  | 'exception'
  | 'movie_check'
  | 'final_word';

export const MAIN_MAX = 10;

export interface StepMeta {
  id: StepId;
  /** 1..10, and what the counter shows. */
  index: number;
  /** Short section name for the progress line. */
  label: string;
}

export const STEPS: readonly StepMeta[] = [
  { id: 'favourites', index: 1, label: 'What you love' },
  { id: 'favourite_why', index: 2, label: 'What you love' },
  { id: 'disappointment', index: 3, label: 'What let you down' },
  { id: 'quit', index: 4, label: 'What makes you stop' },
  { id: 'story_types', index: 5, label: 'The stories you pick' },
  { id: 'dealbreakers', index: 6, label: 'Your deal-breakers' },
  { id: 'format', index: 7, label: 'How you watch' },
  { id: 'exception', index: 8, label: 'Your exceptions' },
  { id: 'movie_check', index: 9, label: 'Testing what I heard' },
  { id: 'final_word', index: 10, label: 'The last word' },
];

export const STEP_BY_ID = new Map(STEPS.map((s) => [s.id, s]));

/**
 * Short conversational bridges. An interviewer acknowledges what you said
 * before moving on; a form does not. Chosen by step so the same line never
 * lands twice in a row, and deliberately shorter than the question itself.
 */
export const TRANSITIONS: Partial<Record<StepId, string>> = {
  favourite_why: 'That helps.',
  disappointment: 'Good — now the other direction.',
  quit: 'Let me dig into that.',
  story_types: 'I think I see the pattern.',
  dealbreakers: 'One more thing about that.',
  format: 'Nearly there.',
  exception: 'Interesting.',
  movie_check: 'Let me test that.',
  final_word: 'Last one.',
};
