/**
 * "probably a seven" → 7.
 *
 * The whole experience rests on this: if a spoken number does not resolve in
 * one pass, the user gets asked again and the run stops feeling fast. So this
 * reads the ways people actually answer a 0–10 question out loud — bare digits,
 * number words, hedged numbers, and the handful of phrases that stand in for a
 * number ("none", "love it") — and refuses anything it cannot pin down rather
 * than guessing.
 *
 * TIERED, most-reliable first. A lower tier is only consulted when no higher
 * tier fired, which is what keeps the common failure modes out:
 *
 *   1. DIGITS        "8", "10"          — unambiguous
 *   2. NUMBER WORDS  "eight", "ten"     — unambiguous
 *   3. PHRASES       "none", "love it"  — an opinion standing in for a number
 *   4. HOMOPHONES    "ate", "won", "to" — only when nothing above fired, because
 *                    "I'd go for eight" contains both `for`(4) and `eight`(8)
 *                    and the digit-word must win
 *
 * Two DIFFERENT values inside one tier is an honest "I did not understand" —
 * "seven or eight" must re-ask, never silently pick one. Repeats of the SAME
 * value are fine, so "ten out of ten" is a ten.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { RATING_MAX, RATING_MIN } from './items';

export type RatingIntent = 'rating' | 'skip' | 'back' | 'none';

export interface ParsedRating {
  intent: RatingIntent;
  /** 0..10 when `intent` is 'rating', else null. */
  value: number | null;
  /** Which tier produced the value — useful in tests and telemetry. */
  via: 'digit' | 'word' | 'phrase' | 'homophone' | null;
  /**
   * 0..1 confidence in the READING (not in the microphone). A bare number is
   * certain; a phrase is an interpretation; two candidates is a refusal.
   */
  confidence: number;
}

const NONE: ParsedRating = { intent: 'none', value: null, via: null, confidence: 0 };

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Spoken stand-ins for the ends of the scale. */
const NUMBER_SYNONYMS: Record<string, number> = {
  nought: 0, naught: 0, nil: 0, nada: 0, zilch: 0, zip: 0,
};

/**
 * An opinion where a number was asked for. Ordered most-specific first so
 * "not really" is not read as the "really" intensifier, and "no way" is not
 * read as a bare "no".
 */
