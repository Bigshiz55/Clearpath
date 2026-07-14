import { NextResponse } from 'next/server';
import { serverEnv, ConfigError } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { runDailyScan } from '@/lib/digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily new-release scan. Intended to be invoked by Vercel Cron (see vercel.json).
 * Protected by CRON_SECRET: the caller must send `Authorization: Bearer <secret>`
 * (Vercel Cron does this automatically when CRON_SECRET is set) or `?key=<secret>`.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: 'Daily scan is not configured (missing CRON_SECRET).' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const summary = await runDailyScan(admin);
    return NextResponse.json({ ok: true, ...summary, ranAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof ConfigError) {
      return NextResponse.json({ error: e.userMessage }, { status: 503 });
    }
    return NextResponse.json({ error: 'Scan failed.' }, { status: 500 });
  }
}
