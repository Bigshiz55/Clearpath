'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export interface ReminderResult {
  ok: boolean;
  error?: string;
  /** True when the user has no push device registered yet — UI should prompt. */
  needsNotifications?: boolean;
}

const schema = z.object({
  airingId: z.number().int().positive(),
  showName: z.string().min(1).max(300),
  network: z.string().max(120).nullable().optional(),
  airstamp: z.string().min(1),
  url: z.string().max(500).nullable().optional(),
});

function migrationHint(err: { code?: string; message?: string }): string | null {
  if (err.code === '42P01' || /tv_reminders/.test(err.message ?? '')) {
    return 'Reminders need migration 0013 applied to the database first.';
  }
  return null;
}

/** Ask to be notified 60 min & 5 min before a broadcast. */
export async function setTvReminder(input: z.infer<typeof schema>): Promise<ReminderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid reminder.' };
  const v = parsed.data;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Please sign in first.' };

    // Don't bother reminding for something already in the past.
    if (Date.parse(v.airstamp) < Date.now()) return { ok: false, error: 'That already aired.' };

    const { error } = await supabase.from('tv_reminders').upsert(
      {
        user_id: user.id,
        airing_id: v.airingId,
        show_name: v.showName,
        network: v.network ?? null,
        airstamp: new Date(v.airstamp).toISOString(),
        url: v.url ?? null,
        notify_60: false,
        notify_5: false,
      },
      { onConflict: 'user_id,airing_id' },
    );
    if (error) return { ok: false, error: migrationHint(error) ?? error.message };

    // Let the UI nudge them to turn on notifications if no device is registered.
    const { count } = await supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return { ok: true, needsNotifications: (count ?? 0) === 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not set the reminder.' };
  }
}

/** Cancel a reminder. */
export async function removeTvReminder(airingId: number): Promise<ReminderResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Please sign in first.' };
    const { error } = await supabase.from('tv_reminders').delete().eq('user_id', user.id).eq('airing_id', airingId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not cancel.' };
  }
}
