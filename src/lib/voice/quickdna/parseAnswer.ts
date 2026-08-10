/**
 * QUICK DNA — reading what the person actually said.
 *
 * Three answer shapes share one microphone, and which one is expected depends
 * on the question showing. So parsing is CONTEXTUAL: the same word means
 * different things in different turns ("no" is a 0 to "Crime?" and a dislike to
 * "Knives Out?"), and a parser that ignored that would have to guess.
 *
 *   SCALE   "nine", "probably a nine", "none", "love it"     → 0..10
 *   AB      "whodunit", "the first one", "b"                 → A or B
 *   TITLE   "yes", "loved it", "haven't seen it", "pass"     → yes / no / pass
 *
 * The 0–10 reading is the existing, well-tested `parseRating` — same tiers,
 * same refusals, same self-correction handling — so there is one implementation
 * of "what number did they say", not two that drift apart.
 *
 * Corrections are first-class here because people say "make that a seven" out
 * loud all the time. They are read as an answer to the CURRENT question, which
 * is what the speaker means, rather than as a command to go back.
 *
 * PURE. No I/O.
 */

import { combinedConfidence, normalize, parseRating, ACCEPT_THRESHOLD } from '@/lib/voice/calibration/parseRating';

export { ACCEPT_THRESHOLD };

export type TitleReaction = 'yes' | 'no' | 'pass';

export type QuickAnswer =
  | { kind: 'scale'; value: number; confidence: number; corrected: boolean }
  | { kind: 'ab'; option: 'a' | 'b'; confidence: number }
  | { kind: 'title'; reaction: TitleReaction; strong: boolean; confidence: number }
  | { kind: 'skip' }
  | { kind: 'back' }
  | { kind: 'none' };

const NONE: QuickAnswer = { kind: 'none' };

/** "make that a seven", "I meant eight" — a restatement, not a rewind. */
const CORRECTION_RE = /\b(make (that|it)|i meant|actually|sorry|change (that|it) to|no wait)\b/;

const SKIP_RE = /\b(skip|next|move on)\b/;
const BACK_RE = /\b(go back|back up|previous|last one|undo)\b/;

/** Enjoyed it. `strong` marks the richer statements worth keeping as evidence. */
const YES_RE = /\b(yes|yep|yeah|yup|sure|liked it|like it|good|great|enjoyed)\b/;
const YES_STRONG_RE = /\b(loved it|love it|love that|amazing|brilliant|favou?rite|obsessed|incredible|fantastic)\b/;
const NO_RE = /\b(no|nope|nah|didn'?t like|did not like|dislike|not for me|meh|boring|bad)\b/;
const NO_STRONG_RE = /\b(hated it|hate it|awful|terrible|dreadful|couldn'?t finish|turned it off)\b/;
const PASS_RE =
  /\b(pass|haven'?t seen|have not seen|never seen|never saw|not seen|don'?t know it|do not know it|no idea|can'?t remember|cannot remember|don'?t remember|unseen|skip)\b/;

/**
 * A reaction to a named title.
 *
 * PASS is checked FIRST and deliberately: "haven't seen it" contains "seen",
 * and several of the phrases people use to say they missed something also
 * contain a bare "no". Reading "never saw it" as a dislike would put a title
 * they have no opinion on into their permanent taste record.
 */
export function parseTitleAnswer(heard: string, recognizerConfidence?: number): QuickAnswer {
  const norm = normalize(heard);
  if (!norm) return NONE;
  if (BACK_RE.test(norm)) return { kind: 'back' };

  const base = (c: number) =>
    typeof recognizerConfidence === 'number' && recognizerConfidence > 0
      ? Math.min(c, 0.4 + 0.6 * recognizerConfidence)
      : c;

  if (PASS_RE.test(norm)) return { kind: 'title', reaction: 'pass', strong: false, confidence: base(1) };
  if (NO_STRONG_RE.test(norm)) return { kind: 'title', reaction: 'no', strong: true, confidence: base(1) };
  if (YES_STRONG_RE.test(norm)) return { kind: 'title', reaction: 'yes', strong: true, confidence: base(1) };
  // "didn't like it" contains "like", so the negative must be tested first.
  if (NO_RE.test(norm)) return { kind: 'title', reaction: 'no', strong: false, confidence: base(0.95) };
  if (YES_RE.test(norm)) return { kind: 'title', reaction: 'yes', strong: false, confidence: base(0.95) };

  // A number given to a title is still an opinion — "eight" means they liked it.
  const rated = parseRating(heard);
  if (rated.intent === 'rating' && rated.value !== null) {
    if (rated.value >= 7) return { kind: 'title', reaction: 'yes', strong: rated.value >= 9, confidence: base(0.8) };
    if (rated.value <= 3) return { kind: 'title', reaction: 'no', strong: rated.value <= 1, confidence: base(0.8) };
    return { kind: 'title', reaction: 'pass', strong: false, confidence: base(0.6) };
  }
  return NONE;
}

/** An answer to an either/or. */
export function parseAbAnswer(
  heard: string,
  spokenA: readonly string[],
  spokenB: readonly string[],
  recognizerConfidence?: number,
): QuickAnswer {
  const norm = normalize(heard);
  if (!norm) return NONE;
  if (BACK_RE.test(norm)) return { kind: 'back' };
  if (SKIP_RE.test(norm)) return { kind: 'skip' };

  const words = new Set(norm.split(' '));
  const hitsA = spokenA.some((w) => words.has(w) || norm.includes(w));
  const hitsB = spokenB.some((w) => words.has(w) || norm.includes(w));
  // Both or neither is not an answer — ask again rather than pick a side.
  if (hitsA === hitsB) return NONE;

  const confidence =
    typeof recognizerConfidence === 'number' && recognizerConfidence > 0
      ? Math.min(1, 0.4 + 0.6 * recognizerConfidence)
      : 1;
  return { kind: 'ab', option: hitsA ? 'a' : 'b', confidence };
}

/** An answer to a 0–10 probe. */
export function parseScaleAnswer(heard: string, recognizerConfidence?: number): QuickAnswer {
  const norm = normalize(heard);
  if (!norm) return NONE;
  if (BACK_RE.test(norm)) return { kind: 'back' };

  const rated = parseRating(heard);
  if (rated.intent === 'back') return { kind: 'back' };
  if (rated.intent === 'skip') return { kind: 'skip' };
  if (rated.intent === 'rating' && rated.value !== null) {
    return {
      kind: 'scale',
      value: rated.value,
      confidence: combinedConfidence(rated, recognizerConfidence),
      corrected: CORRECTION_RE.test(norm),
    };
  }
  return NONE;
}

/** True when the answer is confident enough to record rather than re-ask. */
export function isAcceptable(answer: QuickAnswer): boolean {
  switch (answer.kind) {
    case 'scale':
    case 'ab':
    case 'title':
      return answer.confidence >= ACCEPT_THRESHOLD;
    case 'skip':
    case 'back':
      return true;
    default:
      return false;
  }
}
