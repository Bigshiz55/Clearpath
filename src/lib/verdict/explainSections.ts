/**
 * "WHY THIS VERD1CT?" — ORGANISED SO A PERSON CAN SCAN IT.
 *
 * The explanation already carried the right facts and showed them as three
 * undifferentiated runs of text, each line ending in its own arithmetic:
 * "Sci-Fi: a strong personal match (+6)." The maths is real and stays — but a
 * reason is what you read to decide, and a coefficient is what you read to
 * audit. Printing them at the same weight made the audit trail louder than the
 * reason.
 *
 * So each line is split: the sentence stays, the number moves behind "See
 * scoring details". Nothing is dropped and nothing is rounded — the same
 * string, in two parts.
 *
 * The section headings changed for one honest reason too. "What held it back"
 * is a claim that something DID hold it back, and the engine's own no-negatives
 * line ("No major red flags…") was landing underneath it — a heading arguing
 * with its only item. When every item is a caveat about OUR data rather than
 * about the title, the heading says so.
 *
 * Pure. No I/O, no clock, no model.
 */

/** One explanation line: what it says, and the arithmetic behind it. */
export interface Reason {
  /** The sentence, with any trailing numeric parenthetical removed. */
  text: string;
  /** What was in that parenthetical ("+6", "88 match", "78/100 across sources"). */
  math: string | null;
}

/** How many supporting reasons lead. The rest go under the details toggle. */
export const TOP_REASONS = 4;

export const SECTION = {
  matched: 'Why it matched',
  requirements: 'Your requirements',
  /** When at least one item is about the TITLE. */
  know: 'Things to know',
  /** When every item is about the limits of our own evidence. */
  uncertain: 'Remaining uncertainty',
} as const;

export type KnowHeading = typeof SECTION.know | typeof SECTION.uncertain;

/**
 * Pull a trailing numeric parenthetical off a reason.
 *
 * Only NUMERIC ones: "(+6)", "(88 match)", "(78/100 across sources)". A
 * parenthetical that starts with a word is part of the sentence — "(matched:
 * heist, caper)" is evidence a person reads, not arithmetic — and stays put.
 */
export function splitMath(reason: string): Reason {
  const m = /^(.*?)\s*\(([+\-]?\d[^)]*)\)\s*([.!?]?)$/.exec(reason.trim());
  if (!m) return { text: reason.trim(), math: null };
  const head = (m[1] ?? '').trim();
  if (head.length === 0) return { text: reason.trim(), math: null };
  // Put back the sentence's own punctuation, which the parenthetical was
  // sitting in front of.
  const tail = m[3] ?? '';
  return { text: /[.!?]$/.test(head) ? head : head + tail, math: (m[2] ?? '').trim() };
}

/**
 * Lines that are caveats about OUR evidence, not about the title.
 *
 * "No major red flags" is the engine saying it found nothing against the
 * title — it is the *absence* of a negative, and it was being printed under a
 * heading claiming something held the title back.
 */
function isSoft(line: string): boolean {
  const t = line.trim().toLowerCase();
  return (
    t.startsWith('no major red flags') ||
    t.startsWith('availability not fully verified') ||
    t.startsWith('no independent rating sources')
  );
}

/** "Things to know" only when there is something to know about the TITLE. */
export function knowHeading(items: readonly string[]): KnowHeading {
  return items.some((i) => !isSoft(i)) ? SECTION.know : SECTION.uncertain;
}

export interface ExplainSections {
  matched: { heading: string; lead: Reason[]; more: Reason[] };
  know: { heading: KnowHeading; reasons: Reason[] };
  /** True when anything is hidden behind "See scoring details" — the toggle is
   *  not rendered when it would open onto nothing. */
  hasDetails: boolean;
}

/**
 * Split the explanation into the three sections the card renders.
 *
 * `lead` is what you see first; `more` and every `math` value are what the
 * details toggle reveals. The order inside each list is the engine's own —
 * strongest first — and is never re-sorted here.
 */
export function explainSections(input: {
  rose?: readonly string[];
  heldBack?: readonly string[];
}): ExplainSections {
  const rose = (input.rose ?? []).filter((r) => r && r.trim().length > 0).map(splitMath);
  const heldBack = (input.heldBack ?? []).filter((r) => r && r.trim().length > 0).map(splitMath);

  const lead = rose.slice(0, TOP_REASONS);
  const more = rose.slice(TOP_REASONS);
  const hasDetails = more.length > 0 || [...rose, ...heldBack].some((r) => r.math != null);

  return {
    matched: { heading: SECTION.matched, lead, more },
    know: { heading: knowHeading(heldBack.map((r) => r.text)), reasons: heldBack },
    hasDetails,
  };
}
