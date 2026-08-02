import 'server-only';
import type { ScheduleListing } from '../schedule';
import { hashPayload, type FetchedAiring } from './reconcile';

/**
 * TV MEDIA INGEST — shaping, split from the DB-facing writer (`tvMediaWriter.ts`)
 * for the same reason `tvmazeIngest.ts` is split from `tvmazeWriter.ts`: pure
 * functions are unit-testable without a network call or a database.
 *
 * Unlike TVmaze, TV Media needs no channel-matching step: the adapter
 * (`adapters/tvMedia.ts`) already returns normalized `ScheduleListing[]` with
 * every channel the lineup carries, so stations are DISCOVERED from the
 * response rather than matched against a hand-maintained list. There is also
 * no premiere-detection pass — TV Media's `isNew` field, when the provider
 * sets it, is carried straight through; nothing here derives one.
 */

export interface StationDef {
  key: string;
  displayName: string;
  channelNumber: string | null;
}

/** One row per distinct channel actually present in a fetch. */
export function stationsFrom(listings: ScheduleListing[]): StationDef[] {
  const byKey = new Map<string, StationDef>();
  for (const l of listings) {
    if (!byKey.has(l.channelId)) {
      byKey.set(l.channelId, {
        key: l.channelId, displayName: l.channelName, channelNumber: l.channelNumber ?? null,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Programme identity for a listing.
 *
 * `programId` when the provider supplies one; otherwise a composite of title
 * + season/episode + episode title — the same fallback `dedupeKey` uses in
 * `schedule.ts`, so a programme without a provider id still merges correctly
 * across airings rather than creating one `tv_programmes` row per airing.
 */
export function programmeKeyFor(l: ScheduleListing): string {
  return l.programId ?? [
    l.title.toLowerCase(),
    l.seasonNumber ?? '', l.episodeNumber ?? '', l.episodeTitle?.toLowerCase() ?? '',
  ].join('~');
}

export interface ProgrammeRow {
  providerProgrammeId: string;
  title: string;
  episodeTitle: string | null;
  programmeType: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  genres: string[];
  description: string | null;
  runtimeMinutes: number | null;
  artworkUrl: string | null;
}

export function buildProgrammeRow(l: ScheduleListing): ProgrammeRow {
  const start = Date.parse(l.startUtc);
  const end = l.endUtc ? Date.parse(l.endUtc) : NaN;
  const runtimeMinutes = Number.isFinite(start) && Number.isFinite(end) && end > start
    ? Math.round((end - start) / 60_000)
    : null;
  return {
    providerProgrammeId: programmeKeyFor(l),
    title: l.title,
    episodeTitle: l.episodeTitle ?? null,
    programmeType: l.contentType ?? 'other',
    seasonNumber: l.seasonNumber ?? null,
    episodeNumber: l.episodeNumber ?? null,
    genres: l.genres ?? [],
    description: l.summary ?? null,
    runtimeMinutes,
    artworkUrl: l.posterUrl ?? null,
  };
}

/**
 * One listing -> the row the writer persists. Always usable: the adapter's
 * own `mapListing()` already rejects anything with no start, no title or no
 * channel before it ever reaches here (see tvMedia.ts), so unlike TVmaze this
 * has no "row with no usable start" case to guard against.
 */
export function toFetchedAiring(l: ScheduleListing, stationDbId: string, programmeDbId: string): FetchedAiring {
  return {
    providerAiringId: l.listingId,
    stationId: stationDbId,
    programmeId: programmeDbId,
    startAtUtc: l.startUtc,
    endAtUtc: l.endUtc ?? null,
    rawHash: hashPayload(l),
    isNew: l.isNew,
    isLive: l.isLive,
  };
}
