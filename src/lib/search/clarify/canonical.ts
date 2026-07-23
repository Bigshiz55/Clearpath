/**
 * Canonical, language-INDEPENDENT vocabulary for the Clarification Engine. All
 * reasoning, routing, and analytics use these stable keys; NEVER translated
 * strings. The presentation layer (localize.ts) maps them to the user's language.
 */

/** Stable canonical intent keys. Every language maps into exactly these. */
export const CANONICAL_INTENTS = [
  'find_title', 'streaming_lookup', 'live_tv_schedule', 'upcoming_release',
  'recommendation', 'similar_to', 'actor_lookup', 'director_lookup',
  'franchise_lookup', 'genre_browse', 'mood_search', 'content_warning',
  'group_watch', 'availability_by_service', 'release_date', 'watch_order', 'unknown',
] as const;
export type CanonicalIntent = (typeof CANONICAL_INTENTS)[number];

/** Stable meaning keys for interpretations (localized only at render time). */
export const MEANING_KEYS = [
  'where_to_stream_title', 'title_airing_soon', 'new_franchise_release',
  'show_franchise', 'find_the_title', 'similar_to_title', 'browse_genre',
  'mood_pick', 'titles_with_person', 'whats_on_service', 'release_date_of_title',
  'watch_order_of_franchise', 'could_not_identify',
] as const;
export type MeaningKey = (typeof MEANING_KEYS)[number];

export type EntityType = 'title' | 'person' | 'franchise' | 'genre' | 'service' | 'mood' | 'none';

/** A single ranked interpretation — CANONICAL only (no display text). */
export interface CanonicalInterpretation {
  intent: CanonicalIntent;
  meaningKey: MeaningKey;
  entityType: EntityType;
  /** Resolved universal id when known (e.g. "movie:1366"), else the raw name. */
  entityRef: string | null;
  entityName: string | null;
  confidence: number; // 0..1, the interpretation set sums to ~1
}

/** Map the retrieval pipeline's coarse IntentKind → a canonical intent (bridge). */
export const RETRIEVAL_TO_CANONICAL: Record<string, CanonicalIntent> = {
  title_lookup: 'find_title', similar_to: 'similar_to', actor: 'actor_lookup',
  franchise: 'franchise_lookup', genre: 'genre_browse', availability: 'streaming_lookup',
  schedule: 'live_tv_schedule', upcoming: 'upcoming_release', recommendation: 'recommendation',
  incomplete: 'unknown', conversational: 'recommendation', unknown: 'unknown',
};

/** The default meaning key for a canonical intent (used when generating interps). */
export const INTENT_MEANING: Record<CanonicalIntent, MeaningKey> = {
  find_title: 'find_the_title', streaming_lookup: 'where_to_stream_title',
  live_tv_schedule: 'title_airing_soon', upcoming_release: 'new_franchise_release',
  recommendation: 'mood_pick', similar_to: 'similar_to_title', actor_lookup: 'titles_with_person',
  director_lookup: 'titles_with_person', franchise_lookup: 'show_franchise',
  genre_browse: 'browse_genre', mood_search: 'mood_pick', content_warning: 'find_the_title',
  group_watch: 'mood_pick', availability_by_service: 'whats_on_service',
  release_date: 'release_date_of_title', watch_order: 'watch_order_of_franchise', unknown: 'could_not_identify',
};
