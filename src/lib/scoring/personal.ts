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
}

/**
 * Compute the user's Personal Match score by applying their preference rules to
 * the general WatchVerdict score. Penalties fire only when the trait is a
 * defining characteristic (rule.requiresDefining). Every adjustment is
 * explained so the report can show exactly why the score moved.
 *
 * Hard preference penalties are never silently dropped and cannot be overridden
 * by AI prose downstream — this deterministic result is authoritative.
 */
export function computePersonalMatch(
  meta: TitleMetadata,
  baseScore: number,
  ctx: PersonalContext,
): PersonalMatch {
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
  };
}
