import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { serverEnv } from '@/lib/env';
import { getBuildInfo } from '@/lib/buildInfo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * WHICH SERVING MODE IS ACTUALLY DEPLOYED — presence only, never values.
 *
 * `serverEnv.aiDiscoveryMode()` falls back to `'legacy'` when the variable is
 * absent, so reading the source tells you the DEFAULT and nothing about what is
 * configured. That distinction matters: the UI is branded AI Search, and
 * whether it is served by the AI path or the deterministic parser is not a
 * question anyone should have to answer by guessing.
 *
 * WHAT THIS MAY RETURN. A mode name, and booleans. Never a key, never a prefix,
 * never a length, never a suffix, never a masked or partial value — each of
 * those narrows a search space, and "it starts with sk-" plus a length is
 * meaningfully more than nothing. `present: true` is the entire useful signal:
 * it distinguishes "not configured" from "configured", which is the only
 * question this endpoint exists to settle.
 *
 * ADMIN ONLY. Configuration shape is not user data, but it is a map of what is
 * wired up and what is not, and that belongs behind the same gate as everything
 * else under `/admin`.
 *
 * TEMPORARY. Added to resolve one production question. Delete it once the
 * answer is recorded, unless it is deliberately promoted to a permanent admin
 * surface — an ungated-forever diagnostic is how a debugging aid becomes an
 * information-disclosure surface nobody remembers adding.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) {
    // 404, not 403: an unauthorised caller learns nothing, not even that the
    // route exists.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  /** Configured-or-not. Deliberately the only shape a secret may be reported in. */
  const present = (read: () => string | undefined): boolean => {
    try {
      const v = read();
      return typeof v === 'string' && v.trim().length > 0;
    } catch {
      return false;
    }
  };

  const info = getBuildInfo();

  return NextResponse.json(
    {
      aiDiscoveryMode: serverEnv.aiDiscoveryMode(),
      anthropicKeyPresent: present(() => process.env.ANTHROPIC_API_KEY),
      openaiKeyPresent: present(() => process.env.OPENAI_API_KEY),
      tmdbKeyPresent: present(() => process.env.TMDB_API_KEY),
      supabaseUrlPresent: present(() => process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabasePublishableKeyPresent: present(
        () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
      supabaseServiceRoleKeyPresent: present(() => process.env.SUPABASE_SERVICE_ROLE_KEY),
      vercelEnv: process.env.VERCEL_ENV ?? 'development',
      buildSha: info.gitSha ?? null,
      buildBranch: info.gitBranch ?? null,
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
