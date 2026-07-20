'use server';

import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';

export interface OverrideResult {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  key: z.enum(DIMENSION_KEYS as [string, ...string[]]),
  pref: z.number().int().min(0).max(100),
  isLimit: z.boolean().optional(),
});

function migrationHint(err: { code?: string; message?: string }): string | null {
  if (err.code === '42P01' || /dimension_overrides/.test(err.message ?? '')) {
    return 'Manual dial corrections need migration 0018 applied to the database first.';
  }
  return null;
}

/** Pin a taste dial to the user's own position (and optionally mark it a hard limit). */
export async function setDimensionOverride(input: z.infer<typeof schema>): Promise<OverrideResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid correction.' };
  const v = parsed.data;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Please sign in first.' };

    const { error } = await supabase.from('dimension_overrides').upsert(
      { user_id: user.id, dimension_key: v.key, pref: v.pref, is_limit: v.isLimit ?? false, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,dimension_key' },
    );
    if (error) return { ok: false, error: migrationHint(error) ?? error.message };

    revalidateTag(`dim-profile:${user.id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save your correction.' };
  }
}

/** Clear a manual correction and let the learned value take over again. */
export async function clearDimensionOverride(key: string): Promise<OverrideResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Please sign in first.' };
    const { error } = await supabase
      .from('dimension_overrides')
      .delete()
      .eq('user_id', user.id)
      .eq('dimension_key', key);
    if (error) return { ok: false, error: error.message };
    revalidateTag(`dim-profile:${user.id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not clear the correction.' };
  }
}
