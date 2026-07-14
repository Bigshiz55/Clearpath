import type { PreferenceRule, PreferenceTrait } from '@/lib/types';
import { humanTrait } from './traits';

/**
 * Scott's permanent preference rules (spec §5). Penalties apply only when the
 * trait is a *defining* characteristic (requiresDefining = true). Positive
 * signals apply when present.
 */
export const SCOTT_RULES: PreferenceRule[] = [
  { trait: 'supernatural', weight: -20, requiresDefining: true, label: 'Supernatural (major)' },
  { trait: 'paranormal', weight: -20, requiresDefining: true, label: 'Paranormal (major)' },
  { trait: 'noir', weight: -20, requiresDefining: true, label: 'Noir styling' },
  { trait: 'slow_burn', weight: -20, requiresDefining: true, label: 'Slow burn pacing' },
  { trait: 'science_fiction', weight: -20, requiresDefining: true, label: 'Science fiction (major)' },
  { trait: 'fantasy', weight: -20, requiresDefining: true, label: 'Fantasy (major)' },
  // Positive weights follow Scott's documented profile (spec §3).
  { trait: 'grounded_crime', weight: 12, requiresDefining: false, label: 'Grounded crime drama' },
  { trait: 'psychological_thriller', weight: 10, requiresDefining: false, label: 'Psychological thriller' },
  { trait: 'serial_killer', weight: 12, requiresDefining: false, label: 'Serial-killer investigation' },
  { trait: 'detective_mystery', weight: 12, requiresDefining: false, label: 'Clever / Sherlock-style detective mystery' },
  { trait: 'domestic_thriller', weight: 6, requiresDefining: false, label: 'Grounded Lifetime-style thriller' },
  { trait: 'franchise_favorite', weight: 10, requiresDefining: false, label: 'Sequel in a franchise you enjoyed' },
];

/** TMDB collection ids of franchises Scott has enjoyed (seeds the sequel boost). */
export const SCOTT_LIKED_FRANCHISE_IDS = [
  760161, // Enola Holmes Collection
];

/**
 * Sensible starting rules for a brand-new user. Neutral by default — a new
 * user is not penalized for anything until they express preferences during
 * onboarding. We still surface positive-signal detection so reports feel
 * personalized from day one, but with lighter weights.
 */
export const DEFAULT_NEW_USER_RULES: PreferenceRule[] = [
  { trait: 'grounded_crime', weight: 6, requiresDefining: false, label: 'Grounded crime drama' },
  { trait: 'psychological_thriller', weight: 6, requiresDefining: false, label: 'Psychological thriller' },
  { trait: 'detective_mystery', weight: 6, requiresDefining: false, label: 'Detective mystery' },
];

/** Map an onboarding "avoid" selection to a defining-only penalty rule. */
export function avoidRule(trait: PreferenceTrait, weight = -20): PreferenceRule {
  return {
    trait,
    weight: -Math.abs(weight),
    requiresDefining: true,
    label: `Avoid ${humanTrait(trait).toLowerCase()}`,
  };
}

/** Map an onboarding "love" selection to a present-based boost rule. */
export function loveRule(trait: PreferenceTrait, weight = 12): PreferenceRule {
  return {
    trait,
    weight: Math.abs(weight),
    requiresDefining: false,
    label: `Enjoys ${humanTrait(trait).toLowerCase()}`,
  };
}

/** Validate/clamp a rule coming from the database or user input. */
export function normalizeRule(input: Partial<PreferenceRule>): PreferenceRule | null {
  if (!input.trait) return null;
  const weight = Math.max(-40, Math.min(40, Math.round(Number(input.weight) || 0)));
  return {
    id: input.id,
    trait: input.trait,
    weight,
    requiresDefining: Boolean(input.requiresDefining),
    label: input.label ?? humanTrait(input.trait),
  };
}
