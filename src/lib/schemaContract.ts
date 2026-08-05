/**
 * WHAT THE CODE REQUIRES THE DATABASE TO ALREADY HAVE.
 *
 * Pure data, no I/O, importable anywhere. Every Postgres object the
 * application reads or writes is declared here alongside the migration that
 * creates it.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Migration 0041 was written, registered, reviewed and merged, and the code
 * that reads its tables shipped to production — where those tables do not
 * exist. Nothing in the pipeline objected, because nothing in the pipeline
 * ever compared what the code needs against what the database has:
 *
 *   - `npm run build` is plain `next build`. It applies no migrations and
 *     touches no database.
 *   - `checkMigrationsRegistered.ts` verifies a migration FILE is registered
 *     with a runner. Registration is not application.
 *   - Type-checking cannot see a Supabase table name; `.from('x')` is a
 *     string.
 *
 * So "the code needs this table" and "the database has this table" were two
 * facts that were never put in the same room. This file is that room, and
 * two gates read from it:
 *
 *   1. `scripts/checkSchemaContract.ts` — runs in `npm run build`, needs no
 *      database, and fails if the code references an object this contract
 *      does not declare. Keeps the contract honest as the code grows.
 *   2. `/api/health/schema` + `scripts/verifyProductionSchema.ts` — probe a
 *      LIVE deployment and fail if any declared object is absent. This is the
 *      gate that would have caught 0041.
 *
 * Generated from the code's own `.from('...')` calls and the migrations'
 * own `create table` statements, then committed. Regenerate the same way if
 * it drifts; do not hand-edit an entry to silence a gate.
 */

export interface SchemaRequirement {
  /** The table or view, in the `public` schema. */
  object: string;
  /** The migration that creates it. */
  migration: string;
}

