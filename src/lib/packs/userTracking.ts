import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrackingSubscriptionType, TrackingMatch, UserTrackingRecord } from './types';

/**
 * Subscribe to a Person, a Case, a Franchise, or a Pack. Person/Case/Pack take
 * their own uuid primary key as `subject`; Franchise takes the franchise name
 * (matched against tv_programmes.franchise). One table, four types — see the
 * `user_tracking_subject_shape` check constraint in migration 0036.
 */
export async function subscribe(
  supabase: SupabaseClient,
  userId: string,
  subscriptionType: TrackingSubscriptionType,
  subject: string,
): Promise<string> {
  const row: { user_id: string; subscription_type: TrackingSubscriptionType; subject_uuid: string | null; subject_text: string | null } =
    subscriptionType === 'franchise'
      ? { user_id: userId, subscription_type: subscriptionType, subject_uuid: null, subject_text: subject }
      : { user_id: userId, subscription_type: subscriptionType, subject_uuid: subject, subject_text: null };
  const { data, error } = await supabase.from('user_tracking').insert(row).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function unsubscribe(supabase: SupabaseClient, userId: string, trackingId: string): Promise<void> {
  const { error } = await supabase.from('user_tracking').delete().eq('user_id', userId).eq('id', trackingId);
  if (error) throw error;
}

interface TrackingRow {
  id: string;
  user_id: string;
  subscription_type: TrackingSubscriptionType;
  subject_uuid: string | null;
  subject_text: string | null;
  created_at: string;
}

function toTrackingRecord(row: TrackingRow): UserTrackingRecord {
  return {
    id: row.id,
    userId: row.user_id,
    subscriptionType: row.subscription_type,
    subjectUuid: row.subject_uuid,
    subjectText: row.subject_text,
    createdAt: row.created_at,
  };
}

/** All of a user's subscriptions — used to render "Following" state without a per-subject query each. */
export async function listSubscriptions(supabase: SupabaseClient, userId: string): Promise<UserTrackingRecord[]> {
  const { data, error } = await supabase.from('user_tracking').select('*').eq('user_id', userId);
  if (error) throw error;
  return (data as TrackingRow[]).map(toTrackingRecord);
}

/** A user's subscription to one specific subject, or null. */
export async function findSubscription(
  supabase: SupabaseClient,
  userId: string,
  subscriptionType: TrackingSubscriptionType,
  subject: string,
): Promise<UserTrackingRecord | null> {
  const column = subscriptionType === 'franchise' ? 'subject_text' : 'subject_uuid';
  const { data, error } = await supabase
    .from('user_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('subscription_type', subscriptionType)
    .eq(column, subject)
    .maybeSingle();
  if (error) throw error;
  return data ? toTrackingRecord(data as TrackingRow) : null;
}

interface TrackingMatchRow {
  tracking_id: string;
  user_id: string;
  subscription_type: TrackingSubscriptionType;
  airing_id: string;
  programme_id: string;
  station_id: string;
  start_at_utc: string;
}

/**
 * Every airing matching any of a user's subscriptions, across all four
 * subscription types. Reads `user_tracking_matches` directly — the
 * per-type resolution lives once in that view, not scattered across callers.
 */
export async function getTrackingMatches(supabase: SupabaseClient, userId: string): Promise<TrackingMatch[]> {
  const { data, error } = await supabase.from('user_tracking_matches').select('*').eq('user_id', userId);
  if (error) throw error;
  return (data as TrackingMatchRow[]).map((row) => ({
    trackingId: row.tracking_id,
    userId: row.user_id,
    subscriptionType: row.subscription_type,
    airingId: row.airing_id,
    programmeId: row.programme_id,
    stationId: row.station_id,
    startAtUtc: row.start_at_utc,
  }));
}
