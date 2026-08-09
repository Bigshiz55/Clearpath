/**
 * RAPID-FIRE ANSWER PARSING — "10, 7, 3" → [10, 7, 3].
 *
 * Stage 1–3 of the interview asks about THREE things at once and expects three
 * numbers back. People do not answer a grouped question the way a form expects:
 * they say "ten ten seven", or "love it, six, absolutely not", or echo the
 * labels back ("crime ten, drama seven, comedy three"). All of those are the
 * same answer and must parse identically.
 *
 * Two extraction strategies, tried in order:
 *
 *  1. LABEL-ANCHORED. If the user named the items, read each item's value from
 *     beside its own label. This is the only correct reading when they answer
 *     out of order ("comedy three, crime ten") — positional parsing would
 *     silently invert their taste, which is worse than not parsing at all.
 *  2. POSITIONAL. Otherwise take the values in the order they were spoken and
 *     align them to the order the items were asked.
 *
 * A count mismatch is REPORTED, never guessed at: the caller re-asks for the
 * smallest missing piece rather than inventing a number for an axis that will
 * go on to shape someone's recommendations.
 *
 * PURE. No I/O, no clock, no randomness.
 */

/** The 1–10 scale the whole interview speaks in. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 10;

export interface ParsedAnswer {
  /** One value per asked item, in the order the items were asked. */
  values: number[];
  /** True when we got exactly as many values as items asked. */
  complete: boolean;
  /** Indices of items we could not read a value for (drives the re-ask). */
  missing: number[];
  /** How the values were obtained — useful in tests and telemetry. */
  strategy: 'label' | 'positional' | 'none';
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  // Spoken forms people actually use for the ends of the scale.
  zero: 1, nil: 1, none: 1,
};

/**
 * Sentiment shorthand, because a grouped question invites a mixed answer:
 * "love it, six, absolutely not". Ordered most-specific first so "absolutely
 * not" is not read as the "absolutely" booster.
 */
const SENTIMENT_VALUES: { re: RegExp; value: number }[] = [
  { re: /\babsolutely not\b|\bno way\b|\bhard no\b|\bcan'?t stand\b|\bhate\b|\bnever\b/, value: 1 },
  { re: /\bnot really\b|\bnot for me\b|\bnot my thing\b|\bdon'?t like\b|\bdislike\b/, value: 3 },
  { re: /\bobsessed\b|\ball[- ]time favou?rite\b|\bfavou?rite\b|\blove it\b|\blove\b|\badore\b/, value: 9 },
  { re: /\byes\b|\byeah\b|\bsure\b|\bfor sure\b|\blike it\b|\blike\b|\benjoy\b|\bgood\b/, value: 7 },
  { re: /\bmeh\b|\bokay\b|\bok\b|\bfine\b|\ball right\b|\balright\b|\bso-so\b|\bindifferent\b/, value: 5 },
];

const clampScale = (n: number): number => Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(n)));

