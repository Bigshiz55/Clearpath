'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getBuildInfo } from '@/lib/buildInfo';

const schema = z.object({
  description: z.string().trim().min(1, 'Say what happened.').max(4000),
  severity: z.enum(['low', 'medium', 'high']).nullable().optional(),
  url: z.string().max(2000),
  viewportWidth: z.number().int().positive().max(20000),
  viewportHeight: z.number().int().positive().max(20000),
});

export interface SubmitFeedbackReportInput {
  description: string;
  severity?: 'low' | 'medium' | 'high' | null;
  url: string;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * In-app bug/feedback reporter (distinct from src/lib/actions/feedback.ts's
 * per-title taste signal). Everything except the description and severity is
 * captured automatically by the caller (current URL, viewport) or here
 * (signed-in user, deployed commit SHA) — never typed by the reporter.
 * Insert-only: open to anyone (RLS `with check (true)`, migration 0040),
 * including a fully anonymous visitor on a public page with no session.
 */
export async function submitFeedbackReport(input: SubmitFeedbackReportInput): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid feedback.' };
  const v = parsed.data;

  const supabase = createClient();
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.is_anonymous ? null : (user.email ?? null);
    }
  } catch {
    /* no session at all on a public page — fine, submit anonymously */
  }

  const { gitSha } = getBuildInfo();

  const { error } = await supabase.from('feedback_reports').insert({
    user_id: userId,
    user_email: userEmail,
    url: v.url,
    commit_sha: gitSha || null,
    viewport_width: v.viewportWidth,
    viewport_height: v.viewportHeight,
    description: v.description,
    severity: v.severity ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
