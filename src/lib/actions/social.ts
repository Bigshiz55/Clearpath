'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

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

function migrationHint(err: { code?: string; message?: string }): string | null {
  if (err.code === '42P01' || /follows|public_activity/.test(err.message ?? '')) {
    return 'Following needs migration 0007 applied to the database first.';
  }
  return null;
}

const idSchema = z.string().uuid();

export async function followUser(targetId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(targetId).success) return { ok: false, error: 'Invalid user.' };
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    if (user.id === targetId) return { ok: false, error: 'You can’t follow yourself.' };
    const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
    if (error && error.code !== '23505') {
      // 23505 = already following; treat as success.
      return { ok: false, error: migrationHint(error) ?? error.message };
    }
    revalidatePath('/app/friends');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

export async function unfollowUser(targetId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(targetId).success) return { ok: false, error: 'Invalid user.' };
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetId);
    if (error) return { ok: false, error: migrationHint(error) ?? error.message };
    revalidatePath('/app/friends');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

const publicSchema = z.object({ on: z.boolean() });

/** Opt in/out of sharing your verdicts on your public profile. */
export async function setPublicActivity(input: z.infer<typeof publicSchema>): Promise<ActionResult> {
  const parsed = publicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid.' };
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const { error } = await supabase.from('profiles').update({ public_activity: parsed.data.on }).eq('id', user.id);
    if (error) return { ok: false, error: migrationHint(error) ?? error.message };
    revalidatePath('/app/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}
