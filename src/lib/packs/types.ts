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

/**
 * A small, honest, real-data-only preview for a Pack's landing card. Every
 * field is `null` when there is nothing real to show — the card renders
 * without that line rather than inventing filler.
 */
export interface PackPreview {
  /** Earliest upcoming premiere on this Pack's stations, if any. */
  nextPremiere: { title: string; date: string } | null;
  /** Signed-in user's watched count on this Pack's stations. Null when signed out. */
  watchedCount: number | null;
  /** Signed-in user's count of cases they follow, for case-tracking Packs. Null when signed out. */
  trackedCaseCount: number | null;
}

export interface CaseRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  incidentDate: string | null;
  /** A short, honest one-line status ("Not yet documented" when nothing is curated). */
  statusSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

/** How firmly a curated fact is backed by its source. */
export type FactConfidence = 'verified' | 'reported' | 'unconfirmed';

export type CaseSubjectRole =
  | 'victim' | 'person_of_interest' | 'suspect' | 'charged'
  | 'defendant' | 'convicted' | 'acquitted' | 'exonerated' | 'witness' | 'other';

/** A sourced person connected to a Case. `role` is the role AT THE TIME —
 *  `outcome` is the eventual, separately-sourced result. Never collapse the two. */
export interface CaseSubject {
  id: string;
  caseId: string;
  fullName: string;
  role: CaseSubjectRole;
  outcome: string | null;
  sourceUrl: string | null;
  confidence: FactConfidence;
  sortOrder: number;
}

export type CaseTimelineEventType =
  | 'incident' | 'investigation' | 'arrest' | 'charges' | 'trial'
  | 'verdict' | 'sentencing' | 'appeal' | 'development';

export interface CaseTimelineEvent {
  id: string;
  caseId: string;
  eventType: CaseTimelineEventType;
  eventDate: string | null;
  headline: string;
  detail: string | null;
  sourceUrl: string | null;
  confidence: FactConfidence;
  disputed: boolean;
  sortOrder: number;
}

export type FranchiseConnection = 'direct_sequel' | 'shared_universe' | 'standalone_same_franchise' | 'unknown';

/** A verified franchise membership + viewing-order position. Never inferred
 *  from title-string similarity — every row is individually sourced. */
export interface FranchiseEntry {
  id: string;
  franchise: string;
  programmeId: string | null;
  tmdbId: number | null;
  tmdbMediaType: 'movie' | 'tv' | null;
  title: string;
  sequenceNumber: number | null;
  connection: FranchiseConnection;
  sourceUrl: string | null;
  confidence: FactConfidence;
}

/** One row in a Pack's "My Checklist" — every programme on the Pack's
 *  stations, real genre tags from the provider, and the signed-in user's
 *  watched status. No fabricated thematic buckets (e.g. "Christmas in July")
 *  — only what the data actually supports. */
export interface ChecklistItem {
  programmeId: string;
  title: string;
  posterUrl: string | null;
  genres: string[];
  releaseYear: number | null;
  seen: boolean;
  /** Most recent or soonest known airing, for sorting/display. */
  latestAiringUtc: string | null;
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
