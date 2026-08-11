import { NextResponse } from 'next/server';
import { getGuideProviderHealth, providerLicensingNotes } from '@/lib/tv/providerRegistry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PER-PROVIDER GUIDE HEALTH — the answer to "can the guide claim a full grid",
 * with the evidence attached.
 *
 * Separate from `/api/health/tv` rather than folded into it: that payload
 * reports INGEST RUNS (did the job execute, did the lock hold), and this one
 * reports CONTRACT AND CAPABILITY (may we call this source, is it even the kind
 * of source that can evidence a schedule). Both are true at once and mean
 * different things — the whole class of bug this shipped to fix came from
 * reading one as the other.
 *
 * Public and unauthenticated, like the other health routes, so it carries no
 * secrets by construction: env vars are reported as NAMES in the registry and
 * their values are never read into the payload. `no-store` because a cached
 * health answer is a wrong health answer.
 */
export async function GET() {
  try {
    const health = await getGuideProviderHealth();
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        /* THE HEADLINE, FIRST. An operator should not have to infer this from
           a provider array — "partial_listings" is what the guide is entitled
           to say right now, and the reasons below say why. */
        claim: health.claim,
        hasLicensedLinearGrid: health.hasLicensedLinearGrid,
        degradedReasons: health.degradedReasons,
        providers: health.providers,
        licensing: providerLicensingNotes(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    // Health must answer even when a dependency is down; a 500 here would be
    // indistinguishable from the app being down.
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        claim: 'partial_listings',
        hasLicensedLinearGrid: false,
        degradedReasons: ['Provider health could not be assembled.'],
        error: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
        providers: [],
        licensing: providerLicensingNotes(),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
