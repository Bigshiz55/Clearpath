'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreferenceTrait, PreferenceRule } from '@/lib/types';
import { avoidRule, loveRule, SCOTT_RULES, SCOTT_LIKED_FRANCHISE_IDS, normalizeRule } from '@/lib/scoring/preferences';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  return user;
}

async function writeRules(supabase: SupabaseClient, userId: string, rules: PreferenceRule[]) {
  await supabase.from('preference_rules').delete().eq('user_id', userId);
  if (rules.length === 0) return;
  const rows = rules.map((r) => ({
    user_id: userId,
    trait: r.trait,
    weight: r.weight,
    requires_defining: r.requiresDefining,
    label: r.label,
  }));
  const { error } = await supabase.from('preference_rules').insert(rows);
  if (error) throw new Error(error.message);
}

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];

const onboardingSchema = z.object({
  displayName: z.string().min(1).max(60),
  username: z.string().regex(/^[a-z0-9_]{3,24}$/, 'Use 3–24 lowercase letters, numbers, or underscores.'),
  region: z.string().length(2),
  personalLabel: z.string().max(40).optional(),
  avoidTraits: z.array(z.enum(AVOIDABLE as [PreferenceTrait, ...PreferenceTrait[]])).default([]),
  loveTraits: z.array(z.enum(LOVABLE as [PreferenceTrait, ...PreferenceTrait[]])).default([]),
  usePreset: z.enum(['none', 'scott']).default('none'),
  services: z.array(z.number().int().positive()).max(120).default([]),
});

export async function saveOnboarding(input: z.infer<typeof onboardingSchema>): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const v = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);

    // Username availability (case-insensitive).
    const username = v.username.toLowerCase();
    const { data: available } = await supabase.rpc('username_available', { candidate: username });
    if (available === false) {
      // It's fine if it's already ours.
      const { data: mine } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
      if (!mine || mine.username !== username) {
        return { ok: false, error: 'That username is taken. Try another.' };
      }
    }

    const personalLabel =
      v.personalLabel && v.personalLabel.trim()
        ? v.personalLabel.trim()
        : `${v.displayName.trim().split(/\s+/)[0]} Match`;

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      username,
      display_name: v.displayName.trim(),
      region: v.region.toUpperCase(),
      personal_label: personalLabel,
      onboarding_complete: true,
      // Seed enjoyed franchises for the Scott preset so its sequels auto-boost.
      liked_franchise_ids: v.usePreset === 'scott' ? SCOTT_LIKED_FRANCHISE_IDS : [],
    });
    if (profileError) return { ok: false, error: profileError.message };

    // Build preference rules.
    let rules: PreferenceRule[];
    if (v.usePreset === 'scott') {
      rules = SCOTT_RULES;
    } else {
      rules = [
        ...v.avoidTraits.map((t) => avoidRule(t)),
        ...v.loveTraits.map((t) => loveRule(t)),
      ];
    }
    await writeRules(supabase, user.id, rules);

    // Save the streaming services they picked (what "What you have" will show on
    // their own search screen). Optional and forgiving: a pre-migration DB that
    // lacks the column simply skips this — onboarding still succeeds.
    if (v.services.length > 0) {
      const unique = Array.from(new Set(v.services));
      const { error: svcErr } = await supabase.from('profiles').update({ my_services: unique }).eq('id', user.id);
      if (svcErr && !(svcErr.code === '42703' || /my_services/.test(svcErr.message))) {
        return { ok: false, error: svcErr.message };
      }
    }

    // Ensure a default watchlist exists.
    const { data: wl } = await supabase
      .from('watchlists')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle();
    if (!wl) {
      await supabase.from('watchlists').insert({ user_id: user.id, name: 'My Watchlist', is_default: true });
    }

    revalidatePath('/app');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save.' };
  }
}

const profileSchema = z.object({
  displayName: z.string().min(1).max(60),
  region: z.string().length(2),
  personalLabel: z.string().max(40),
});

export async function updateProfile(input: z.infer<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const v = parsed.data;
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: v.displayName.trim(),
        region: v.region.toUpperCase(),
        personal_label: v.personalLabel.trim() || null,
      })
      .eq('id', user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/settings');
    revalidatePath('/app');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update.' };
  }
}

const digestSchema = z.object({
  dailyDigest: z.boolean(),
  digestMinScore: z.number().int().min(40).max(95),
});

