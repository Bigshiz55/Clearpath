'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { nudgesFromAnswers, type Disposition } from '@/lib/interview';
import { avoidRule } from '@/lib/scoring/preferences';
import { humanTrait } from '@/lib/scoring/traits';

export interface ActionResult {
  ok: boolean;
  error?: string;
  nudged?: string[];
}

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  return user;
}

function migrationHint(err: { code?: string; message?: string }): string | null {
  if (err.code === '42P01' || /title_feedback/.test(err.message ?? '')) {
    return 'The post-watch interview needs migration 0009 applied first.';
  }
  return null;
}

const schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  disposition: z.enum(['finished', 'abandoned']),
  answers: z.record(z.string().max(40), z.string().max(40)),
});

export async function submitInterview(input: z.infer<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid answers.' };
  const v = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);

    const { error } = await supabase.from('title_feedback').upsert(
      {
        user_id: user.id,
        tmdb_id: v.tmdbId,
        media_type: v.mediaType,
        disposition: v.disposition,
        answers: v.answers,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tmdb_id,media_type' },
    );
    if (error) return { ok: false, error: migrationHint(error) ?? error.message };

    // Honest Taste Brain nudges: only add "avoid" rules the user's own answers
    // support, and only when they don't already have one. The scoring engine is
    // untouched — this is the same tunable layer as Settings preferences.
    const traits = nudgesFromAnswers(v.answers, v.disposition as Disposition);
    const nudged: string[] = [];
    if (traits.length > 0) {
      const { data: existing } = await supabase
        .from('preference_rules')
        .select('trait, weight')
        .eq('user_id', user.id);
      const haveAvoid = new Set(
        (existing ?? [])
          .filter((r) => (r.weight as number) < 0)
          .map((r) => r.trait as string),
      );
      const toAdd = traits.filter((t) => !haveAvoid.has(t));
      if (toAdd.length > 0) {
        const rows = toAdd.map((t) => {
          const rule = avoidRule(t);
          return {
            user_id: user.id,
            trait: rule.trait,
            weight: rule.weight,
            requires_defining: rule.requiresDefining,
            label: rule.label,
          };
        });
        const { error: insErr } = await supabase.from('preference_rules').insert(rows);
        if (!insErr) {
          nudged.push(...toAdd.map((t) => humanTrait(t)));
          revalidatePath('/app');
          revalidatePath('/app/settings');
        }
      }
    }

    revalidatePath(`/app/title/${v.mediaType}/${v.tmdbId}`);
    return { ok: true, nudged };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}
