/**
 * THE PILLS UNDER A RESULT — one of them matters more than the others.
 *
 * They shipped as one row of identical bright-green outlines: the personal
 * match, the year, an audience percentage, the runtime, the platform. Five
 * things with one visual weight, so the eye had to read all five to find the
 * one it wanted, and the most important number on the card — YOUR match — was
 * indistinguishable from "2023".
 *
 * Three ranks now:
 *   match — your score. The reason the result is on the screen at all.
 *   fact  — a checked constraint. Evidence, deliberately quiet.
 *   watch — where to actually watch it, which is a next step, not a fact.
 *
 * Nothing is dropped: the same receipts, re-ranked and de-duplicated.
 *
 * Pure. No I/O.
 */

export type PillTone = 'match' | 'fact' | 'watch';

export interface Pill {
  label: string;
  tone: PillTone;
}

/**
 * "Your 93" / "Household 88" — a word and a 0–100 score, which is how both
 * producers (`finder`, `askJudge`) build the leading receipt.
 *
 * Detected by SHAPE rather than by position, because a receipt list that ever
 * arrives in another order must not promote "2023" to the loudest thing on the
 * card.
 */
export function isMatchReceipt(receipt: string): boolean {
  return /^[\p{L}][\p{L}’'-]*\s\d{1,3}$/u.test(receipt.trim());
}

/** "on Netflix" — the receipt that says the same thing as the watch pill. */
function serviceIn(receipt: string): string | null {
  const m = /^on\s+(.+)$/i.exec(receipt.trim());
  return m ? (m[1] ?? '').trim() : null;
}

/**
 * Build the row.
 *
 * `where` becomes "Watch on Kanopy" rather than "Kanopy": a bare service name
 * is a label, and the thing a person wants from it is an instruction. When a
 * receipt already says "on Kanopy" it is dropped — the same fact twice, in two
 * shapes, was the row's other problem.
 */
export function buildPills(input: { receipts?: readonly string[]; where?: string | null }): Pill[] {
  const receipts = (input.receipts ?? []).map((r) => (r ?? '').trim()).filter((r) => r.length > 0);
  const where = (input.where ?? '').trim();

  const pills: Pill[] = [];
  const seen = new Set<string>();
  let tookMatch = false;

  for (const r of receipts) {
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    // The watch pill says this already, better.
    if (where && serviceIn(r)?.toLowerCase() === where.toLowerCase()) continue;
    seen.add(key);
    if (!tookMatch && isMatchReceipt(r)) {
      tookMatch = true;
      pills.unshift({ label: r, tone: 'match' });
    } else {
      pills.push({ label: r, tone: 'fact' });
    }
  }

  if (where) pills.push({ label: `Watch on ${where}`, tone: 'watch' });
  return pills;
}