export async function updateDigestPrefs(input: z.infer<typeof digestSchema>): Promise<ActionResult> {
  const parsed = digestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid settings.' };
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const { error } = await supabase
      .from('profiles')
      .update({ daily_digest: parsed.data.dailyDigest, digest_min_score: parsed.data.digestMinScore })
      .eq('id', user.id);
    if (error) {
      return {
        ok: false,
        error:
          'Digest settings need the digest migration (0002_digest.sql) applied to the database first.',
      };
    }
    revalidatePath('/app');
    revalidatePath('/app/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

const rulesSchema = z.object({
  rules: z
    .array(
      z.object({
        trait: z.string(),
        weight: z.number(),
        requiresDefining: z.boolean(),
        label: z.string().optional(),
      }),
    )
    .max(40),
});

export async function replacePreferenceRules(input: z.infer<typeof rulesSchema>): Promise<ActionResult> {
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid rules.' };
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const normalized = parsed.data.rules
      .map((r) => normalizeRule(r as Partial<PreferenceRule>))
      .filter((r): r is PreferenceRule => r !== null);
    await writeRules(supabase, user.id, normalized);
    revalidatePath('/app/settings');
    revalidatePath('/app');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

const LOVABLE_SET = new Set(['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer']);
const AVOIDABLE_SET = new Set(['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn']);

export interface MyTaste {
  signedIn: boolean;
  isGuest: boolean;
  name: string | null;
  love: string[];
  avoid: string[];
}

/**
 * The current user's taste as crew/court traits, so joining pre-fills from their
 * WatchVerdict account. Only returns real, chosen rules (not defaults), and
 * treats anonymous guests as not-really-signed-in for pre-fill purposes.
 */
export async function getMyTaste(): Promise<MyTaste> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { signedIn: false, isGuest: false, name: null, love: [], avoid: [] };
    const isGuest = user.is_anonymous === true;

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    const { data: rows } = await supabase
      .from('preference_rules')
      .select('trait, weight, requires_defining')
      .eq('user_id', user.id);

    const love: string[] = [];
    const avoid: string[] = [];
    for (const r of rows ?? []) {
      const trait = r.trait as string;
      const weight = r.weight as number;
      const defining = r.requires_defining as boolean;
      if (weight > 0 && LOVABLE_SET.has(trait)) love.push(trait);
      else if ((weight < 0 || defining) && AVOIDABLE_SET.has(trait)) avoid.push(trait);
    }
    return {
      signedIn: !isGuest,
      isGuest,
      name: (profile?.display_name as string | null) ?? null,
      love,
      avoid,
    };
  } catch {
    return { signedIn: false, isGuest: false, name: null, love: [], avoid: [] };
  }
}

const servicesSchema = z.object({
  services: z.array(z.number().int().positive()).max(120),
});

/** Save the user's streaming subscriptions (TMDB provider ids). */
export async function updateMyServices(input: z.infer<typeof servicesSchema>): Promise<ActionResult> {
  const parsed = servicesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid services.' };
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const unique = Array.from(new Set(parsed.data.services));
    const { error } = await supabase.from('profiles').update({ my_services: unique }).eq('id', user.id);
    if (error) {
      if (error.code === '42703' || /my_services/.test(error.message)) {
        return { ok: false, error: 'My Services needs migration 0006 applied to the database first.' };
      }
      return { ok: false, error: error.message };
    }
    revalidatePath('/app/settings');
    revalidatePath('/app');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

const avatarSchema = z.object({ avatar: z.string().max(8).nullable() });

/** Set (or clear) the account avatar emoji. Clearing (null) falls back to the initial. */
export async function updateAvatar(input: z.infer<typeof avatarSchema>): Promise<ActionResult> {
  const parsed = avatarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid avatar.' };
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const value = parsed.data.avatar && parsed.data.avatar.trim() ? parsed.data.avatar.trim() : null;
    const { error } = await supabase.from('profiles').update({ avatar: value }).eq('id', user.id);
    if (error) {
      if (error.code === '42703' || /avatar/.test(error.message)) {
        return { ok: false, error: 'Avatars need migration 0019 applied to the database first.' };
      }
      return { ok: false, error: error.message };
    }
    revalidatePath('/app');
    revalidatePath('/app/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

/** Get (or create) the user's personal Quick-Add key for phone shortcuts. */
export async function getQuickAddToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const { data, error } = await supabase.from('profiles').select('quick_add_token').eq('id', user.id).maybeSingle();
    if (error) {
      if (error.code === '42P01' || /quick_add_token/.test(error.message)) {
        return { ok: false, error: 'Quick Add needs migration 0005 applied first.' };
      }
      return { ok: false, error: error.message };
    }
    let token = (data?.quick_add_token as string | null) ?? null;
    if (!token) {
      const { randomBytes } = await import('crypto');
      token = randomBytes(18).toString('base64url');
      const { error: upErr } = await supabase.from('profiles').update({ quick_add_token: token }).eq('id', user.id);
      if (upErr) return { ok: false, error: upErr.message };
    }
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

/** Roll a new Quick-Add key (invalidates the old one). */
export async function regenerateQuickAddToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const { randomBytes } = await import('crypto');
    const token = randomBytes(18).toString('base64url');
    const { error } = await supabase.from('profiles').update({ quick_add_token: token }).eq('id', user.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}
