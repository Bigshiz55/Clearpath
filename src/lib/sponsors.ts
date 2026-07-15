import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Judge {
  id: string;
  name: string;
  judgeName: string;
  tagline: string | null;
  emoji: string | null;
  accent: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  /** Human label like "5% off". The actual code is revealed only on claim. */
  discountLabel: string | null;
  scope: string;
}

interface SponsorRow {
  id: string;
  name: string;
  judge_name: string;
  tagline: string | null;
  emoji: string | null;
  accent: string | null;
  cta_label: string | null;
  cta_url: string | null;
  discount_label: string | null;
  scope: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
  starts_at: string | null;
  ends_at: string | null;
}

function toJudge(r: SponsorRow): Judge {
  return {
    id: r.id,
    name: r.name,
    judgeName: r.judge_name,
    tagline: r.tagline,
    emoji: r.emoji,
    accent: r.accent,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url,
    discountLabel: r.discount_label,
    scope: r.scope,
  };
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface JudgeContext {
  region?: string;
  lat?: number;
  lng?: number;
  nowMs: number;
}

/**
 * Pick the presiding sponsor for this user: a nearby local sponsor (within its
 * radius, nearest wins) beats a region sponsor, which beats a national one.
 * NOTE: this only chooses who *brands the frame and offers a coupon* — it is
 * never consulted by the scoring engine, so the verdict is identical with or
 * without a sponsor.
 */
export async function getActiveJudge(
  supabase: SupabaseClient,
  ctx: JudgeContext,
): Promise<Judge | null> {
  const { data, error } = await supabase
    .from('sponsors')
    .select(
      'id, name, judge_name, tagline, emoji, accent, cta_label, cta_url, discount_label, scope, region, lat, lng, radius_km, starts_at, ends_at',
    )
    .eq('active', true);
  if (error || !data) return null;

  const nowIso = new Date(ctx.nowMs).toISOString();
  const live = (data as SponsorRow[]).filter(
    (r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso),
  );

  // Local: within radius, nearest first.
  if (ctx.lat != null && ctx.lng != null) {
    const local = live
      .filter((r) => r.scope === 'local' && r.lat != null && r.lng != null && r.radius_km != null)
      .map((r) => ({ r, d: haversineKm(ctx.lat!, ctx.lng!, r.lat!, r.lng!) }))
      .filter((x) => x.d <= (x.r.radius_km ?? 0))
      .sort((a, b) => a.d - b.d);
    if (local.length > 0) return toJudge(local[0]!.r);
  }

  // Region match.
  if (ctx.region) {
    const region = live.find((r) => r.scope === 'region' && r.region === ctx.region);
    if (region) return toJudge(region);
  }

  // National fallback.
  const national = live.find((r) => r.scope === 'national');
  return national ? toJudge(national) : null;
}
