/**
 * Recommendation split by verified English-audio status. PURE.
 *
 * STRICT request ("with English audio", "English dubbed", "no subtitles", "dub
 * required"): the PRIMARY list may contain ONLY VERIFIED_ENGLISH_AUDIO. LIKELY /
 * UNKNOWN go into a separate, clearly-labelled "Possible matches — English audio
 * not yet verified" section and are NEVER mixed in. SUBTITLES_ONLY / NO / CONFLICTING
 * do not appear at all for a strict request.
 *
 * NON-STRICT "dub preferred": VERIFIED + LIKELY may appear together, each labelled;
 * UNKNOWN goes to possible-matches.
 *
 * We NEVER pad a group to hit a requested count — fewer verified matches are
 * returned honestly with a stated shortfall.
 */
import type { EnglishAudioStatus, ResolvedAudio } from './audioAvailability';

export interface AudioRankedItem<T> { item: T; audio: ResolvedAudio }

export interface AudioSplit<T> {
  primary: AudioRankedItem<T>[];
  possibleMatches: AudioRankedItem<T>[];
  verifiedCount: number;
  /** True when we returned fewer verified results than requested (never padded). */
  shortfall: boolean;
  requested: number | null;
  possibleMatchesLabel: string;
}

const PRIMARY_STRICT: ReadonlySet<EnglishAudioStatus> = new Set(['VERIFIED_ENGLISH_AUDIO']);
const PRIMARY_LOOSE: ReadonlySet<EnglishAudioStatus> = new Set(['VERIFIED_ENGLISH_AUDIO', 'LIKELY_ENGLISH_AUDIO']);
const POSSIBLE: ReadonlySet<EnglishAudioStatus> = new Set(['LIKELY_ENGLISH_AUDIO', 'UNKNOWN']);

export function splitByAudio<T>(items: AudioRankedItem<T>[], opts: { strict: boolean; dubPreferred?: boolean; requested?: number | null }): AudioSplit<T> {
  const primarySet = opts.strict ? PRIMARY_STRICT : PRIMARY_LOOSE;
  const primary = items.filter((x) => primarySet.has(x.audio.status));
  // In loose mode, LIKELY is already primary, so possible = UNKNOWN only.
  const possible = items.filter((x) => POSSIBLE.has(x.audio.status) && !primarySet.has(x.audio.status));

  const requested = opts.requested ?? null;
  const shortfall = requested != null && primary.length < requested;

  return {
    primary,
    possibleMatches: possible,
    verifiedCount: items.filter((x) => x.audio.status === 'VERIFIED_ENGLISH_AUDIO').length,
    shortfall,
    requested,
    possibleMatchesLabel: 'Possible matches — English audio not yet verified',
  };
}

/** Phrases that make an English-audio request STRICT (verified-only primary). */
const STRICT_PHRASES = [
  /\bwith english audio\b/, /\b(have|has|having) english audio\b/, /\benglish dub(bed)?\b/,
  /\bdub required\b/, /\bno subtitles\b/, /\bi want to listen in english\b/, /\blisten in english\b/,
  /\benglish spoken\b/, /\bmust have english audio\b/,
];
const PREFER_PHRASES = [/\bdub preferred\b/, /\bprefer(ably)? (english )?dub\b/, /\bideally .*english audio\b/];

export function audioStrictness(text: string): { requireEnglishAudio: boolean; strict: boolean; dubPreferred: boolean } {
  const t = ' ' + text.toLowerCase() + ' ';
  const strict = STRICT_PHRASES.some((r) => r.test(t));
  const dubPreferred = !strict && PREFER_PHRASES.some((r) => r.test(t));
  const requireEnglishAudio = strict || dubPreferred || /\benglish audio\b/.test(t);
  return { requireEnglishAudio, strict, dubPreferred };
}