const PHRASES: { re: RegExp; value: number }[] = [
  { re: /\b(never show me|no way|hard no|can'?t stand|hate it|hate|awful|terrible)\b/, value: 0 },
  { re: /\b(none|nope|nah|not at all|absolutely not)\b/, value: 0 },
  { re: /\b(not really|not for me|not my thing|don'?t like|dislike|rarely)\b/, value: 3 },
  { re: /\b(obsessed|all[- ]time favou?rite|favou?rite|love it|love them|love|adore)\b/, value: 10 },
  { re: /\b(yes|yeah|yep|sure|like it|enjoy|good|great)\b/, value: 7 },
  { re: /\b(meh|okay|ok|fine|alright|all right|so[- ]so|indifferent|sometimes|depends)\b/, value: 5 },
];

/**
 * Recognisers mishear small numbers constantly. These are the substitutions
 * worth making — but ONLY when the utterance holds no real number, because
 * every one of them is also an ordinary English word.
 */
const HOMOPHONES: Record<string, number> = {
  oh: 0, o: 0,
  won: 1,
  to: 2, too: 2, tu: 2,
  tree: 3, free: 3, thee: 3,
  for: 4, fore: 4, faux: 4,
  fife: 5,
  ate: 8, late: 8,
  niner: 9,
};

/**
 * Homophones are only consulted for a SHORT utterance. Every one of them is an
 * ordinary English word, so "I'd go for it" would otherwise score a 4 — but a
 * person answering this question with a mishearable word says just the word.
 */
const HOMOPHONE_MAX_WORDS = 3;

const SKIP_RE = /\b(skip|pass|next|dunno|don'?t know|no idea|not sure|unsure|whatever)\b/;
const BACK_RE = /\b(go back|back up|previous|undo|last one)\b/;

/** Lowercase, strip punctuation, collapse whitespace. Keeps digits and hyphens. */
export function normalize(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every distinct value a tier found, in the order they were spoken. */
function collect(norm: string, lookup: (word: string) => number | undefined): number[] {
  const found: number[] = [];
  for (const m of norm.matchAll(/\b[\w'-]+\b/g)) {
    const v = lookup(m[0] ?? '');
    if (v !== undefined) found.push(v);
  }
  return found;
}

/**
 * A person correcting themselves mid-sentence — "two or three, no, three" — is
 * not being ambiguous, they are being clear in the way people actually are. A
 * marker like this means the LAST number is the answer.
 */
const CORRECTION_RE = /\b(no|nope|actually|sorry|i mean|make that|scratch that|wait)\b/;

/**
 * One value, or null when a tier is silent or self-contradictory.
 *
 * `corrected` reports that the value came from a self-correction rather than a
 * clean single reading, so the caller can hold it to a slightly lower
 * confidence — the marker is a good heuristic, not a certainty.
 */
function resolve(found: number[], norm: string): { value: number | null; corrected: boolean } {
  if (found.length === 0) return { value: null, corrected: false };
  const distinct = new Set(found);
  if (distinct.size === 1) return { value: found[0] ?? null, corrected: false };
  if (CORRECTION_RE.test(norm)) {
    return { value: found[found.length - 1] ?? null, corrected: true };
  }
  return { value: null, corrected: false };
}

function inScale(n: number): boolean {
  return Number.isInteger(n) && n >= RATING_MIN && n <= RATING_MAX;
}

/**
 * Read one utterance as an answer to "0 to 10?".
 *
 * `heard` is the raw transcript. Nothing here looks at the microphone's own
 * confidence — that is the caller's to combine, because a perfectly-heard
 * "seven or eight" is still not an answer.
 */
export function parseRating(heard: string): ParsedRating {
  const norm = normalize(heard);
  if (!norm) return NONE;

  // Navigation beats numbers: "go back" must not be mined for a digit.
  if (BACK_RE.test(norm)) return { intent: 'back', value: null, via: null, confidence: 1 };

  // ── 1. Digits ────────────────────────────────────────────────────────────
  const digits: number[] = [];
  for (const m of norm.matchAll(/\b\d{1,2}\b/g)) {
    const n = Number(m[0]);
    if (inScale(n)) digits.push(n);
  }
  if (digits.length > 0) {
    const { value, corrected } = resolve(digits, norm);
    return value === null
      ? NONE
      : { intent: 'rating', value, via: 'digit', confidence: corrected ? 0.85 : 1 };
  }

  // ── 2. Number words ──────────────────────────────────────────────────────
  const words = collect(norm, (w) => NUMBER_WORDS[w] ?? NUMBER_SYNONYMS[w]);
  if (words.length > 0) {
    const { value, corrected } = resolve(words, norm);
    return value === null
      ? NONE
      : { intent: 'rating', value, via: 'word', confidence: corrected ? 0.85 : 1 };
  }

  // Only now can a bare "skip" be honoured — "skip it, seven" is a seven.
  if (SKIP_RE.test(norm)) return { intent: 'skip', value: null, via: null, confidence: 1 };

  // ── 3. Opinions standing in for a number ─────────────────────────────────
  const phrase: number[] = [];
  for (const rule of PHRASES) {
    if (rule.re.test(norm)) phrase.push(rule.value);
  }
  if (phrase.length > 0) {
    const { value } = resolve(phrase, '');
    if (value !== null) return { intent: 'rating', value, via: 'phrase', confidence: 0.75 };
    // Genuinely mixed ("love it but not really") — ask rather than average.
    return NONE;
  }

  // ── 4. Homophones, last, and only in the absence of a real number ────────
  const near = norm.split(' ').length <= HOMOPHONE_MAX_WORDS ? collect(norm, (w) => HOMOPHONES[w]) : [];
  if (near.length > 0) {
    const { value } = resolve(near, norm);
    if (value !== null) return { intent: 'rating', value, via: 'homophone', confidence: 0.6 };
  }

  return NONE;
}

/**
 * Combine the reading's confidence with the recogniser's own, when the browser
 * offers one. Browsers that report 0 (Safari always does) must not drag a
 * perfectly clear "8" below the re-ask threshold, so a missing or zero value is
 * treated as "no opinion" rather than as no confidence.
 */
export function combinedConfidence(parsed: ParsedRating, recognizerConfidence?: number): number {
  if (parsed.intent !== 'rating') return parsed.confidence;
  const r = typeof recognizerConfidence === 'number' && recognizerConfidence > 0 ? recognizerConfidence : null;
  return r === null ? parsed.confidence : Math.min(parsed.confidence, 0.4 + 0.6 * r);
}

/** Below this we say "Sorry — number?" instead of recording a guess. */
export const ACCEPT_THRESHOLD = 0.5;
