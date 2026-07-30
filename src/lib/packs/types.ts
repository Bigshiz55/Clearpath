/**
 * Pack data model — types only. Mirrors migration 0036 exactly; no I/O here.
 *
 * A Pack is a themed collection of tv_stations plus a fixed set of feature
 * flags. Case, Person, UserSeen, and UserTracking are shared entities used by
 * any Pack that enables the relevant feature flag — none of them are
 * Pack-specific tables.
 */

export type PackFeatureKey =
  | 'premiere_calendar'
  | 'case_tracking'
  | 'person_tracking'
  | 'franchise_continuity'
  | 'completion_stats';

export interface Pack {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  isPremium: boolean;
  sortOrder: number;
  premiereCalendar: boolean;
  caseTracking: boolean;
  personTracking: boolean;
  franchiseContinuity: boolean;
  completionStats: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PackStation {
  packId: string;
  stationId: string;
  createdAt: string;
}

/** A row from `pack_premiere_calendar` — premieres on a Pack's stations. */
export interface PackPremiereEntry {
  packId: string;
  programmeId: string;
  title: string;
  premiereDate: string;
  airingId: string;
  stationId: string;
  startAtUtc: string;
}

export interface CaseRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An alternate title the same tv_programmes row has aired under. */
export interface CaseAlias {
  id: string;
  programmeId: string;
  aliasTitle: string;
  createdAt: string;
}

export interface PersonRecord {
  id: string;
  slug: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
}

/** A person's credit on a programme. Role is free text (actor, correspondent, host, ...). */
export interface PersonProgramme {
  personId: string;
  programmeId: string;
  role: string;
  createdAt: string;
}

export type UserSeenSubjectType = 'programme' | 'case';

export interface UserSeenRecord {
  id: string;
  userId: string;
  subjectType: UserSeenSubjectType;
  subjectId: string;
  seenAt: string;
  createdAt: string;
}

/** A row from `user_seen_programmes` — the effective (direct + Case-implied) seen set. */
export interface SeenProgramme {
  userId: string;
  programmeId: string;
  seenAt: string;
}

export type TrackingSubscriptionType = 'person' | 'case' | 'franchise' | 'pack';

/**
 * A UserTracking subscription. `subjectUuid` is set for person/case/pack;
 * `subjectText` (a franchise name) is set for franchise. Exactly one is
 * non-null, matching the `user_tracking_subject_shape` check constraint.
 */
export interface UserTrackingRecord {
  id: string;
  userId: string;
  subscriptionType: TrackingSubscriptionType;
  subjectUuid: string | null;
  subjectText: string | null;
  createdAt: string;
}

/** A row from `user_tracking_matches` — an airing matching a subscription. */
export interface TrackingMatch {
  trackingId: string;
  userId: string;
  subscriptionType: TrackingSubscriptionType;
  airingId: string;
  programmeId: string;
  stationId: string;
  startAtUtc: string;
}
