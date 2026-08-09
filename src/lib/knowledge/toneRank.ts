/**
 * TONE/SETTING RANKING NUDGE (pure, bounded, subordinate).
 *
 * The compiled `title_knowledge` header carries a title's tone (and setting).
 * When the request expresses desired tones (softPreferences.tones on the
 * AI-primary path), a title whose COMPILED tone agrees gets a SMALL rank bonus —
 * enough to break ties and lift on-tone titles, never enough to override the
 * deterministic Watchability / Taste DNA score or, crucially, hard eligibility.
 *
 * Design guarantees:
 *  • BOUNDED: at most ±TONE_NUDGE_MAX (a few points), far below the 0..100 Taste
 *    DNA scale and the ±8 / ±10 dimension/preference nudges — so it is a
 *    tie-breaker, not a ranker.
 *  • SUBORDINATE TO ELIGIBILITY: the caller applies it ONLY to already-eligible
 *    survivors (after the hard-constraint + subject gates), so a nudge can never
 *    promote an ineligible title. This function has no access to eligibility and
 *    cannot change it.
 *  • REWARD-ONLY: agreement adds; missing/sparse compiled tone is a no-op (0), so
 *    a title is never demoted for lacking compiled data.
 */

export const TONE_NUDGE_MAX = 4;

const norm = (s: string) => (s ?? '').toLowerCase().trim();

/**
 * A 0..TONE_NUDGE_MAX bonus for how well a title's compiled tone matches the
 * requested tones. No-op (0) when either side is empty.
 */
export function toneNudge(compiledTone: string[], requestedTones: string[]): number {
  const want = requestedTones.map(norm).filter(Boolean);
  const have = new Set(compiledTone.map(norm).filter(Boolean));
  if (want.length === 0 || have.size === 0) return 0;
  let matched = 0;
  for (const w of want) {
    // Exact or containment either way ("dark" ↔ "dark comedy").
    if (have.has(w) || [...have].some((h) => h.includes(w) || w.includes(h))) matched++;
  }
  if (matched === 0) return 0;
  return Math.round((TONE_NUDGE_MAX * matched) / want.length);
}
