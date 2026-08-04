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
  daily_digest: boolean;
  digest_min_score: number;
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, region, personal_label, onboarding_complete, liked_franchise_ids, daily_digest, digest_min_score')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // Migration 0002 (digest columns) may not be applied yet — fall back to the
    // base columns so the app keeps working, with sensible digest defaults.
    const { data: base } = await supabase
      .from('profiles')
      .select('id, username, display_name, region, personal_label, onboarding_complete, liked_franchise_ids')
      .eq('id', userId)
      .maybeSingle();
    if (!base) return null;
    return { ...(base as Omit<Profile, 'daily_digest' | 'digest_min_score'>), daily_digest: true, digest_min_score: 72 };
  }
  return (data as Profile | null) ?? null;
}

/**
 * Ensure an anonymous "guest" user has a usable profile so they skip onboarding
 * and land straight in the app. No preference_rules rows are inserted, so
 * `getPersonalContext` below treats this guest as having no signal — every
 * title they see is scored and labeled as a neutral General Verdict until
 * they actually build some taste signal (rate titles, pick loves/avoids).
 */
export async function ensureGuestProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile> {
  await supabase.from('profiles').upsert(
    {
      id: userId,
      onboarding_complete: true,
      region: 'US',
      display_name: 'Guest',
      personal_label: 'Your Match',
    },
    { onConflict: 'id' },
  );
  const profile = await getProfile(supabase, userId);
  return (
    profile ?? {
      id: userId,
      username: null,
      display_name: 'Guest',
      region: 'US',
      personal_label: 'Your Match',
      onboarding_complete: true,
      liked_franchise_ids: [],
      daily_digest: false,
      digest_min_score: 72,
    }
  );
}

/**
 * The user's own `preference_rules` rows, verbatim — empty when they have
 * none. Never falls back to DEFAULT_NEW_USER_RULES; that fallback exists
 * only as an editable starting template (see `getPreferenceRules` below) and
 * must never be mistaken for a real signal by `getPersonalContext`.
 */
async function getRawPreferenceRules(
  supabase: SupabaseClient,
  userId: string,
): Promise<PreferenceRule[]> {
  const { data } = await supabase
    .from('preference_rules')
    .select('id, trait, weight, requires_defining, label')
    .eq('user_id', userId);

  if (!data) return [];

  return data
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
}

/**
 * Rules for editing UI (Settings) — a brand-new user with zero rows gets the
 * default template pre-filled so they have something to start from. This is
 * NOT the same thing as "this user's real signal"; scoring must never call
 * this function — see `getPersonalContext`, which uses the raw, undefaulted
 * rows to decide whether this viewer has any real taste signal at all.
 */
export async function getPreferenceRules(
  supabase: SupabaseClient,
  userId: string,
): Promise<PreferenceRule[]> {
  const rules = await getRawPreferenceRules(supabase, userId);
  return rules.length > 0 ? rules : DEFAULT_NEW_USER_RULES;
}

/**
 * Build the scoring context for a user (label + rules + liked franchises).
 *
 * `hasSignal` is the gate the deterministic engine (`computePersonalMatch`)
 * uses to decide whether this viewer may be shown anything framed as
 * personal at all. It is true only when they have real preference_rules
 * rows or liked franchises of their own — never for a brand-new/anonymous
 * viewer, even though `DEFAULT_NEW_USER_RULES` exists elsewhere as an
 * editable starting template. A zero-signal viewer always gets rules: [] and
 * label: 'General Verdict' here, so every consumer (title pages, Finder,
 * Watch Now, the Mentalist, Ask the Judge) is honest about it without each
 * one having to re-derive the check itself.
 */
export async function getPersonalContext(
  supabase: SupabaseClient,
  userId: string,
  collectionId: number | null,
): Promise<PersonalContext> {
  const [profile, rawRules] = await Promise.all([
    getProfile(supabase, userId),
    getRawPreferenceRules(supabase, userId),
  ]);
  const likedFranchiseIds = profile?.liked_franchise_ids ?? [];
  const hasSignal = rawRules.length > 0 || likedFranchiseIds.length > 0;
  return {
    label: hasSignal ? (profile ? personalLabelFor(profile) : 'My Match') : 'General Verdict',
    rules: hasSignal ? rawRules : [],
    likedFranchiseIds,
    collectionId,
    hasSignal,
  };
}

export function regionFor(profile: Profile | null): string {
  return profile?.region ?? 'US';
}

/**
 * The user's chosen streaming services (TMDB provider ids). Read via its own
 * guarded query so the app keeps working before migration 0006 is applied —
 * a missing column simply yields an empty list.
 */
export async function getMyServices(
  supabase: SupabaseClient,
  userId: string,
): Promise<number[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('my_services')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return [];
  const raw = (data as { my_services?: unknown }).my_services;
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

/** The user's chosen account avatar (an emoji), guarded — null before migration 0019. */
export async function getAvatar(supabase: SupabaseClient, userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('avatar').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const v = (data as { avatar?: unknown }).avatar;
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Whether the user shares their verdicts on a public profile (guarded read). */
export async function getPublicActivity(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('public_activity')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { public_activity?: unknown }).public_activity);
}
