/**
 * THE PILLS UNDER A RESULT — only what the card has not already said.
 *
 * The row began life as the finder's receipts printed verbatim, and by the time
 * the card grew a facts line and an honest badge it had become a row of
 * repeats: "Your 81" beside a badge already showing a score, "✓ 1h 42m" under
 * a facts line already reading "1h 42m · PG", "✓ 2024" under a heading already
 * reading "MOVIE · 2024". Three inches of card, every number said twice — and
 * two of the twice-said numbers disagreed.
 *
 * The rules now:
 *
 *   ONE NUMBER PER CARD. The Verd1ct badge is the score, labelled honestly by
 *   its own component ("Your VERD1CT" only when it is actually personalized).
 *   A match receipt ("Your 81", "Household 88") is therefore DROPPED here —
 *   not restyled, dropped. Two scores on one card is a contradiction waiting
 *   to happen, and it happened.
 *
 *   NOTHING THE CARD ALREADY SHOWS. The heading owns the year; the facts line
 *   owns runtime and episode length. Receipts in those shapes are dropped.
 *
 *   THE NEXT STEP LEADS. "Watch on Kanopy" is the one pill that is an action
 *   rather than a fact, so it comes first and the surviving evidence
 *   ("87% audience", "Stream It", "fast-paced") follows quietly.
 *
 * Pure. No I/O.
 */

export type PillTone = 'watch' | 'fact';

export interface Pill {
  label: string;
  tone: PillTone;
}

/**
 * "Your 93" / "Household 88" — a word and a 0–100 score, which is how both
 * producers (`finder`, `askJudge`) build the leading receipt. Detected by
 * SHAPE, not position, so a reordered receipt list cannot sneak a second
 * score back onto the card.
 */
export function isMatchReceipt(receipt: string): boolean {
  return /^[\p{L}][\p{L}’'-]*\s\d{1,3}$/u.test(receipt.trim());
}

/**
 * Facts the card states elsewhere, in the shapes the finder emits them:
 * a bare year (the heading), "1h 42m" / "118m" / "45m episodes" (the facts
 * line), and "83% audience" / "IMDb 7.8" (the ratings row inside the badge
 * panel — the audience and IMDb chips are those exact numbers). Nothing is
 * lost by dropping them: every checked requirement is itemised with its
 * evidence under "Your requirements" in Why this Verd1ct.
 */
export function isAlreadyOnCard(receipt: string): boolean {
  const r = receipt.trim();
  if (/^(19|20)\d{2}$/.test(r)) return true;
  if (/^\d+h(\s\d+m)?$/.test(r)) return true;
  if (/^\d+m$/.test(r)) return true;
  if (/^\d+m episodes$/.test(r)) return true;
  if (/^\d+% audience$/.test(r)) return true;
  if (/^IMDb \d/.test(r)) return true;
  return false;
}

/** "on Netflix" — the receipt that says the same thing as the watch pill. */
function serviceIn(receipt: string): string | null {
  const m = /^on\s+(.+)$/i.exec(receipt.trim());
  return m ? (m[1] ?? '').trim() : null;
}

/**
 * Build the row. `where` becomes "Watch on Kanopy" — an instruction, not a
 * label — and leads. Everything that survives the dedupe follows as quiet
 * evidence, in the engine's own order. An empty result is normal and means
 * the card already said it all.
 */
export function buildPills(input: { receipts?: readonly string[]; where?: string | null }): Pill[] {
  const receipts = (input.receipts ?? []).map((r) => (r ?? '').trim()).filter((r) => r.length > 0);
  const where = (input.where ?? '').trim();

  const pills: Pill[] = [];
  if (where) pills.push({ label: `Watch on ${where}`, tone: 'watch' });

  const seen = new Set<string>();
  for (const r of receipts) {
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    if (isMatchReceipt(r)) continue; // the badge is the one number
    if (isAlreadyOnCard(r)) continue; // the heading/facts line said it
    if (where && serviceIn(r)?.toLowerCase() === where.toLowerCase()) continue;
    seen.add(key);
    pills.push({ label: r, tone: 'fact' });
  }

  return pills;
}
