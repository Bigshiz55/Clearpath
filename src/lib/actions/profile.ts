'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreferenceTrait, PreferenceRule } from '@/lib/types';
import { avoidRule, loveRule, SCOTT_RULES, normalizeRule } from '@/lib/scoring/preferences';

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
