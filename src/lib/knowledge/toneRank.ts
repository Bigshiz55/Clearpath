/**
 * TONE + SETTING RANKING NUDGE (pure, bounded, subordinate).
 *
 * The compiled `title_knowledge` header carries a title's tone AND setting. When
 * the request expresses desired tones (softPreferences.tones) or settings/themes
 * (softPreferences.themes), a title whose COMPILED header agrees gets a SMALL
 * rank bonus — enough to break ties and lift on-target titles, never enough to
 * override the deterministic Watchability / Taste DNA score or, crucially, hard
 * eligibility.
 *
 * Guarantees:
 *  • BOUNDED: at most HEADER_NUDGE_MAX (tone ≤ TONE_NUDGE_MAX + setting ≤
 *    SETTING_NUDGE_MAX) — a few points, far below the 0..100 Taste DNA scale.
 *  • SUBORDINATE TO ELIGIBILITY: `applyHeaderRanking` is invoked by the caller
 *    ONLY on already-eligible survivors (after the hard-constraint + subject
 *    gates). It has no access to eligibility and cannot admit or resurrect an
 *    ineligible title — it only reorders titles that already passed.
 *  • REWARD-ONLY: agreement adds; missing/sparse compiled header is a no-op (0),
 *    so a title is never demoted for lacking compiled data, and there is no
 *    invented inference — only compiled/evidenced values are read.
 */

export const TONE_NUDGE_MAX = 4;
export const SETTING_NUDGE_MAX = 3;
export const HEADER_NUDGE_MAX = TONE_NUDGE_MAX + SETTING_NUDGE_MAX;

const norm = (s: string) => (s ?? '').toLowerCase().trim();

/** A 0..max reward for how well `have` matches `want`. No-op (0) when either is empty. */
function agreementBonus(have: string[], want: string[], max: number): number {
  const wants = want.map(norm).filter(Boolean);
  const haves = new Set(have.map(norm).filter(Boolean));
  if (wants.length === 0 || haves.size === 0) return 0;
  let matched = 0;
  for (const w of wants) {
    if (haves.has(w) || [...haves].some((h) => h.includes(w) || w.includes(h))) matched++;
  }
  if (matched === 0) return 0;
  return Math.round((max * matched) / wants.length);
}

/** 0..TONE_NUDGE_MAX bonus for compiled-tone / requested-tone agreement. */
export function toneNudge(compiledTone: string[], requestedTones: string[]): number {
  return agreementBonus(compiledTone, requestedTones, TONE_NUDGE_MAX);
}

/** 0..SETTING_NUDGE_MAX bonus for compiled-setting / requested-setting agreement. */
export function settingNudge(compiledSetting: string[], requestedSettings: string[]): number {
  return agreementBonus(compiledSetting, requestedSettings, SETTING_NUDGE_MAX);
}

/** Combined bounded header bonus (tone + setting), 0..HEADER_NUDGE_MAX. */
export function headerNudge(
  header: { tone: string[]; setting: string[] },
  requestedTones: string[],
  requestedSettings: string[],
): number {
  return toneNudge(header.tone, requestedTones) + settingNudge(header.setting, requestedSettings);
}

export interface RankableItem {
  id: number;
  mediaType: 'movie' | 'tv';
  matchScore: number;
  receipts: string[];
}

/**
 * Apply the bounded tone+setting header bonus to ALREADY-ELIGIBLE survivors.
 * Mutates matchScore in place (clamped ≤ 100) and records a receipt. The caller
 * guarantees `items` are all eligible, so this can never resurrect an ineligible
 * title — it only reorders survivors. Pure aside from the in-place bump; safe
 * when a header is missing (no-op for that item).
 */
export function applyHeaderRanking(
  items: RankableItem[],
  headers: Map<string, { tone: string[]; setting: string[] }>,
  requestedTones: string[],
  requestedSettings: string[],
): void {
  if (requestedTones.length === 0 && requestedSettings.length === 0) return;
  for (const item of items) {
    const h = headers.get(`${item.mediaType}-${item.id}`);
    if (!h) continue;
    const bonus = headerNudge(h, requestedTones, requestedSettings);
    if (bonus > 0) {
      item.matchScore = Math.min(100, item.matchScore + bonus);
      item.receipts.unshift(`vibe ✓ +${bonus}`);
    }
  }
}