export const SCHEMA_CONTRACT: SchemaRequirement[] = [
  { object: 'preference_rules', migration: '0001_init' },
  { object: 'profiles', migration: '0001_init' },
  { object: 'shares', migration: '0001_init' },
  { object: 'verdicts', migration: '0001_init' },
  { object: 'watchlist_items', migration: '0001_init' },
  { object: 'watchlists', migration: '0001_init' },
  { object: 'digest_items', migration: '0002_digest' },
  { object: 'crew_people', migration: '0003_crews' },
  { object: 'crews', migration: '0003_crews' },
  { object: 'court_participants', migration: '0004_court' },
  { object: 'court_rooms', migration: '0004_court' },
  { object: 'follows', migration: '0007_social' },
  { object: 'push_subscriptions', migration: '0008_push' },
  { object: 'title_feedback', migration: '0009_feedback' },
  { object: 'sponsor_events', migration: '0011_sponsors' },
  { object: 'sponsors', migration: '0011_sponsors' },
  { object: 'score_samples', migration: '0012_score_samples' },
  { object: 'tv_reminders', migration: '0013_tv_reminders' },
  { object: 'outbound_clicks', migration: '0015_outbound_clicks' },
  { object: 'entitlements', migration: '0016_entitlements' },
  { object: 'title_dimensions', migration: '0017_title_dimensions' },
  { object: 'dimension_overrides', migration: '0018_dimension_overrides' },
  { object: 'analytics_events', migration: '0020_recommendation_feedback' },
  { object: 'recommendation_feedback', migration: '0020_recommendation_feedback' },
  { object: 'recommendation_feedback_events', migration: '0020_recommendation_feedback' },
  { object: 'dimension_signals', migration: '0021_dimension_signals' },
  { object: 'preference_events', migration: '0023_preference_dna' },
  { object: 'recommendation_outcomes', migration: '0023_preference_dna' },
  { object: 'recommendation_impressions', migration: '0024_reco_validation' },
  { object: 'founder_test_sessions', migration: '0025_founder_test' },
  { object: 'discovery_overrides', migration: '0027_discovery_content' },
  { object: 'discovery_revisions', migration: '0027_discovery_content' },
  { object: 'os_activity', migration: '0028_verdict_os' },
  { object: 'os_approvals', migration: '0028_verdict_os' },
  { object: 'os_members', migration: '0028_verdict_os' },
  { object: 'os_missions', migration: '0028_verdict_os' },
  { object: 'os_products', migration: '0028_verdict_os' },
  { object: 'os_tasks', migration: '0028_verdict_os' },
  { object: 'tv_airings', migration: '0032_tv_ingestion' },
  { object: 'tv_call_ledger', migration: '0032_tv_ingestion' },
  { object: 'tv_ingestion_runs', migration: '0032_tv_ingestion' },
  { object: 'tv_lineup_channels', migration: '0032_tv_ingestion' },
  { object: 'tv_lineups', migration: '0032_tv_ingestion' },
  { object: 'tv_programmes', migration: '0032_tv_ingestion' },
  { object: 'tv_providers', migration: '0032_tv_ingestion' },
  { object: 'tv_stations', migration: '0032_tv_ingestion' },
  { object: 'case_aliases', migration: '0036_packs' },
  { object: 'case_programmes', migration: '0036_packs' },
  { object: 'cases', migration: '0036_packs' },
  { object: 'pack_stations', migration: '0036_packs' },
  { object: 'packs', migration: '0036_packs' },
  { object: 'person_programmes', migration: '0036_packs' },
  { object: 'persons', migration: '0036_packs' },
  { object: 'user_seen', migration: '0036_packs' },
  { object: 'user_tracking', migration: '0036_packs' },
  { object: 'case_match_candidates', migration: '0037_case_matching' },
  { object: 'case_match_episodes', migration: '0037_case_matching' },
  { object: 'case_match_flags', migration: '0037_case_matching' },
  { object: 'pack_ingest_runs', migration: '0038_pack_ingest_runs' },
  // 0043 — production hardening. The code feature-detects these (they are not
  // present until the migration is applied), but the contract must still
  // declare them or the gate cannot tell "not yet migrated" from "typo".
  { object: 'pack_list_items', migration: '0043_production_hardening' },
  { object: 'tv_provider_ingest_locks', migration: '0043_production_hardening' },
  { object: 'pack_franchise_cache', migration: '0043_production_hardening' },
  { object: 'case_evidence', migration: '0043_production_hardening' },
  { object: 'case_link_candidates', migration: '0043_production_hardening' },
  // 0044 — TV/streaming platform core. The source registry and the normalized
  // model. Declared here so the gate can tell "not yet migrated" from "typo";
  // the public_* views are the only objects a browser ever reads.
  { object: 'data_sources', migration: '0044_tv_platform_core' },
  { object: 'source_capabilities', migration: '0044_tv_platform_core' },
  { object: 'source_promotion_evidence', migration: '0044_tv_platform_core' },
  { object: 'source_runs', migration: '0044_tv_platform_core' },
  { object: 'source_requests', migration: '0044_tv_platform_core' },
  { object: 'source_quota_usage', migration: '0044_tv_platform_core' },
  { object: 'canon_titles', migration: '0044_tv_platform_core' },
  { object: 'canon_title_aliases', migration: '0044_tv_platform_core' },
  { object: 'canon_title_external_ids', migration: '0044_tv_platform_core' },
  { object: 'canon_seasons', migration: '0044_tv_platform_core' },
  { object: 'canon_episodes', migration: '0044_tv_platform_core' },
  { object: 'canon_genres', migration: '0044_tv_platform_core' },
  { object: 'canon_title_genres', migration: '0044_tv_platform_core' },
  { object: 'dist_services', migration: '0044_tv_platform_core' },
  { object: 'dist_service_regions', migration: '0044_tv_platform_core' },
  { object: 'dist_offers', migration: '0044_tv_platform_core' },
  { object: 'linear_networks', migration: '0044_tv_platform_core' },
  { object: 'linear_affiliates', migration: '0044_tv_platform_core' },
  { object: 'linear_lineups', migration: '0044_tv_platform_core' },
  { object: 'linear_lineup_channels', migration: '0044_tv_platform_core' },
  { object: 'linear_airings', migration: '0044_tv_platform_core' },
  { object: 'linear_schedule_coverage', migration: '0044_tv_platform_core' },
  { object: 'match_candidates', migration: '0044_tv_platform_core' },
  { object: 'sim_clock', migration: '0044_tv_platform_core' },
  { object: 'growth_campaigns', migration: '0039_growth_os' },
  { object: 'growth_feedback', migration: '0039_growth_os' },
  { object: 'growth_links', migration: '0039_growth_os' },
  { object: 'growth_prospects', migration: '0039_growth_os' },
  { object: 'growth_settings', migration: '0039_growth_os' },
  { object: 'case_subjects', migration: '0039_packs_expansion' },
  { object: 'case_timeline_events', migration: '0039_packs_expansion' },
  { object: 'franchise_entries', migration: '0039_packs_expansion' },
  { object: 'account_merges', migration: '0040_accounts_feedback' },
  { object: 'feedback_reports', migration: '0040_accounts_feedback' },
  { object: 'watchmode_availability', migration: '0041_watchmode_availability' },
  { object: 'watchmode_call_ledger', migration: '0041_watchmode_availability' },
  { object: 'watchmode_fetch_state', migration: '0041_watchmode_availability' },
  { object: 'watchmode_title_map', migration: '0041_watchmode_availability' },
];

/**
 * Objects the code touches that NO migration in this repository creates.
 *
 * Deliberately listed rather than omitted: each one is either created
 * elsewhere (a view built by a later migration\'s DO block, a Supabase-managed
 * table) or is a genuine gap. They are excluded from the live probe because a
 * missing entry here means "we do not know where this comes from", which is a
 * different problem from "the migration did not run" — and reporting the two
 * as the same thing is how 0041 stayed invisible.
 */
export const UNMAPPED_OBJECTS: string[] = [
  // A view over pack premieres, not a table.
  'pack_premiere_calendar',
  // The migration runner\'s own ledger, created by the runner on first use
  // (scripts/migrate.ts) rather than by any migration file. NOT the same
  // ledger as Supabase\'s `supabase_migrations.schema_migrations`.
  'schema_migrations',
  // Views over the Pack seen/tracking tables.
  'user_seen_programmes',
  'user_tracking_matches',
];

/** Every object a live database must have for the shipped code to work. */
export function requiredObjects(): string[] {
  return [...new Set(SCHEMA_CONTRACT.map((r) => r.object))].sort();
}

/** Which migration a missing object should point an operator at. */
export function migrationFor(object: string): string | undefined {
  return SCHEMA_CONTRACT.find((r) => r.object === object)?.migration;
}
