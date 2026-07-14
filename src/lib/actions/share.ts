'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VerdictReport } from '@/lib/types';
import { tmdbImage } from '@/lib/tmdb/client';

export interface ShareResult {
  ok: boolean;
  error?: string;
  token?: string;
  url?: string;
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Unguessable, non-sequential token (not derived from user/row ids). */
function makeToken(len = 22): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += BASE62[bytes[i]! % 62];
  return out;
}

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  return user;
}

function verdictSnapshot(report: VerdictReport, includePersonal: boolean) {
  return {
    kind: 'verdict' as const,
    includePersonal,
    title: report.title.title,
    year: report.title.year,
    mediaType: report.title.mediaType,
    posterUrl: tmdbImage(report.title.posterPath, 'w500'),
    backdropUrl: tmdbImage(report.title.backdropPath, 'w780'),
    generalScore: report.general.score,
    generalConfidence: report.general.confidence,
    primaryCall: report.primaryCall,
    tier: report.tier,
    disposition: report.watchlistDisposition,
    oneLiner: report.oneLiner,
    reasonsFor: report.reasonsFor.slice(0, 4),
    reasonsAgainst: report.reasonsAgainst.slice(0, 4),
    providers: report.providers,
    personal: includePersonal
      ? { label: report.personal.label, score: report.personal.score }
      : null,
    generatedAt: report.generatedAt,
  };
}

const verdictShareSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  includePersonal: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export async function createVerdictShare(
  input: z.infer<typeof verdictShareSchema>,
): Promise<ShareResult> {
  const parsed = verdictShareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid share request.' };
  const v = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);

    const { data: row } = await supabase
      .from('verdicts')
      .select('id, report')
      .eq('user_id', user.id)
      .eq('tmdb_id', v.tmdbId)
      .eq('media_type', v.mediaType)
      .maybeSingle();

    if (!row) {
      return { ok: false, error: 'Generate the verdict first, then share it.' };
    }

    const report = row.report as unknown as VerdictReport;
    const snapshot = verdictSnapshot(report, v.includePersonal);
    const token = makeToken();
    const expires_at =
      v.expiresInDays != null
        ? new Date(Date.now() + v.expiresInDays * 86_400_000).toISOString()
        : null;

    const { error } = await supabase.from('shares').insert({
      user_id: user.id,
      token,
      kind: 'verdict',
      verdict_id: row.id as string,
      include_personal: v.includePersonal,
      snapshot,
      expires_at,
    });
    if (error) return { ok: false, error: error.message };

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    return { ok: true, token, url: `${base}/share/${token}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create share.' };
  }
}

export async function deactivateShare(token: string): Promise<ShareResult> {
  if (!z.string().min(10).max(64).safeParse(token).success) {
    return { ok: false, error: 'Invalid token.' };
  }
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const { error } = await supabase
      .from('shares')
      .update({ is_active: false })
      .eq('token', token)
      .eq('user_id', user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}
