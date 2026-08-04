import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCardAvailability } from '@/lib/watchmode/cardAvailability';
import { refreshOneTitle, refreshCapability } from '@/lib/watchmode/sync';
import { recordReliabilityEvent } from '@/lib/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * THE THING BEHIND "CHECK AVAILABILITY".
 *
 * The card's primary action used to be a button with `href=null` — it looked
 * pressable and did nothing. This route is what makes the label true: a real
 * server-side refresh of ONE title against the authorized availability source,
 * returning the fresh answer for the panel to show.
 *
 * GET is a capability probe that spends nothing, so the card can label the
 * button honestly BEFORE it is pressed. When a refresh is impossible the card
 * says "Notify me when confirmed" instead of offering a check it cannot run.
 *
 * The API key never leaves the server; the browser sends a title id and gets
 * back availability, and nothing else.
 */

// Watchmode's free tier is small and this is the only path a visitor can
// trigger, so it is deliberately tighter than a human would ever need.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

/** Same-origin only — this route is called by our own cards, never elsewhere. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const Body = z.object({
  mediaType: z.enum(['movie', 'tv']),
  tmdbId: z.number().int().positive(),
});

export async function GET() {
  try {
    const cap = await refreshCapability(createAdminClient());
    return NextResponse.json(cap, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Unable to even ask means unable to refresh. Reported as unavailable
    // rather than surfaced as an error, because the card's only decision is
    // which of two honest labels to render.
    return NextResponse.json({ available: false, reason: 'store_failed' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not accepted.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { mediaType, tmdbId } = parsed.data;

  // Keyed by title, not by caller: the cost being protected is Watchmode's
  // per-title call, and an unauthenticated visitor has no stable identity to
  // key on anyway.
  if (rateLimited(`${mediaType}:${tmdbId}`)) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited', message: 'Just checked this one — try again in a minute.' },
      { status: 429 },
    );
  }

  const admin = createAdminClient();
  const result = await refreshOneTitle(admin, tmdbId, mediaType).catch(
    () => ({ ok: false, reason: 'store_failed' as const }),
  );

  void recordReliabilityEvent('availability_resolution_failure', {
    action: 'on_demand_refresh',
    mediaType,
    ok: result.ok,
    reason: result.reason ?? 'none',
  });

  // Read back through the SAME function every card uses, so the panel and the
  // card can never disagree about what was found.
  const availability = await getCardAvailability(mediaType, tmdbId).catch(() => null);

  return NextResponse.json(
    { ok: result.ok, reason: result.reason ?? null, availability },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
