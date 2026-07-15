import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, VerdictTier } from '@/lib/types';

export interface FeedVerdict {
  userId: string;
  username: string | null;
  displayName: string | null;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  personalScore: number;
  tier: VerdictTier;
  createdAt: string;
}

export interface PublicProfile {
  userId: string;
  username: string | null;
  displayName: string | null;
  personalLabel: string | null;
  publicActivity: boolean;
  isSelf: boolean;
  isFollowing: boolean;
  verdicts: FeedVerdict[];
  loves: string[];
}

/** True when the error means migration 0007 hasn't been applied yet. */
function isMissingMigration(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42883' || /get_public_profile|get_following_feed|public_activity|follows/.test(err.message ?? '');
}

export type ProfileResult =
  | { kind: 'ok'; profile: PublicProfile }
  | { kind: 'not_found' }
  | { kind: 'needs_migration' };

export async function getPublicProfile(
  supabase: SupabaseClient,
  username: string,
): Promise<ProfileResult> {
  const { data, error } = await supabase.rpc('get_public_profile', { uname: username });
  if (error) {
    if (isMissingMigration(error)) return { kind: 'needs_migration' };
    return { kind: 'not_found' };
  }
  if (!data) return { kind: 'not_found' };
  const d = data as Record<string, unknown>;
  const rawV = Array.isArray(d.verdicts) ? (d.verdicts as Record<string, unknown>[]) : [];
  return {
    kind: 'ok',
    profile: {
      userId: d.user_id as string,
      username: (d.username as string | null) ?? null,
      displayName: (d.display_name as string | null) ?? null,
      personalLabel: (d.personal_label as string | null) ?? null,
      publicActivity: Boolean(d.public_activity),
      isSelf: Boolean(d.is_self),
      isFollowing: Boolean(d.is_following),
      loves: Array.isArray(d.loves) ? (d.loves as string[]) : [],
      verdicts: rawV.map((v) => ({
        userId: d.user_id as string,
        username: (d.username as string | null) ?? null,
        displayName: (d.display_name as string | null) ?? null,
        tmdbId: Number(v.tmdb_id),
        mediaType: v.media_type as MediaType,
        title: v.title as string,
        year: (v.year as number | null) ?? null,
        posterPath: (v.poster_path as string | null) ?? null,
        personalScore: Number(v.personal_score),
        tier: v.tier as VerdictTier,
        createdAt: v.created_at as string,
      })),
    },
  };
}

export type FeedResult =
  | { kind: 'ok'; items: FeedVerdict[] }
  | { kind: 'needs_migration' };

export async function getFollowingFeed(supabase: SupabaseClient): Promise<FeedResult> {
  const { data, error } = await supabase.rpc('get_following_feed');
  if (error) {
    if (isMissingMigration(error)) return { kind: 'needs_migration' };
    return { kind: 'ok', items: [] };
  }
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    kind: 'ok',
    items: rows.map((v) => ({
      userId: v.user_id as string,
      username: (v.username as string | null) ?? null,
      displayName: (v.display_name as string | null) ?? null,
      tmdbId: Number(v.tmdb_id),
      mediaType: v.media_type as MediaType,
      title: v.title as string,
      year: (v.year as number | null) ?? null,
      posterPath: (v.poster_path as string | null) ?? null,
      personalScore: Number(v.personal_score),
      tier: v.tier as VerdictTier,
      createdAt: v.created_at as string,
    })),
  };
}
