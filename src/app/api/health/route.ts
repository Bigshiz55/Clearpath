import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { envHealth, publicEnv, serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Guest-access probe: can a link-only visitor actually get in? The app mints an
 * anonymous "guest" session in middleware for anyone without an account — but
 * that only works if "Anonymous sign-ins" is enabled in the Supabase project.
 * This runs a real anonymous sign-in (with throwaway cookies) and reports
 * whether it succeeded, so "my friends get kicked to login" is a one-request
 * diagnosis. No secrets returned.
 */
/**
 * SCHEMA PROBE — which Court migrations are actually live in this environment.
 * Calls each RPC harmlessly (a room code that cannot exist) and classifies the
 * response: a "does not exist" error means the migration has NOT been applied.
 * Reports existence only — never data, never secrets — so a deploy can be
 * verified from the browser without database credentials.
 */
async function probeSchema() {
  const NO_SUCH_ROOM = '__schema_probe__';
  const rpcs: { fn: string; migration: string; args: Record<string, unknown> }[] = [
    { fn: 'court_state', migration: '0004_court', args: { p_code: NO_SUCH_ROOM } },
    { fn: 'court_set_picks', migration: '0014_court_search', args: { p_code: NO_SUCH_ROOM, p_participant: '00000000-0000-0000-0000-000000000000', p_picks: [] } },
    { fn: 'court_state_v2', migration: '0026_court_v2', args: { p_code: NO_SUCH_ROOM } },
    { fn: 'court_set_tonight', migration: '0026_court_v2', args: { p_code: NO_SUCH_ROOM, p_participant: '00000000-0000-0000-0000-000000000000', p_tonight: {}, p_ready: false } },
    { fn: 'court_react', migration: '0026_court_v2', args: { p_code: NO_SUCH_ROOM, p_participant: '00000000-0000-0000-0000-000000000000', p_key: 'x', p_reaction: 'for', p_reason: '' } },
    { fn: 'court_chat_send', migration: '0026_court_v2', args: { p_code: NO_SUCH_ROOM, p_participant: '00000000-0000-0000-0000-000000000000', p_body: '' } },
    { fn: 'court_set_size', migration: '0030_court_size', args: { p_code: NO_SUCH_ROOM, p_host_token: 'probe', p_size: 'standard' } },
    { fn: 'court_claim_host', migration: '0030_court_size', args: { p_code: NO_SUCH_ROOM, p_host_token: 'probe', p_participant: '00000000-0000-0000-0000-000000000000' } },
  ];
  try {
    const supabase = createServerClient(publicEnv.supabaseUrl(), publicEnv.supabasePublishableKey(), {
      cookies: { getAll: () => [], setAll: () => {} },
    });
    const results: Record<string, boolean> = {};
    for (const r of rpcs) {
      const { error } = await supabase.rpc(r.fn, r.args);
      // PostgREST reports an absent function with PGRST202 / "Could not find the
      // function". Any other error (e.g. "Room not found") proves it EXISTS.
      const missing = error?.code === 'PGRST202' || /could not find the function|does not exist/i.test(error?.message ?? '');
      results[r.fn] = !missing;
    }
    const applied = (m: string) => rpcs.filter((r) => r.migration === m).every((r) => results[r.fn]);
    return {
      rpcs: results,
      migrations: {
        '0004_court': applied('0004_court'),
        '0014_court_search': applied('0014_court_search'),
        '0026_court_v2': applied('0026_court_v2'),
        '0030_court_size': applied('0030_court_size'),
      },
      courtV2Ready: applied('0026_court_v2'),
      // 0030 is independent of 0026 — it only needs 0004 — so it is reported
      // separately rather than folded into a single ready flag.
      hostSizeReady: applied('0030_court_size'),
      hint: [
        applied('0026_court_v2')
          ? 'Court v2 is live: group chat, tonight setup, reactions and late join are available.'
          : 'Apply supabase/migrations/0026_court_v2.sql — until then the Court falls back to the v1 snapshot (no chat, tonight setup, reactions or late join).',
        applied('0030_court_size')
          ? 'Host-controlled court size is live: the room stores the setting and members see it read-only.'
          : 'Apply supabase/migrations/0030_court_size.sql — until then every court uses the Standard 12 and the host cannot change it.',
      ].join(' '),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function probeGuest() {
  try {
    const supabase = createServerClient(publicEnv.supabaseUrl(), publicEnv.supabasePublishableKey(), {
      cookies: { getAll: () => [], setAll: () => {} },
    });
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      return { anonEnabled: false, ok: false, error: error.message, hint: 'Enable Authentication → Sign In / Providers → “Allow anonymous sign-ins” in Supabase.' };
    }
    return { anonEnabled: true, ok: Boolean(data.user), userIsAnonymous: data.user?.is_anonymous ?? null };
  } catch (e) {
    return { anonEnabled: false, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

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

/** Live OMDb probe — confirms the deployment's key is clean and activated. */
async function probeOmdb() {
  const raw = process.env.OMDB_API_KEY ?? '';
  // eslint-disable-next-line no-control-regex
  const key = raw.trim().replace(/[^\x20-\x7E]/g, '');
  const shape = { rawLength: raw.length, cleanedLength: key.length, strippedChars: raw.trim().length - key.length };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=tt1392214`, {
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      Response?: string;
      Error?: string;
      imdbRating?: string;
      Ratings?: { Source: string; Value: string }[];
    };
    return {
      shape,
      ok: body.Response === 'True',
      imdbRating: body.imdbRating ?? null,
      ratings: body.Ratings ?? null,
      omdbError: body.Error ?? null,
    };
  } catch (e) {
    return { shape, ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Live Watchmode probe — confirms the deployment's key works and returns sources. */
async function probeWatchmode() {
  const raw = process.env.WATCHMODE_API_KEY ?? '';
  // eslint-disable-next-line no-control-regex
  const key = raw.trim().replace(/[^\x20-\x7E]/g, '');
  const shape = { rawLength: raw.length, cleanedLength: key.length, strippedChars: raw.trim().length - key.length };
  if (!key) return { shape, ok: false, error: 'WATCHMODE_API_KEY not set' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL('https://api.watchmode.com/v1/title/movie-278/details/');
    url.searchParams.set('apiKey', key);
    url.searchParams.set('append_to_response', 'sources');
    const res = await fetch(url, { signal: controller.signal });
    const body = (await res.json().catch(() => ({}))) as { sources?: unknown[]; success?: boolean; statusMessage?: string };
    const usSources = Array.isArray(body.sources)
      ? (body.sources as { region?: string }[]).filter((s) => (s.region ?? '').toUpperCase() === 'US').length
      : 0;
    return { shape, ok: res.ok && Array.isArray(body.sources), httpStatus: res.status, usSources, watchmodeMessage: body.statusMessage ?? null };
  } catch (e) {
    return { shape, ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health endpoint. Reports readiness of each dependency by *presence* of
 * configuration only — never returns secret values. `?probe=tmdb` / `?probe=omdb`
 * / `?probe=watchmode` additionally run a live request and report the outcome.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
    // Founder-access probe. Reports whether ADMIN_EMAILS is configured and how
  // many entries it has — NEVER the addresses themselves, and never whether a
  // particular address is on the list, which would make this an oracle for
  // enumerating admins.
  if (searchParams.get('probe') === 'founder') {
    const admins = serverEnv.adminEmails();
    // Shape-only validation. An entry with two "@" is almost always two pasted
    // addresses that got fused; one with none is not an address at all. Both
    // leave the list looking populated while matching nobody, so the count
    // alone is not enough to trust.
    const malformed = admins.filter((e) => (e.match(/@/g) ?? []).length !== 1).length;
    return NextResponse.json({
      probe: 'founder',
      result: {
        adminEmailsConfigured: admins.length > 0,
        adminEmailCount: admins.length,
        malformedEntries: malformed,
        hint: admins.length === 0
          ? 'ADMIN_EMAILS is EMPTY — /founder/recommendation-lab will 404 for everyone, including you. Set it in Vercel and redeploy.'
          : malformed > 0
            ? `${malformed} entr${malformed === 1 ? 'y does' : 'ies do'} not look like a single email address — usually two addresses fused together. Re-enter one per line or comma-separated, then redeploy.`
            : 'ADMIN_EMAILS is set and every entry is well-formed. Sign in, then open /api/founder/self-check to confirm YOUR address is the one on the list.',
      },
    }, { headers: { 'cache-control': 'no-store' } });
  }

  if (searchParams.get('probe') === 'tmdb') {
    return NextResponse.json(
      { probe: 'tmdb', result: await probeTmdb() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (searchParams.get('probe') === 'omdb') {
    return NextResponse.json(
      { probe: 'omdb', result: await probeOmdb() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (searchParams.get('probe') === 'watchmode') {
    return NextResponse.json(
      { probe: 'watchmode', result: await probeWatchmode() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (searchParams.get('probe') === 'guest') {
    return NextResponse.json(
      { probe: 'guest', result: await probeGuest() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  // Schema probe: reports which Court migrations are live in THIS environment,
  // so a deploy can be verified without database credentials. Publicly safe —
  // it only reports whether named RPCs exist, never any data.
  if (searchParams.get('probe') === 'schema') {
    return NextResponse.json(
      { probe: 'schema', result: await probeSchema() },
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
        mdblist_key: cfg.mdblistKey,
        watchmode_key: cfg.watchmodeKey,
        cron_secret: cfg.cronSecret,
        resend_key: cfg.resendKey,
        migrate_secret: cfg.migrateSecret,
        migrations_db_url: cfg.migrationsDbUrl,
      },
      features: {
        auth: cfg.supabaseUrl && cfg.supabasePublishableKey,
        verdicts: cfg.tmdbKey,
        account_deletion: cfg.serviceRoleKey,
        ai_prose: cfg.openaiKey,
        critic_ratings: cfg.omdbKey,
        daily_digest: cfg.cronSecret && cfg.serviceRoleKey && cfg.tmdbKey,
        digest_email: cfg.resendKey,
        admin_migrations: cfg.migrateSecret && cfg.migrationsDbUrl,
      },
    },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
