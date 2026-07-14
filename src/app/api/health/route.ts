import { NextResponse } from 'next/server';
import { envHealth } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Health endpoint. Reports readiness of each dependency by *presence* of
 * configuration only — never returns secret values.
 */
export async function GET() {
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
      },
      features: {
        auth: cfg.supabaseUrl && cfg.supabasePublishableKey,
        verdicts: cfg.tmdbKey,
        account_deletion: cfg.serviceRoleKey,
        ai_prose: cfg.openaiKey,
      },
    },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
