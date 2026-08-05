/**
 * WHICH STATIONS BELONG TO WHICH PACK — for EVERY provider, in one place.
 *
 * ── THE DEFECT THIS FIXES ─────────────────────────────────────────────────
 * Every Pack query (premiere calendar, checklist, previews) joins through
 * `pack_stations` — and `pack_stations` was only ever populated with the
 * eleven TVmaze stations, because the lazy ingest that wires it up only knew
 * about `TVMAZE_CHANNELS`. TV Media's stations (HALL, LIFE, OXY, A&E …) were
 * ingested into `tv_stations` but never linked to any Pack.
 *
 * The consequence, measured in production: TV Media inserted 2,802 airing
 * rows across 66 channels on August 3 — including Hallmark movies on HALL —
 * and the Hallmark Universe pack could not see a single one of them. TVmaze,
 * meanwhile, structurally does not carry Hallmark's movie library at all
 * (verified against the live national feed: zero Hallmark rows across three
 * days), so the pack rendered as empty even while the database held exactly
 * the data it needed.
 *
 * Pure and provider-agnostic: a mapping from (provider, station identity) to
 * pack slugs. The linking itself happens wherever stations already get wired
 * (lazy ingest, TV Media writer) — see `linkKnownStationsToPacks` in
 * packRefresh.ts.
 *
 * ── WHY CALL SIGNS ARE MATCHED EXACTLY ────────────────────────────────────
 * TV Media names stations by call sign ("HALL", "LIFE", "OXY"). An exact,
 * case-insensitive match against a curated list is deliberate: substring or
 * fuzzy matching is how "LIFE" would one day match a "LIFETIME ACHIEVEMENT
 * AWARDS" pop-up channel, and a wrong link puts another network's schedule
 * inside a Pack that promises a specific one. Every entry below was checked
 * against the real production lineup (zip 23059) before being added.
 */
import type { TvmazeChannelGroup } from '@/lib/viewing/ingest/tvmazeChannels';

export type PackSlug = 'hallmark-universe' | 'lifetime-vault' | 'crime-case-files';

/** TVmaze channel groups → pack slug (the mapping packRefresh uses). */
export const GROUP_TO_PACK: Record<TvmazeChannelGroup, PackSlug> = {
  hallmark: 'hallmark-universe',
  lifetime: 'lifetime-vault',
  crime: 'crime-case-files',
};

/**
 * TV Media call signs → pack slug. Checked against the live zip-23059 lineup:
 * HALL, LIFE, OXY and A&E are present; Investigation Discovery has no call
 * sign in this lineup, and LMN/GAF/Hallmark Mystery do not appear. Call signs
 * that MIGHT appear in other markets (HMM, HALLD, LMN, ID) are included so a
 * lineup that carries them links correctly — an entry that never matches
 * costs nothing and invents nothing.
 */
const TV_MEDIA_CALL_SIGNS: Record<string, PackSlug> = {
  // Hallmark family
  HALL: 'hallmark-universe',
  HMM: 'hallmark-universe', // Hallmark Mystery
  HALLD: 'hallmark-universe', // Hallmark Drama
  HFAM: 'hallmark-universe', // Hallmark Family
  // Lifetime family
  LIFE: 'lifetime-vault',
  LMN: 'lifetime-vault', // Lifetime Movie Network
  // True crime
  OXY: 'crime-case-files', // Oxygen True Crime
  ID: 'crime-case-files', // Investigation Discovery
  AETV: 'crime-case-files',
  'A&E': 'crime-case-files', // The First 48, American Justice, Cold Case Files
};

/**
 * The pack a station belongs to, or null when it belongs to none.
 *
 * `stationName` is `tv_stations.name` — the display name for TVmaze rows and
 * the call sign for TV Media rows (that is what `stationsFrom` stores).
 */
export function packForStation(providerId: string, stationName: string): PackSlug | null {
  if (providerId !== 'tv_media') return null; // TVmaze links flow through GROUP_TO_PACK
  const key = stationName.trim().toUpperCase();
  return TV_MEDIA_CALL_SIGNS[key] ?? null;
}

/** Every provider/name pair the map would link, for tests and health output. */
export function knownTvMediaCallSigns(): string[] {
  return Object.keys(TV_MEDIA_CALL_SIGNS);
}
