import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreferenceRule } from '@/lib/types';
import type { PersonalContext } from '@/lib/scoring/personal';
import { DEFAULT_NEW_USER_RULES, normalizeRule } from '@/lib/scoring/preferences';

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  region: string;
  personal_label: string | null;
  onboarding_complete: boolean;
  liked_franchise_ids: number[];
}

export function personalLabelFor(profile: Pick<Profile, 'personal_label' | 'display_name'>): string {
  if (profile.personal_label && profile.personal_label.trim()) return profile.personal_label.trim();
  const first = (profile.display_name ?? '').trim().split(/\s+/)[0];
  return first ? `${first} Match` : 'My Match';
}

export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, region, personal_label, onboarding_complete, liked_franchise_ids')
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function getPreferenceRules(
  supabase: SupabaseClient,
  userId: string,
): Promise<PreferenceRule[]> {
  const { data } = await supabase
    .from('preference_rules')
    .select('id, trait, weight, requires_defining, label')
    .eq('user_id', userId);

  if (!data || data.length === 0) return DEFAULT_NEW_USER_RULES;

  const rules = data
    .map((r) =>
      normalizeRule({
        id: r.id as string,
        trait: r.trait as PreferenceRule['trait'],
        weight: r.weight as number,
        requiresDefining: r.requires_defining as boolean,
        label: (r.label as string | null) ?? undefined,
      }),
    )
    .filter((r): r is PreferenceRule => r !== null);

  return rules.length > 0 ? rules : DEFAULT_NEW_USER_RULES;
}

/** Build the scoring context for a user (label + rules + liked franchises). */
export async function getPersonalContext(
  supabase: SupabaseClient,
  userId: string,
  collectionId: number | null,
): Promise<PersonalContext> {
  const [profile, rules] = await Promise.all([
    getProfile(supabase, userId),
    getPreferenceRules(supabase, userId),
  ]);
  return {
    label: profile ? personalLabelFor(profile) : 'My Match',
    rules,
    likedFranchiseIds: profile?.liked_franchise_ids ?? [],
    collectionId,
  };
}

export function regionFor(profile: Profile | null): string {
  return profile?.region ?? 'US';
}
