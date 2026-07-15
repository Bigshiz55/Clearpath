import { NextResponse } from 'next/server';
import { envHealth } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Live TMDB connectivity probe. Never returns the key — only its shape and the
 * outcome of one real request, so we can diagnose "could not reach" failures.
 */
async function probeTmdb() {
  const raw = process.env.TMDB_API_KEY ?? '';
  // Mirror env.ts cleaning: strip whitespace and non-ASCII (e.g. mask bullets).
  // eslint-disable-next-line no-control-regex
  const key = raw.trim().replace(/[^\x20-\x7E]/g, '');
  const shape = {
    rawLength: raw.length,
    cleanedLength: key.length,
    strippedChars: raw.trim().length - key.length,
    looksLikeV4Token: key.startsWith('ey'),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const url = new URL('https://api.themoviedb.org/3/search/movie');
  url.searchParams.set('query', 'prisoners');
  if (key.startsWith('ey')) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const body = (await res.json().catch(() => ({}))) as {
      total_results?: number;
      status_message?: string;
    };
    return {
      shape,
      reachable: true,
      httpStatus: res.status,
      totalResults: body.total_results ?? null,
      tmdbMessage: body.status_message ?? null,
    };
  } catch (e) {
    return {
      shape,
      reachable: false,
      errorName: e instanceof Error ? e.name : 'Unknown',
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health endpoint. Reports readiness of each dependency by *presence* of
 * configuration only — never returns secret values. `?probe=tmdb` additionally
 * runs a live TMDB request and reports the outcome (no secrets).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('probe') === 'tmdb') {
    return NextResponse.json(
      { probe: 'tmdb', result: await probeTmdb() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cfg = envHealth();
  const ready = cfg.supabaseUrl && cfg.supabasePublishableKey && cfg.tmdbKey;

  return NextResponse.json(
    {
      status: ready ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      checks: {
        supabase_url: cfg.supabaseUrl,
        supabase_publishable_key: cfg.supabasePublishableKey,
        tmdb_key: cfg.tmdbKey,
        service_role_key: cfg.serviceRoleKey,
        openai_key: cfg.openaiKey,
        omdb_key: cfg.omdbKey,
        cron_secret: cfg.cronSecret,
        resend_key: cfg.resendKey,
      },
      features: {
        auth: cfg.supabaseUrl && cfg.supabasePublishableKey,
        verdicts: cfg.tmdbKey,
        account_deletion: cfg.serviceRoleKey,
        ai_prose: cfg.openaiKey,
        critic_ratings: cfg.omdbKey,
        daily_digest: cfg.cronSecret && cfg.serviceRoleKey && cfg.tmdbKey,
        digest_email: cfg.resendKey,
      },
    },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
