import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ReminderRow {
  id: string;
  user_id: string;
  airing_id: number;
  show_name: string;
  network: string | null;
  airstamp: string;
  url: string | null;
}

const MIN = 60_000;

/**
 * Fires live-TV reminders. Meant to run every ~5 minutes (Vercel Cron / any
 * external pinger). Sends a web push ~60 min and ~5 min before airtime, using
 * generous windows so a 5-minute cadence never misses one, and idempotent flags
 * so nothing double-fires. Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret) return NextResponse.json({ error: 'Not configured (missing CRON_SECRET).' }, { status: 503 });
  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  try {
    const admin = createAdminClient();
    let sent60 = 0;
    let sent5 = 0;

    // --- 60-minute reminders: airing in ~55–66 min, not yet sent. ---
    const { data: due60 } = await admin
      .from('tv_reminders')
      .select('id, user_id, airing_id, show_name, network, airstamp, url')
      .eq('notify_60', false)
      .gte('airstamp', iso(now + 55 * MIN))
      .lte('airstamp', iso(now + 66 * MIN));
    for (const r of (due60 as ReminderRow[] | null) ?? []) {
      await sendPushToUser(admin, r.user_id, {
        title: '📺 Starts in 1 hour',
        body: `${r.show_name}${r.network ? ` on ${r.network}` : ''} starts in about an hour.`,
        url: r.url ?? '/app/tv',
        tag: `tv-60-${r.airing_id}`,
      });
      await admin.from('tv_reminders').update({ notify_60: true }).eq('id', r.id);
      sent60++;
    }

    // --- 5-minute reminders: airing in ~2–8 min, not yet sent. ---
    const { data: due5 } = await admin
      .from('tv_reminders')
      .select('id, user_id, airing_id, show_name, network, airstamp, url')
      .eq('notify_5', false)
      .gte('airstamp', iso(now + 2 * MIN))
      .lte('airstamp', iso(now + 8 * MIN));
    for (const r of (due5 as ReminderRow[] | null) ?? []) {
      await sendPushToUser(admin, r.user_id, {
        title: '📺 Starts in 5 minutes',
        body: `${r.show_name}${r.network ? ` on ${r.network}` : ''} is about to start — grab the remote!`,
        url: r.url ?? '/app/tv',
        tag: `tv-5-${r.airing_id}`,
      });
      await admin.from('tv_reminders').update({ notify_5: true }).eq('id', r.id);
      sent5++;
    }

    // --- Cleanup: drop reminders more than 2 hours past airtime. ---
    await admin.from('tv_reminders').delete().lt('airstamp', iso(now - 120 * MIN));

    return NextResponse.json({ ok: true, sent60, sent5, ranAt: iso(now) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Reminder run failed.' }, { status: 500 });
  }
}
