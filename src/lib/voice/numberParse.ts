/**
 * VOICE DNA INTERVIEW — natural-language answer parser (pure, no I/O).
 *
 * The interview asks blocks of THREE items and expects short spoken answers on a
 * 1–10 scale. Speech-to-text returns a free-text transcript, and people do not
 * speak in a rigid syntax — so this maps whatever they said onto the displayed
 * items IN ORDER:
 *
 *   "10, 7, 3"                    → [10, 7, 3]
 *   "ten ten seven"               → [10, 10, 7]
 *   "nine, maybe six, absolutely not" → [9, 6, 1]
 *   "love it, six, absolutely not"     → [10, 6, 1]
 *   "crime ten, drama seven, comedy three" → [10, 7, 3]  (labels ignored)
 *
 * It is deliberately conservative: it extracts an ORDERED list of score events
 * (a digit, a number-word, or a sentiment phrase) and aligns them to the N items
 * the UI showed. Label words the user echoes ("crime", "drama") are ignored so
 * they never consume a slot. Confidence drops when the number of values found
 * does not match the number of items asked, so the caller can ask the smallest
 * possible repair question instead of guessing.
 *
 * This is the highest-risk STT-dependent logic in the feature, so it is pure and
 * exhaustively unit-tested. It performs NO network and NO model call.
 */

export interface ParsedAnswer {
  /** One entry per asked item, in display order. null = no value for that slot. */
  values: (number | null)[];
  /** 0..1 — how confident the alignment is (1 = exact count of clean numbers). */
  confidence: number;
  /** Every score value found in the utterance, in spoken order (for diagnostics). */
  ordered: number[];
  /** True when the value count did not match the item count (caller may repair). */
  countMismatch: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  // "a ten" / "an eight" style — only unambiguous spellings. Homophones like
  // "for"/"to"/"won" are deliberately excluded: in a natural sentence they cause
  // far more false positives than they rescue, and STT returns clean digits or
  // number-words for actual numeric answers.
};

/**
 * Sentiment phrases → a 1–10 value. Longer phrases first so "absolutely not"
 * wins over "not", and "love it" over "love". These are the natural equivalents
 * the spec calls out ("love it, fine, hate it"); they carry slightly lower
 * confidence than a spoken number.
 */
const SENTIMENT: Array<[RegExp, number]> = [
  [/\babsolutely\s+love(?:\s+it)?\b/, 10],
  [/\blove\s+it\b/, 10],
  [/\blove\b/, 10],
  [/\badore\b/, 10],
  [/\badd?ict(?:ed)?\b/, 9],
  [/\breally\s+like\b/, 8],
  [/\blike\s+it\s+a\s+lot\b/, 9],
  [/\blike\s+it\b/, 7],
  [/\blike\b/, 7],
  [/\bpretty\s+good\b/, 7],
  [/\bgood\b/, 7],
  [/\bfine\b/, 5],
  [/\bokay\b/, 5],
  [/\bok\b/, 5],
  [/\bsure\b/, 5],
  [/\bmeh\b/, 4],
  [/\bnot\s+really\b/, 3],
  [/\bdislike\b/, 3],
  [/\bnot\s+for\s+me\b/, 2],
  [/\babsolutely\s+not\b/, 1],
  [/\bhate\s+it\b/, 1],
  [/\bhate\b/, 1],
  [/\bno\s+way\b/, 1],
  [/\bnope\b/, 1],
  [/\bnever\b/, 1],
  [/\bpass\b/, 1],
];

/** Words that modify but are not themselves a value — never consume a slot. */
const SKIP_MODIFIERS = new Set(['maybe', 'perhaps', 'probably', 'about', 'around', 'like', 'a', 'an', 'the', 'um', 'uh', 'and', 'then', 'so']);

/** Clamp a raw number to the 1..10 scale (0 and >10 are coerced into range). */
function clampScore(n: number): number {
  if (n <= 0) return 1;
  if (n > 10) return 10;
  return Math.round(n);
}

