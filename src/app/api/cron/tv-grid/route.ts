import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { refreshTvGrid } from '@/lib/tvGrid';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Hourly refresh of the cached national TV grid (`tv_grid`) from Gracenote, so
 * every request reads listings from our own DB instead of hitting Gracenote.
 * Triggered by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`
 * when CRON_SECRET is set) or a GitHub Action / manual call with `?key=`.
 * Protected by CRON_SECRET; a no-op response until that + the service-role key
 * and migration 0022 are in place.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret) return NextResponse.json({ error: 'Not configured (missing CRON_SECRET).' }, { status: 503 });
  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await refreshTvGrid();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
