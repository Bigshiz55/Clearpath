/**
 * Interpret a foreign-language + English-audio recommendation request into a
 * normalized structured query. PURE. "English audio" is NEVER read as "originally
 * produced in English". Sports are always excluded this phase.
 */
import { audioStrictness } from './audioRecommend';

export interface ForeignAudioRequest {
  mediaType: 'tv' | 'movie' | 'any';
  tasteAnchors: string[];
  foreignOriginalLanguagePreferred: boolean;
  internationalOnly: boolean;
  englishAudioRequired: boolean;
  englishSubtitlesOnlyAllowed: boolean;
  desiredRegionsOrLanguages: string[];
  sportsExcluded: boolean;
  /** Strict = primary results must be VERIFIED English audio only. */
  strict: boolean;
}

/** region/language cue → canonical display term. Scandinavia collapses to "Nordic". */
const REGION_LANG: [RegExp, string][] = [
  [/\bnordic\b|\bscandinavian?\b|\bscandinavia\b/, 'Nordic'],
  [/\bdanish\b|\bdenmark\b/, 'Danish'], [/\bswedish\b|\bsweden\b/, 'Swedish'],
  [/\bnorwegian\b|\bnorway\b/, 'Norwegian'], [/\bfinnish\b|\bfinland\b/, 'Finnish'],
  [/\bspanish\b|\bspain\b/, 'Spanish'], [/\bfrench\b|\bfrance\b/, 'French'],
  [/\bgerman\b|\bgermany\b/, 'German'], [/\bitalian\b|\bitaly\b/, 'Italian'],
  [/\bkorean\b|\bkorea\b/, 'Korean'], [/\bdutch\b|\bnetherlands\b/, 'Dutch'],
  [/\bpolish\b|\bpoland\b/, 'Polish'], [/\bjapanese\b|\bjapan\b/, 'Japanese'],
];

export function parseForeignAudioRequest(text: string): ForeignAudioRequest {
  const low = ' ' + text.toLowerCase() + ' ';
  const strictness = audioStrictness(text);

  // taste anchors: what follows "I like / love / enjoy", up to the request clause.
  const anchors: string[] = [];
  const m = text.match(/\bi\s+(?:like|love|enjoy|dig|am into)\s+(.+?)(?:[.?!]|\bwhat\b|\bshow me\b|\bfind\b|\bgive me\b|\brecommend\b|\bcan you\b|\bany\b|$)/i);
  if (m && m[1]) for (const a of m[1].split(/\s*(?:,|and|&|\/)\s*/i)) { const t = a.trim().replace(/[.?!]+$/, ''); if (t.length >= 1 && !/^(some|a few|things|stuff)$/i.test(t)) anchors.push(t); }

  const desired: string[] = [];
  for (const [re, name] of REGION_LANG) if (re.test(low) && !desired.includes(name)) desired.push(name);

  const mediaType: ForeignAudioRequest['mediaType'] =
    /\b(shows?|series|tv)\b/.test(low) && !/\bmovies?\b|\bfilms?\b/.test(low) ? 'tv'
      : /\bmovies?\b|\bfilms?\b/.test(low) && !/\b(shows?|series|tv)\b/.test(low) ? 'movie'
        : /\b(shows?|series)\b/.test(low) ? 'tv' : 'any';

  const international = /\bforeign\b|\binternational\b|\bnon-?english\b/.test(low) || desired.length > 0;
  const subsAllowed = /\bsubtitles? (are )?(ok|fine|okay)\b|\bok with subtitles\b/.test(low) && !strictness.strict;

  return {
    mediaType,
    tasteAnchors: anchors,
    foreignOriginalLanguagePreferred: international,
    internationalOnly: international,
    englishAudioRequired: strictness.requireEnglishAudio,
    englishSubtitlesOnlyAllowed: subsAllowed,
    desiredRegionsOrLanguages: desired,
    sportsExcluded: true,
    strict: strictness.strict,
  };
}
