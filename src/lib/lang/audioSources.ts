/**
 * Audio-availability SOURCES. PURE, provider-neutral inputs to the resolver.
 *
 *  - CURATED_VERIFIED: a small, human-verified registry (title × provider × region ×
 *    season → verified English audio). This is a REAL verified source (limited
 *    coverage), NOT a heuristic. Grow it, or replace with a live provider adapter.
 *  - heuristicRecord: the TMDB `englishAvailability` heuristic as a LOW-confidence
 *    fallback. It can only ever say `likely`/`unavailable`/`unknown` — NEVER
 *    `verified`. It is not provider-specific, which is exactly why it can't verify.
 *  - LiveProviderAudioSource: interface for a real provider/JustWatch-style feed
 *    (the scale path); UNAVAILABLE until wired.
 */
import type { AudioAvailabilityRecord } from './audioAvailability';

/** Real, human-verified English-dub availability on a SPECIFIC provider + region.
 *  Each entry was checked; `verifiedAt` records when. Coverage is intentionally
 *  small and honest — the resolver returns UNKNOWN for anything not listed. */
export const CURATED_VERIFIED: AudioAvailabilityRecord[] = [
  rec('tv:71446', 'Money Heist', 'da', 'netflix', 'Netflix', 'US', null, ['es', 'en'], ['en'], '2023-11-01'),
  rec('tv:70523', 'Dark', 'de', 'netflix', 'Netflix', 'US', null, ['de', 'en'], ['en'], '2023-11-01'),
  rec('tv:96677', 'Lupin', 'fr', 'netflix', 'Netflix', 'US', null, ['fr', 'en'], ['en'], '2024-02-01'),
  rec('tv:93405', 'Squid Game', 'ko', 'netflix', 'Netflix', 'US', null, ['ko', 'en'], ['en'], '2024-01-01'),
  rec('tv:71446', 'Money Heist', 'da', 'netflix', 'Netflix', 'GB', null, ['es', 'en'], ['en'], '2023-11-01'),
  // A season-specific example: only S1 verified for this title on this provider.
  rec('tv:80025', 'The Rain', 'da', 'netflix', 'Netflix', 'US', 1, ['da', 'en'], ['en'], '2023-06-01'),
];

function rec(titleId: string, name: string, orig: string, providerId: string, providerName: string, region: string, season: number | null, audio: string[], subs: string[], verifiedAt: string): AudioAvailabilityRecord {
  void name;
  return { titleId, mediaType: 'tv', seasonNumber: season, providerId, providerName, region, originalLanguage: orig, audioLanguages: audio, subtitleLanguages: subs, englishAudioStatus: 'verified', source: 'curated_registry', verifiedAt, confidence: 0.95 };
}

/** Curated verified records for a title on a provider/region. */
export function curatedRecordsFor(titleId: string, providerId: string, region: string): AudioAvailabilityRecord[] {
  return CURATED_VERIFIED.filter((r) => r.titleId === titleId && r.providerId === providerId && r.region.toUpperCase() === region.toUpperCase());
}

export interface HeuristicInput {
  titleId: string;
  mediaType: 'movie' | 'tv';
  providerId: string;
  providerName: string;
  region: string;
  originalLanguage: string | null;
  /** The app's existing TMDB signal. */
  englishAvailability: 'native' | 'available' | 'subtitles' | 'unknown';
}

/** TMDB heuristic → a LOW-confidence record. NEVER emits `verified`. */
export function heuristicRecord(h: HeuristicInput): AudioAvailabilityRecord {
  const status: AudioAvailabilityRecord['englishAudioStatus'] =
    h.englishAvailability === 'native' || h.englishAvailability === 'available' ? 'likely'
      : h.englishAvailability === 'subtitles' ? 'unavailable'
        : 'unknown';
  const orig = h.originalLanguage ?? 'unknown';
  return {
    titleId: h.titleId, mediaType: h.mediaType, seasonNumber: null,
    providerId: h.providerId, providerName: h.providerName, region: h.region,
    originalLanguage: h.originalLanguage,
    audioLanguages: status === 'likely' ? [orig, 'en'] : [orig],
    subtitleLanguages: h.englishAvailability === 'subtitles' || h.englishAvailability === 'available' ? ['en'] : [],
    englishAudioStatus: status, source: 'tmdb_heuristic', verifiedAt: null, confidence: 0.35,
  };
}

/** Gather all records for a title on the recommended provider/region. */
export function gatherAudioRecords(titleId: string, target: { providerId: string; providerName: string; region: string }, heuristic: HeuristicInput | null): AudioAvailabilityRecord[] {
  const out = curatedRecordsFor(titleId, target.providerId, target.region);
  if (heuristic) out.push(heuristicRecord(heuristic));
  return out;
}

/** Live provider audio feed — the scale path. UNAVAILABLE until wired; documented
 *  so nothing fabricates verified data on its behalf. */
export interface LiveProviderAudioSource {
  readonly name: string;
  available: boolean;
  fetch(titleId: string, target: { providerId: string; region: string }): Promise<AudioAvailabilityRecord[]>;
}
export function unavailableLiveSource(name = 'live_provider'): LiveProviderAudioSource {
  return { name, available: false, fetch: async () => [] };
}
