/**
 * QUICK DNA — turning traits into something a person recognises as themselves.
 *
 * "Crime 9, Comedy 1, Sci-Fi 5" is a scoreboard, not an insight, and it is
 * exactly what the previous version produced. The interesting statements are
 * the RELATIONSHIPS between traits: that investigation beats action, that fear
 * is fine but ghosts are not, that dubbing is acceptable where subtitles are
 * not. None of those is visible in any single number.
 *
 * So the summary is built in two layers. The bars are the strongest individual
 * traits, for recognition. The chips are the comparative claims — each one a
 * rule with a stated condition, fired only when both sides are confident enough
 * to mean it. A chip that fires on thin evidence is worse than no chip: it is
 * the product telling someone something false about themselves.
 *
 * PURE. No I/O, no model call.
 */

import { QUICK_TRAITS, decidedTraits, traitBelief, traitConfidence, type TraitKey, type TraitProfile } from './traits';

export interface DnaBar {
  key: TraitKey;
  label: string;
  /** 0..10, the scale the user answered in. */
  score: number;
  confidence: number;
}

export interface InsightChip {
  id: string;
  text: string;
  /** Rough strength of the claim, for ordering. */
  weight: number;
}

/** Enough confidence to say something out loud about a trait. */
const SAY_IT = 0.28;

function pref(profile: TraitProfile, key: TraitKey): number {
  return traitBelief(profile, key).pref;
}
function sure(profile: TraitProfile, key: TraitKey, min = SAY_IT): boolean {
  return traitConfidence(profile, key) >= min;
}

/** The bars: strongest leanings first, capped so the screen stays readable. */
export function dnaBars(profile: TraitProfile, limit = 8): DnaBar[] {
  return decidedTraits(profile, 0.2, 10)
    .slice(0, limit)
    .map((t) => ({
      key: t.key,
      label: QUICK_TRAITS[t.key],
      score: Math.round(t.pref / 10),
      confidence: t.confidence,
    }));
}

/**
 * The comparative claims. Each rule names the two things being compared and
 * requires both to be known — a gap between a confident trait and an unmeasured
 * one is not a finding.
 */
export function insightChips(profile: TraitProfile, limit = 5): InsightChip[] {
  const chips: InsightChip[] = [];
  const gap = (a: TraitKey, b: TraitKey): number | null =>
    sure(profile, a) && sure(profile, b) ? pref(profile, a) - pref(profile, b) : null;

  const invVsAction = gap('investigation', 'action');
  if (invVsAction !== null && invVsAction >= 18) {
    chips.push({ id: 'investigation-first', text: 'Investigation first', weight: Math.abs(invVsAction) });
  } else if (invVsAction !== null && invVsAction <= -18) {
    chips.push({ id: 'spectacle-first', text: 'Spectacle over puzzle', weight: Math.abs(invVsAction) });
  }

  const groundedVsSuper = gap('grounded', 'supernatural');
  if (groundedVsSuper !== null && groundedVsSuper >= 20) {
    chips.push({ id: 'grounded-over-supernatural', text: 'Grounded > supernatural', weight: groundedVsSuper });
  } else if (groundedVsSuper !== null && groundedVsSuper <= -20) {
    chips.push({ id: 'supernatural-welcome', text: 'Happy in the supernatural', weight: -groundedVsSuper });
  }

  if (sure(profile, 'darkness') && pref(profile, 'darkness') >= 65) {
    chips.push({ id: 'dark-is-fine', text: 'Dark is fine', weight: pref(profile, 'darkness') - 50 });
  }
  if (sure(profile, 'darkness') && pref(profile, 'darkness') <= 35) {
    chips.push({ id: 'keep-it-light', text: 'Keep it light', weight: 50 - pref(profile, 'darkness') });
  }

  if (sure(profile, 'patience') && pref(profile, 'patience') <= 30) {
    chips.push({ id: 'no-slow', text: 'No patience for slow pacing', weight: 50 - pref(profile, 'patience') });
  }
  if (sure(profile, 'patience') && pref(profile, 'patience') >= 70) {
    chips.push({ id: 'slow-is-fine', text: 'Happy with a slow build', weight: pref(profile, 'patience') - 50 });
  }

  // The practical one: dubbing acceptable where subtitles are not. Only worth
  // saying when the two genuinely disagree.
  const dubVsSubs = gap('international', 'subtitles');
  if (dubVsSubs !== null && dubVsSubs >= 20) {
    chips.push({ id: 'dubbed-yes-subs-no', text: 'Dubbed yes, subtitles no', weight: dubVsSubs });
  } else if (sure(profile, 'subtitles') && pref(profile, 'subtitles') >= 70) {
    chips.push({ id: 'subs-fine', text: 'Subtitles are fine', weight: pref(profile, 'subtitles') - 50 });
  }

  // Fear without ghosts — the distinction the old genre-score version could not
  // represent at all, and the single most useful thing this calibration learns.
  if (
    sure(profile, 'psychological') &&
    sure(profile, 'supernatural') &&
    pref(profile, 'psychological') >= 65 &&
    pref(profile, 'supernatural') <= 40
  ) {
    chips.push({ id: 'psych-not-ghosts', text: 'Psychological, not supernatural', weight: 30 });
  }

  if (sure(profile, 'comedy') && pref(profile, 'comedy') <= 30) {
    chips.push({ id: 'low-comedy', text: 'Comedy is not the draw', weight: 50 - pref(profile, 'comedy') });
  }
  if (sure(profile, 'complexity') && pref(profile, 'complexity') >= 70) {
    chips.push({ id: 'demanding', text: 'Will work for it', weight: pref(profile, 'complexity') - 50 });
  }

  return chips.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/**
 * A one-line description, used where a sentence reads better than chips.
 * Deliberately conservative: it says nothing when nothing is known.
 */
export function headline(profile: TraitProfile): string | null {
  const top = decidedTraits(profile, 0.3, 20)[0];
  if (!top) return null;
  const direction = pref(profile, top.key) >= 50 ? 'Strong pull toward' : 'Little appetite for';
  return `${direction} ${QUICK_TRAITS[top.key].toLowerCase()}`;
}
