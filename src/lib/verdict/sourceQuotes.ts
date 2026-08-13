/**
 * A REASON MAY NOT QUOTE A DATABASE ROW AT A READER.
 *
 * The deterministic engine writes one of its reasons by pasting a rating
 * source's own display string straight into a sentence:
 *
 *   buildReasonsFor → `Well received by audiences (${general.sources[0].raw}).`
 *   → "Well received by audiences (8.7/10 (23,328 votes))."
 *
 * That is correct data and terrible copy — a nested parenthetical carrying a
 * vote count, in the middle of a line whose job is to help someone decide. The
 * UI already has a convention for this (`splitMath` lifts a trailing numeric
 * parenthetical out of a reason and hides it behind "See scoring details"), and
 * it cannot lift this one: its regex will not cross the inner `)`.
 *
 * So the fix is upstream of the display, and it is a DEDUPLICATION rather than
 * a rewrite. Nothing is paraphrased and no replacement sentence is invented
 * here: a reason is dropped only when it repeats a source's raw string
 * verbatim, and `explainVerdict` already states the same fact in its own
 * concise voice ("Well received overall (88/100 across sources).") from the
 * blended score. The claim survives; the row of database text does not.
 *
 * Pure, client-safe, no I/O.
 */
import type { RatingSource } from '@/lib/types';

/**
 * Drop reasons that embed a rating source's own display string.
 *
 * Matching is on the sources actually attached to this title's score, never on
 * a hardcoded phrase — so it keeps working when the engine's wording changes,
 * and it can never swallow a reason that merely happens to mention a number.
 */
export function withoutRawSourceQuotes(reasons: string[], sources: RatingSource[]): string[] {
  const raws = sources.map((s) => s.raw).filter((r): r is string => typeof r === 'string' && r.trim().length > 0);
  if (raws.length === 0) return reasons;
  return reasons.filter((reason) => !raws.some((raw) => reason.includes(raw)));
}
