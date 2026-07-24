import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Live Court health probe. Reports whether THIS deployment can actually run Court:
 * env present, Supabase reachable, schema/migration applied. Returns booleans and a
 * NON-SECRET Supabase project ref (hostname only) — never keys, tokens, or row data.
 * Used by the diagnostics panel and to precisely distinguish "config missing" vs
 * "migration missing" vs "reachable".
 */
export async function GET() {
  const out: Record<string, unknown> = {
    ok: false,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    build: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    deploymentOrigin: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    supabaseConfigured: false,
    supabaseRef: null as string | null,
    reachable: false,
    schema: null as unknown,
    error: null as string | null,
  };

  // Config presence (no secret values, only project ref host).
  let url = '';
  try {
    url = publicEnv.supabaseUrl();
    out.supabaseConfigured = true;
    try { out.supabaseRef = new URL(url).hostname.split('.')[0] ?? null; } catch { /* ignore */ }
    // Access the key only to confirm presence — never returned.
    publicEnv.supabasePublishableKey();
  } catch {
    out.error = 'config-missing';
    return NextResponse.json(out, { status: 200 });
  }

  // Probe the schema via the secretless RPC.
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('court_health');
    if (error) {
      out.reachable = true; // we reached Postgres, the function is just missing
      out.error = error.code === '42883' ? 'migration-missing' : `db-error:${error.code ?? 'unknown'}`;
      return NextResponse.json(out, { status: 200 });
    }
    out.reachable = true;
    out.schema = data;
    out.ok = Boolean((data as { ok?: boolean } | null)?.ok);
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    out.error = 'connection-failed';
    void e;
    return NextResponse.json(out, { status: 200 });
  }
}
