'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/lib/push';

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
  if (err.code === '42P01' || /push_subscriptions/.test(err.message ?? '')) {
    return 'Notifications need migration 0008 applied to the database first.';
  }
  return null;
}

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
});

export async function savePushSubscription(input: z.infer<typeof subSchema>): Promise<ActionResult> {
  const parsed = subSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid subscription.' };
  const v = parsed.data;
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    // Replace any existing row for this endpoint (keys can rotate), then insert.
    await supabase.from('push_subscriptions').delete().eq('endpoint', v.endpoint);
    const { error } = await supabase.from('push_subscriptions').insert({
      user_id: user.id,
      endpoint: v.endpoint,
      p256dh: v.keys.p256dh,
      auth: v.keys.auth,
    });
    if (error && error.code !== '23505') {
      return { ok: false, error: migrationHint(error) ?? error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!z.string().url().safeParse(endpoint).success) return { ok: false, error: 'Invalid.' };
  try {
    const supabase = createClient();
    await requireUser(supabase);
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) return { ok: false, error: migrationHint(error) ?? error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

export async function sendTestPush(): Promise<ActionResult> {
  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const sent = await sendPushToUser(supabase, user.id, {
      title: 'WatchVrdIQt',
      body: '🍿 Notifications are on — this is your test. Stop scrolling, get rolling.',
      url: '/app',
      tag: 'wv-test',
    });
    if (sent === 0) {
      return { ok: false, error: 'No active subscription, or push isn’t configured on the server yet (VAPID keys).' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}
