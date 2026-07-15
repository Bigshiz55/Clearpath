import 'server-only';
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serverEnv, publicEnv } from '@/lib/env';

let configured = false;

/** Configure web-push with VAPID keys once. Returns false if keys are unset. */
export function pushConfigured(): boolean {
  const pub = publicEnv.vapidPublicKey();
  const priv = serverEnv.vapidPrivateKey();
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(serverEnv.vapidSubject(), pub, priv);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a push to every device a user has registered. Prunes subscriptions the
 * push service reports as gone (404/410). No-op (returns 0) when VAPID isn't set.
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!pushConfigured()) return 0;
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  const subs = (data as SubRow[] | null) ?? [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e) {
        const status =
          e && typeof e === 'object' && 'statusCode' in e ? (e as { statusCode?: number }).statusCode : undefined;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }),
  );
  return sent;
}
