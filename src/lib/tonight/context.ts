/**
 * THE TONIGHT MACHINE — tonight is not who you are.
 *
 * This module exists because of the single most damaging mistake a taste
 * system can make: writing a MOOD into a PERSONALITY. Someone who wants
 * something light on a Tuesday has not stopped liking bleak three-hour
 * dramas, and a recommender that concludes otherwise gets quietly worse every
 * time it is used. The old calibration had no concept of tonight at all, so
 * every answer became permanent by default.
 *
 * So the state is deliberately split in two, and the split is enforced by the
 * type system rather than by discipline:
 *
 *   TraitProfile   — permanent Taste DNA. Survives the session. Only ever
 *                    updated by evidence about the PERSON.
 *   SessionContext — tonight. Discarded when the session ends. Holds mood,
 *                    who is watching, how much attention and time there is.
 *
 * `applyContextAnswer` cannot touch a profile: it does not take one and does
 * not return one. `contextEvidence.permanent` is the only route from a
 * context answer to permanent DNA, it is empty for every mood answer, and
 * `tonight.test.ts` asserts that a full session of context answers leaves the
 * profile byte-identical.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { TraitKey } from '@/lib/voice/quickdna/traits';

/** How much of themselves the viewer is bringing tonight. */
export type Attention = 'full' | 'background';
export type Company = 'alone' | 'together';
/** Roughly how long they will sit still for. */
export type Commitment = 'short' | 'open';

/**
 * The night's shape. Every field is optional because the machine asks for a
 * field ONLY when knowing it would change the recommendation — a context
 * question that cannot change the outcome is a survey question.
 */
export interface SessionContext {
  /** Which of the opening intents they picked, e.g. 'hook' | 'mystery' | 'laugh'. */
  intent?: string;
  company?: Company;
  attention?: Attention;
  commitment?: Commitment;
  /**
   * Temporary trait leanings for tonight only — "lighter than usual", "shorter
   * than usual". Applied when ranking tonight's finalists and then thrown away.
   * NEVER merged into the permanent profile.
   */
  lean: Partial<Record<TraitKey, number>>;
}

export const EMPTY_CONTEXT: SessionContext = { lean: {} };

/**
 * An opening intent, generated per-player rather than hard-coded.
 *
 * `lean` is the temporary tilt it implies. `resolves` names the permanent axes
 * this intent would help settle if the player commits to it later — used by
 * the planner to prefer intents that are diagnostic for THIS person, so the
 * six options are not the same six for everyone.
 */
export interface Intent {
  id: string;
  label: string;
  lean: Partial<Record<TraitKey, number>>;
  resolves: TraitKey[];
}

/**
 * The intent bank. Written as decisions about the evening, never as genres —
 * "make me laugh" is something a person actually thinks; "comedy: 7/10" is a
 * form field.
 */
export const INTENTS: readonly Intent[] = [
  { id: 'hook', label: 'Hook me immediately', lean: { patience: -0.8, action: 0.4 }, resolves: ['patience', 'action'] },
  { id: 'mystery', label: 'Give me a mystery', lean: { investigation: 0.8, complexity: 0.3 }, resolves: ['investigation', 'complexity'] },
  { id: 'laugh', label: 'Make me laugh', lean: { comedy: 0.9, darkness: -0.4 }, resolves: ['comedy'] },
  { id: 'disappear', label: 'Let me disappear', lean: { fantasy: 0.6, scifi: 0.5, patience: 0.4 }, resolves: ['fantasy', 'scifi'] },
  { id: 'unsettle', label: 'Unsettle me', lean: { darkness: 0.8, horrorTolerance: 0.6 }, resolves: ['darkness', 'horrorTolerance'] },
  { id: 'true', label: 'Something that really happened', lean: { documentary: 0.8, grounded: 0.7 }, resolves: ['documentary', 'trueCrime'] },
  { id: 'surprise', label: 'Surprise me', lean: {}, resolves: [] },
  { id: 'decide', label: 'You figure it out', lean: {}, resolves: [] },
];

/**
 * A context question, and — critically — what it may and may not write.
 *
 * `permanent` is always empty for mood. It exists as a field rather than being
 * omitted so that the contract is visible at every call site: a reader can see
 * that this answer was considered for permanent evidence and deliberately
 * given none.
 */
export interface ContextAnswer {
  field: 'intent' | 'company' | 'attention' | 'commitment';
  value: string;
}

export interface ContextEvidence {
  context: SessionContext;
  /** Always empty. Tonight never writes permanent Taste DNA. */
  permanent: Array<{ key: TraitKey; target: number; weight: number }>;
}

export function applyContextAnswer(
  context: SessionContext,
  answer: ContextAnswer,
): ContextEvidence {
  const next: SessionContext = { ...context, lean: { ...context.lean } };

  switch (answer.field) {
    case 'intent': {
      const intent = INTENTS.find((i) => i.id === answer.value);
      next.intent = answer.value;
      if (intent) for (const [k, v] of Object.entries(intent.lean)) next.lean[k as TraitKey] = v;
      break;
    }
    case 'company':
      next.company = answer.value as Company;
      // Watching with someone else pulls tonight toward the middle: shared
      // viewing is a constraint on the EVENING, never a change of taste.
      if (answer.value === 'together') next.lean.darkness = Math.min(next.lean.darkness ?? 0, -0.3);
      break;
    case 'attention':
      next.attention = answer.value as Attention;
      if (answer.value === 'background') {
        next.lean.complexity = -0.6;
        next.lean.subtitles = -0.9; // Cannot read subtitles you are not looking at.
      }
      break;
    case 'commitment':
      next.commitment = answer.value as Commitment;
      if (answer.value === 'short') next.lean.patience = -0.7;
      break;
  }

  return { context: next, permanent: [] };
}

/**
 * Tonight's ranking tilt for one axis: what the permanent profile believes,
 * bent by tonight's mood, WITHOUT either one being written into the other.
 *
 * Returns a 0..100 preference in the same units the profile uses, so callers
 * can rank with it directly.
 */
export function tonightPreference(basePref: number, context: SessionContext, key: TraitKey): number {
  const lean = context.lean[key];
  if (lean === undefined) return basePref;
  // A full lean moves the working preference most of the way, but never all of
  // it — someone who wants "something lighter" has not become a different
  // person for the evening.
  return Math.max(0, Math.min(100, basePref + lean * 45));
}
