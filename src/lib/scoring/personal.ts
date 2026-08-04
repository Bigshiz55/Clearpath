import type {
  PersonalMatch,
  PreferenceRule,
  ScoreAdjustment,
  TitleMetadata,
} from '@/lib/types';
import { detectTrait, humanTrait, type DetectionContext } from './traits';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface PersonalContext extends DetectionContext {
  label: string;
  rules: PreferenceRule[];
  /**
   * Whether `rules`/`label` represent real, established taste signal for this
   * viewer — explicit preference rules they set, liked franchises, or a
   * household/Court member's own typed loves/avoids — as opposed to a
   * brand-new or zero-signal viewer who has not built any Watch DNA yet.
   * `computePersonalMatch` refuses to apply `rules` or `label` at all when
   * this is false, so a silently-injected default rule set (see
   * DEFAULT_NEW_USER_RULES) can never be presented as someone's own taste.
   */
  hasSignal: boolean;
}

/**
 * Compute the user's Personal Match score by applying their preference rules to
 * the general WatchVerd1ct score. Penalties fire only when the trait is a
 * defining characteristic (rule.requiresDefining). Every adjustment is
 * explained so the report can show exactly why the score moved.
 *
 * Hard preference penalties are never silently dropped and cannot be overridden
 * by AI prose downstream — this deterministic result is authoritative.
 *
 * A viewer with no real signal (`ctx.hasSignal === false`) always gets the
 * neutral "General Verdict" back — score equal to baseScore, zero
 * adjustments — regardless of what `ctx.rules` contains, so a fresh visitor
 * is never shown a tier, one-liner, or "why it may work" reason framed as
 * personal.
 */
export function computePersonalMatch(
  meta: TitleMetadata,
  baseScore: number,
  ctx: PersonalContext,
): PersonalMatch {
  if (!ctx.hasSignal) {
    const score = clamp(Math.round(baseScore));
    return { label: 'General Verdict', score, baseScore: score, adjustments: [], hasSignal: false };
  }

  const adjustments: ScoreAdjustment[] = [];
  let score = baseScore;

  for (const rule of ctx.rules) {
    const signal = detectTrait(rule.trait, meta, ctx);
    const fires = rule.requiresDefining ? signal.defining : signal.present;
    if (!fires) continue;

    const points = rule.weight;
    if (points === 0) continue;

    const evidence =
      signal.matchedKeywords.length > 0
        ? `matched: ${signal.matchedKeywords.slice(0, 4).join(', ')}`
        : signal.matchedGenres.length > 0
          ? `genre: ${signal.matchedGenres.join(', ')}`
          : 'detected';

    adjustments.push({
      trait: rule.trait,
      label: rule.label || humanTrait(rule.trait),
      points,
      defining: signal.defining,
      reason:
        points < 0
          ? `${humanTrait(rule.trait)} is a defining characteristic (${evidence}); applying ${points}.`
          : `${humanTrait(rule.trait)} present (${evidence}); applying +${points}.`,
    });

    score += points;
  }

  score = clamp(Math.round(score));

  // Deterministic ordering for stable display: largest magnitude first.
  adjustments.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  return {
    label: ctx.label,
    score,
    baseScore: clamp(Math.round(baseScore)),
    adjustments,
    hasSignal: true,
  };
}
