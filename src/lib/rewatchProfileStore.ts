'use client';

/**
 * THE REWATCH PROFILE, CLIENT-SIDE.
 *
 * Deliberately localStorage for now, and this is a decision rather than a
 * shortcut. Persisting it server-side needs a migration, and 0026–0034 are
 * already written but unapplied to any live environment — adding 0035 to that
 * queue would mean the quiz silently does nothing in production until the whole
 * backlog lands. Local storage works today, on the device where the quiz was
 * taken, which is where the answer is useful.
 *
 * The follow-up is a `rewatch_quiz_answers` table plus a server action written
 * the way `saveTasteQuiz` is — best-effort, ignoring 42P01 so a deployment
 * without the migration degrades instead of erroring.
 *
 * Answers are stored, not the derived profile: the profile is rebuilt from them
 * on read, so a change to the bank's weights re-reads old answers correctly
 * instead of freezing yesterday's arithmetic.
 */
import {
  REWATCH_BANK_VERSION,
  answersToRewatchProfile,
  type RewatchAnswer,
} from '@/lib/reverdict/rewatchQuiz';
import { NEUTRAL_REWATCH_PROFILE, type RewatchProfile } from '@/lib/reverdict/rewatch';

const KEY = 'wv.rewatch-quiz.v1';

interface Stored {
  bankVersion: string;
  answers: RewatchAnswer[];
}

let answers: RewatchAnswer[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function read(): RewatchAnswer[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || !Array.isArray(parsed.answers)) return [];
    // A different bank version may have re-used an id for a different
    // statement, so old answers are dropped rather than reinterpreted.
    if (parsed.bankVersion !== REWATCH_BANK_VERSION) return [];
    return parsed.answers;
  } catch {
    return [];
  }
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  answers = read();
}

export function subscribeRewatchProfile(fn: () => void): () => void {
  hydrate();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRewatchAnswers(): RewatchAnswer[] {
  hydrate();
  return answers;
}

export function getRewatchProfile(): RewatchProfile {
  hydrate();
  return answersToRewatchProfile(answers);
}

/** Server snapshot for useSyncExternalStore — always the no-op profile. */
export function getRewatchProfileServerSnapshot(): RewatchProfile {
  return NEUTRAL_REWATCH_PROFILE;
}

export function saveRewatchAnswers(next: readonly RewatchAnswer[]) {
  hydrate();
  answers = [...next];
  try {
    const payload: Stored = { bankVersion: REWATCH_BANK_VERSION, answers };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode — it still applies for this page view */
  }
  for (const l of listeners) l();
}

export function clearRewatchAnswers() {
  hydrate();
  answers = [];
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}