/** Lowercase, strip punctuation that separates answers, collapse whitespace. */
export function normalizeAnswer(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[,;/|]+/g, ' , ')
    .replace(/[^\w\s,'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Token {
  value: number;
  /** Character index in the normalized string, for label proximity. */
  at: number;
  /**
   * How the value was derived. A spoken NUMBER is an answer; a sentiment word
   * is only an interpretation of one, and in a sentence like "I quite like the
   * first one, maybe a seven" the word "like" is preamble rather than a score.
   * Numbers therefore win whenever there are enough of them.
   */
  kind: 'number' | 'sentiment';
}

/**
 * Every scale value mentioned, in order, with its position. Digits first so
 * "10" is one token rather than a "1" and a "0"; then number words; then
 * sentiment shorthand for the spans no number already covers.
 */
export function extractValues(norm: string): Token[] {
  const taken: boolean[] = new Array(norm.length).fill(false);
  const tokens: Token[] = [];

  const claim = (start: number, end: number): boolean => {
    for (let i = start; i < end; i++) if (taken[i]) return false;
    for (let i = start; i < end; i++) taken[i] = true;
    return true;
  };

  // 1) Digits. `10` before single digits, and never a digit inside a word.
  for (const m of norm.matchAll(/\b(10|[1-9])\b/g)) {
    const at = m.index ?? 0;
    if (claim(at, at + m[0].length)) tokens.push({ value: Number(m[0]), at, kind: 'number' });
  }

  // 2) Number words — but "one" is usually a PRONOUN, not a score.
  //
  // "I quite like the first one, maybe a seven" contains two number words and
  // only one of them is an answer. Reading "the first one" as a 1 silently
  // scored a genre the user was only pointing at, and the mistake is invisible
  // because the count still came out right.
  const PRONOUN_ONE_BEFORE = /\b(the|this|that|which|first|second|third|last|next|other|another|each|every|any|no)\s+$/;
  for (const m of norm.matchAll(/\b([a-z]+)\b/g)) {
    const word = m[1] ?? '';
    const at = m.index ?? 0;
    const value = NUMBER_WORDS[word];
    if (value === undefined) continue;
    if (word === 'one' && PRONOUN_ONE_BEFORE.test(norm.slice(0, at))) continue;
    if (claim(at, at + word.length)) tokens.push({ value, at, kind: 'number' });
  }

  // 3) Sentiment shorthand over whatever is left.
  for (const rule of SENTIMENT_VALUES) {
    for (const m of norm.matchAll(new RegExp(rule.re.source, 'g'))) {
      const at = m.index ?? 0;
      if (claim(at, at + m[0].length)) tokens.push({ value: rule.value, at, kind: 'sentiment' });
    }
  }

  return tokens.sort((a, b) => a.at - b.at).map((t) => ({ value: clampScale(t.value), at: t.at, kind: t.kind }));
}

/** Where each label appears in the answer, or -1. Longest alias wins. */
function labelPositions(norm: string, labels: string[][]): number[] {
  return labels.map((aliases) => {
    let best = -1;
    for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
      const idx = norm.indexOf(alias.toLowerCase());
      if (idx >= 0 && (best === -1 || idx < best)) best = idx;
    }
    return best;
  });
}

/**
 * Parse a grouped answer into one value per asked item.
 *
 * `labelAliases[i]` are the ways item `i` might be named; when at least two
 * items are named we trust the labels over the order, because an out-of-order
 * answer read positionally inverts the user's taste.
 */
export function parseGroupedAnswer(text: string, labelAliases: string[][]): ParsedAnswer {
  const count = labelAliases.length;
  const norm = normalizeAnswer(text);
  const none: ParsedAnswer = {
    values: [],
    complete: false,
    missing: Array.from({ length: count }, (_, i) => i),
    strategy: 'none',
  };
  if (!norm || count === 0) return none;

  const all = extractValues(norm);
  if (all.length === 0) return none;

  // NUMBERS BEAT SENTIMENT when there are enough of them. "I quite like the
  // first one, maybe a seven, ... so two, ... call it a nine" holds three real
  // scores and one stray "like" that belongs to the preamble; counting the
  // "like" pushed every answer one place left and mis-scored the whole group.
  // Sentiment shorthand stays available for genuinely mixed answers such as
  // "love it, six, absolutely not", where the numbers alone are not enough.
  const numeric = all.filter((t) => t.kind === 'number');
  const tokens = numeric.length >= count ? numeric : all;

  // ── Strategy 1: label-anchored ──────────────────────────────────────────
  const positions = labelPositions(norm, labelAliases);
  const named = positions.filter((p) => p >= 0).length;
  if (named >= 2) {
    const values: number[] = new Array(count).fill(NaN);
    for (let i = 0; i < count; i++) {
      const at = positions[i];
      if (at === undefined || at < 0) continue;
      // The nearest value AFTER the label ("crime ten"), else the nearest
      // before it ("ten for crime").
      const after = tokens.filter((t) => t.at > at).sort((a, b) => a.at - b.at)[0];
      const before = tokens.filter((t) => t.at < at).sort((a, b) => b.at - a.at)[0];
      const pick = after ?? before;
      if (pick) values[i] = pick.value;
    }
    const missing = values.flatMap((v, i) => (Number.isNaN(v) ? [i] : []));
    if (missing.length < count) {
      return {
        values: values.map((v) => (Number.isNaN(v) ? NaN : v)),
        complete: missing.length === 0,
        missing,
        strategy: 'label',
      };
    }
  }

  // ── Strategy 2: positional ──────────────────────────────────────────────
  const values = tokens.slice(0, count).map((t) => t.value);
  const missing = Array.from({ length: count }, (_, i) => i).filter((i) => i >= values.length);
  return {
    values,
    complete: values.length === count,
    missing,
    strategy: 'positional',
  };
}

/** A single 1–10 answer (used by the re-ask for one missing item). */
export function parseSingleValue(text: string): number | null {
  const tokens = extractValues(normalizeAnswer(text));
  return tokens.length > 0 ? (tokens[0]?.value ?? null) : null;
}
