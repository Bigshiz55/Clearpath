/**
 * Production audio-availability layer — PURE, provider-neutral. The recommendation
 * finder consumes NORMALIZED records through this layer and never depends on
 * TMDB-specific heuristic fields directly. "English audio" is a VERIFIED English
 * AUDIO TRACK on the SPECIFIC recommended provider, in the user's region, for the
 * relevant season — never inferred from original language, US availability, another
 * provider, another region, another season, subtitles, or a title/synopsis.
 *
 * The TMDB heuristic is kept only as a LOW-CONFIDENCE fallback source that can never
 * emit `verified`.
 */
import { isEnglish } from './international';

/** Normalized per-source record (the contract adapters produce). */
export interface AudioAvailabilityRecord {
  titleId: string;
  mediaType: 'movie' | 'tv';
  seasonNumber: number | null;         // null = title-level (may vary by season)
  providerId: string;
  providerName: string;
  region: string;                      // e.g. "US"
  originalLanguage: string | null;
  audioLanguages: string[];
  subtitleLanguages: string[];
  /** Per-source claim. A verified-tier source may say verified/unavailable/conflicting;
   *  the heuristic source may only say likely/unavailable/unknown. */
  englishAudioStatus: 'verified' | 'likely' | 'unavailable' | 'unknown' | 'conflicting';
  source: string;                      // e.g. "curated_registry", "tmdb_heuristic"
  verifiedAt: string | null;           // ISO date when a human/API verified it
  confidence: number;                  // 0..1
}

/** Resolved, provider+region+season-specific status the UI + finder act on. */
export type EnglishAudioStatus =
  | 'VERIFIED_ENGLISH_AUDIO'
  | 'LIKELY_ENGLISH_AUDIO'
  | 'ENGLISH_SUBTITLES_ONLY'
  | 'NO_ENGLISH_AUDIO'
  | 'UNKNOWN'
  | 'CONFLICTING_DATA';

export interface ResolvedAudio {
  status: EnglishAudioStatus;
  confidence: number;
  providerName: string | null;
  region: string;
  verifiedAt: string | null;
  /** Verified season numbers when season-level data exists (else null = title-level). */
  verifiedSeasons: number[] | null;
  /** True when only a title-level verification exists (result may vary by season). */
  seasonUncertain: boolean;
  note: string;
}

const VERIFIED_TIER = new Set(['curated_registry', 'live_provider']); // NOT tmdb_heuristic
const VERIFIED_MIN_CONFIDENCE = 0.8;

export interface ResolveTarget { providerId: string; region: string; seasonNumber?: number | null }

/**
 * Resolve English-audio status for ONE title on ONE provider in ONE region (+season).
 * Cross-provider / cross-region / cross-season records are ignored. Verified never
 * comes from the heuristic source.
 */
export function resolveEnglishAudio(records: AudioAvailabilityRecord[], target: ResolveTarget): ResolvedAudio {
  const base: ResolvedAudio = { status: 'UNKNOWN', confidence: 0, providerName: null, region: target.region, verifiedAt: null, verifiedSeasons: null, seasonUncertain: false, note: 'No audio data for this provider/region.' };

  // Same provider AND same region only.
  const scoped = records.filter((r) => r.providerId === target.providerId && r.region.toUpperCase() === target.region.toUpperCase());
  if (scoped.length === 0) return base;

  const wantSeason = target.seasonNumber ?? null;
  const seasonMatch = (r: AudioAvailabilityRecord) => wantSeason == null || r.seasonNumber == null || r.seasonNumber === wantSeason;
  const scopedSeason = scoped.filter(seasonMatch);
  if (scopedSeason.length === 0) return { ...base, note: 'No data for the requested season on this provider.' };

  const verifiedSrc = scopedSeason.filter((r) => VERIFIED_TIER.has(r.source) && r.confidence >= VERIFIED_MIN_CONFIDENCE);
  const verifiedYes = verifiedSrc.filter((r) => r.englishAudioStatus === 'verified');
  const verifiedNo = verifiedSrc.filter((r) => r.englishAudioStatus === 'unavailable');
  const hasEngSubs = scopedSeason.some((r) => r.subtitleLanguages.some(isEnglish));
  const heuristicLikely = scopedSeason.filter((r) => r.source === 'tmdb_heuristic' && r.englishAudioStatus === 'likely');

  const seasonsVerified = verifiedYes.map((r) => r.seasonNumber).filter((s): s is number => s != null);
  const providerName = scopedSeason[0]!.providerName;
  const seasonUncertain = wantSeason != null && verifiedYes.length > 0 && verifiedYes.every((r) => r.seasonNumber == null);

  // Conflicting verified sources → surface the conflict, do not pick a side.
  if (verifiedYes.length && verifiedNo.length) {
    return { status: 'CONFLICTING_DATA', confidence: 0.5, providerName, region: target.region, verifiedAt: null, verifiedSeasons: seasonsVerified.length ? seasonsVerified : null, seasonUncertain, note: 'Sources disagree on English audio for this provider.' };
  }
  if (verifiedYes.length) {
    const latest = verifiedYes.map((r) => r.verifiedAt).filter(Boolean).sort().at(-1) ?? null;
    return { status: 'VERIFIED_ENGLISH_AUDIO', confidence: Math.max(...verifiedYes.map((r) => r.confidence)), providerName, region: target.region, verifiedAt: latest, verifiedSeasons: seasonsVerified.length ? [...new Set(seasonsVerified)].sort((a, b) => a - b) : null, seasonUncertain, note: seasonUncertain ? 'Verified at the title level — may vary by season.' : 'English audio verified on this provider.' };
  }
  if (verifiedNo.length) {
    return { status: hasEngSubs ? 'ENGLISH_SUBTITLES_ONLY' : 'NO_ENGLISH_AUDIO', confidence: Math.max(...verifiedNo.map((r) => r.confidence)), providerName, region: target.region, verifiedAt: null, verifiedSeasons: null, seasonUncertain: false, note: hasEngSubs ? 'English subtitles only — no English audio track.' : 'No English audio on this provider.' };
  }
  if (heuristicLikely.length) {
    return { status: 'LIKELY_ENGLISH_AUDIO', confidence: Math.min(0.4, Math.max(...heuristicLikely.map((r) => r.confidence))), providerName, region: target.region, verifiedAt: null, verifiedSeasons: null, seasonUncertain: false, note: 'English audio likely — verify before watching.' };
  }
  if (hasEngSubs) {
    return { status: 'ENGLISH_SUBTITLES_ONLY', confidence: 0.5, providerName, region: target.region, verifiedAt: null, verifiedSeasons: null, seasonUncertain: false, note: 'English subtitles only — no English audio track verified.' };
  }
  return { ...base, providerName, note: 'Audio availability unknown for this provider/region.' };
}

/** Human status label for a card (mobile + desktop). */
export const AUDIO_STATUS_LABEL: Record<EnglishAudioStatus, string> = {
  VERIFIED_ENGLISH_AUDIO: 'English audio verified',
  LIKELY_ENGLISH_AUDIO: 'English audio likely — verify before watching',
  ENGLISH_SUBTITLES_ONLY: 'English subtitles only',
  NO_ENGLISH_AUDIO: 'English audio unavailable',
  UNKNOWN: 'Audio availability unknown',
  CONFLICTING_DATA: 'Audio availability unknown',
};
