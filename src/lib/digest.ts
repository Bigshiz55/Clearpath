import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TitleMetadata } from '@/lib/types';
import { discoverRecent, getTitle } from '@/lib/tmdb/client';
import { buildVerdict } from '@/lib/scoring';
import { normalizeRule, DEFAULT_NEW_USER_RULES } from '@/lib/scoring/preferences';
import { personalLabelFor } from '@/lib/profile';
import { sendPushToUser } from '@/lib/push';
import type { PreferenceRule } from '@/lib/types';

const CANDIDATE_LIMIT = 30;
const PER_USER_LIMIT = 15;

/** Fetch and fully hydrate recent-release candidates once (shared across users). */
export async function getCandidates(region = 'US'): Promise<TitleMetadata[]> {
  const discovered = await discoverRecent(region);
  const picked = discovered.slice(0, CANDIDATE_LIMIT);
  const metas = await Promise.all(
    picked.map((d) => getTitle(d.mediaType, d.id, region).catch(() => null)),
  );
  return metas.filter((m): m is TitleMetadata => m !== null);
}

interface DigestProfile {
  id: string;
  region: string;
  digest_min_score: number;
  personal_label: string | null;
  display_name: string | null;
  liked_franchise_ids: number[] | null;
}

async function rulesFor(supabase: SupabaseClient, userId: string): Promise<PreferenceRule[]> {
  const { data } = await supabase
    .from('preference_rules')
    .select('id, trait, weight, requires_defining, label')
    .eq('user_id', userId);
  if (!data || data.length === 0) return DEFAULT_NEW_USER_RULES;
  const rules = data
    .map((r) =>
      normalizeRule({
        trait: r.trait as PreferenceRule['trait'],
        weight: r.weight as number,
        requiresDefining: r.requires_defining as boolean,
        label: (r.label as string | null) ?? undefined,
      }),
    )
    .filter((r): r is PreferenceRule => r !== null);
  return rules.length > 0 ? rules : DEFAULT_NEW_USER_RULES;
}

export interface ScanUserResult {
  userId: string;
  matches: number;
  /** Matches that weren't already in the user's digest — what's worth notifying. */
  newMatches: number;
}

/** Score shared candidates against one user's preferences and store matches. */
export async function scanUser(
  admin: SupabaseClient,
  profile: DigestProfile,
  candidates: TitleMetadata[],
): Promise<ScanUserResult> {
  const rules = await rulesFor(admin, profile.id);
  const label = personalLabelFor({ personal_label: profile.personal_label, display_name: profile.display_name });
  const likedFranchiseIds = profile.liked_franchise_ids ?? [];
  const min = profile.digest_min_score ?? 72;

  // Respect prior dismissals — never resurface a title the user cleared.
  const { data: dismissedRows } = await admin
    .from('digest_items')
    .select('tmdb_id, media_type')
    .eq('user_id', profile.id)
    .eq('dismissed', true);
  const dismissed = new Set((dismissedRows ?? []).map((r) => `${r.media_type}-${r.tmdb_id}`));

  // Already-surfaced (non-dismissed) items, so we only count what's genuinely new.
  const { data: existingRows } = await admin
    .from('digest_items')
    .select('tmdb_id, media_type')
    .eq('user_id', profile.id)
    .eq('dismissed', false);
  const existing = new Set((existingRows ?? []).map((r) => `${r.media_type}-${r.tmdb_id}`));

  const rows: Array<Record<string, unknown>> = [];
  for (const meta of candidates) {
    if (dismissed.has(`${meta.mediaType}-${meta.id}`)) continue;
    const report = buildVerdict({
      meta,
      providers: null,
      personal: { label, rules, likedFranchiseIds, collectionId: null },
    });
    if (report.personal.score < min) continue;
    const topPos = report.personal.adjustments.find((a) => a.points > 0);
    rows.push({
      user_id: profile.id,
      tmdb_id: meta.id,
      media_type: meta.mediaType,
      title: meta.title,
      year: meta.year,
      poster_path: meta.posterPath,
      personal_score: report.personal.score,
      tier: report.tier,
      primary_call: report.primaryCall,
      reason: topPos ? topPos.label : report.oneLiner,
      release_date: null,
    });
  }

  rows.sort((a, b) => (b.personal_score as number) - (a.personal_score as number));
  const top = rows.slice(0, PER_USER_LIMIT);
  const newMatches = top.filter((t) => !existing.has(`${t.media_type}-${t.tmdb_id}`)).length;
  if (top.length > 0) {
    await admin.from('digest_items').upsert(top, { onConflict: 'user_id,tmdb_id,media_type' });
  }
  return { userId: profile.id, matches: top.length, newMatches };
}

export interface DailyScanSummary {
  candidates: number;
  usersScanned: number;
  totalMatches: number;
  notified?: number;
}

/** Full daily scan across all opted-in users. Uses the admin (service-role) client. */
export async function runDailyScan(admin: SupabaseClient): Promise<DailyScanSummary> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, region, digest_min_score, personal_label, display_name, liked_franchise_ids')
    .eq('daily_digest', true)
    .eq('onboarding_complete', true);

  const list = (profiles as DigestProfile[] | null) ?? [];
  if (list.length === 0) return { candidates: 0, usersScanned: 0, totalMatches: 0 };

  // Fetch candidates per distinct region (most users share one).
  const regions = Array.from(new Set(list.map((p) => p.region || 'US')));
  const byRegion = new Map<string, TitleMetadata[]>();
  await Promise.all(
    regions.map(async (r) => {
      byRegion.set(r, await getCandidates(r).catch(() => []));
    }),
  );

  let total = 0;
  let candidateCount = 0;
  let notified = 0;
  byRegion.forEach((c) => (candidateCount += c.length));
  for (const profile of list) {
    const candidates = byRegion.get(profile.region || 'US') ?? [];
    if (candidates.length === 0) continue;
    const res = await scanUser(admin, profile, candidates);
    total += res.matches;
    // Push only when there's something genuinely new — never daily spam.
    if (res.newMatches > 0) {
      const n = res.newMatches;
      const sent = await sendPushToUser(admin, profile.id, {
        title: 'New for you on WatchVrdikt',
        body: `${n} new pick${n === 1 ? '' : 's'} that fit your taste just landed.`,
        url: '/app',
        tag: 'wv-digest',
      }).catch(() => 0);
      if (sent > 0) notified += 1;
    }
  }

  return { candidates: candidateCount, usersScanned: list.length, totalMatches: total, notified };
}