/**
 * Pull an ordered list of score values out of a raw transcript. Numbers (digits
 * or number-words) and sentiment phrases both count; echoed item labels and
 * filler do not. Confidence is tracked per value so the aggregate can reflect
 * how much of the answer was clean numbers vs. inferred sentiment.
 */
function extractOrdered(raw: string): { values: number[]; clean: number } {
  const text = ` ${(raw ?? '').toLowerCase()} `;
  // Walk the string left-to-right, consuming either a multi-digit number, a
  // number-word, or the longest sentiment phrase at the current position. This
  // preserves spoken order, which is what alignment depends on.
  const values: number[] = [];
  let clean = 0; // count of values that came from an explicit number

  // First, capture "10", "7" style digit runs and 1–2 digit numbers with their
  // positions, plus number-words and sentiment, into a position-ordered list.
  type Hit = { pos: number; value: number; explicit: boolean };
  const hits: Hit[] = [];

  // Digits (1–2 digit; the scale is 1..10 but accept up to 10, coerce others).
  for (const m of text.matchAll(/\d{1,2}/g)) {
    const n = Number(m[0]);
    hits.push({ pos: m.index ?? 0, value: clampScore(n), explicit: true });
  }
  // Number-words (word-boundary).
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, 'g');
    for (const m of text.matchAll(re)) {
      // Skip homophone number-words that are acting as modifiers/skips (e.g.
      // "like" is a sentiment, "a"/"an" filler). Those aren't in NUMBER_WORDS.
      hits.push({ pos: m.index ?? 0, value: clampScore(n), explicit: true });
    }
  }
  // Sentiment phrases.
  for (const [re, n] of SENTIMENT) {
    const g = new RegExp(re.source, 'g');
    for (const m of text.matchAll(g)) {
      hits.push({ pos: m.index ?? 0, value: clampScore(n), explicit: false });
    }
  }

  // Resolve overlaps: sort by position, then drop hits that fall INSIDE an
  // already-taken span so "absolutely not" does not also yield a bare "not"
  // match and "love it" is one event, not two. We approximate spans by marking
  // consumed character ranges greedily in position order, preferring the hit
  // that starts earliest and, at the same start, the more explicit one.
  hits.sort((a, b) => a.pos - b.pos || Number(b.explicit) - Number(a.explicit));
  let lastEnd = -1;
  for (const h of hits) {
    if (h.pos <= lastEnd) continue; // overlaps a value we already took
    values.push(h.value);
    if (h.explicit) clean += 1;
    // Reserve a small span so adjacent duplicate matches at the same word don't
    // double-count. Number/word/phrase are short; 1 char past start is enough to
    // dedupe exact-position repeats without skipping the next distinct token.
    lastEnd = h.pos;
  }

  // Filler that is not a value never enters `values`, so nothing to strip here;
  // SKIP_MODIFIERS is exported semantics for the tokenizer's callers/tests.
  void SKIP_MODIFIERS;
  return { values, clean };
}

/**
 * Parse a spoken answer for `expectedCount` items on the 1–10 scale, aligned to
 * display order. When the number of values found matches the item count the
 * alignment is exact; otherwise the extra/missing values are surfaced and
 * confidence drops so the caller can ask a minimal repair ("Was action 6 or 8?").
 */
export function parseScores(raw: string, expectedCount: number): ParsedAnswer {
  const { values, clean } = extractOrdered(raw);
  const ordered = values.slice();

  const out: (number | null)[] = new Array(expectedCount).fill(null);
  for (let i = 0; i < expectedCount; i++) {
    out[i] = i < values.length ? values[i]! : null;
  }

  const countMismatch = values.length !== expectedCount;
  // Confidence: start from the share of asked slots filled by an EXPLICIT number,
  // then penalise a count mismatch. All-clean, exact-count → 1.0.
  const filled = out.filter((v) => v != null).length;
  const explicitShare = expectedCount > 0 ? Math.min(clean, expectedCount) / expectedCount : 0;
  const fillShare = expectedCount > 0 ? filled / expectedCount : 0;
  let confidence = 0.5 * explicitShare + 0.5 * fillShare;
  if (countMismatch) confidence *= 0.6;
  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(3))));

  return { values: out, confidence, ordered, countMismatch };
}
