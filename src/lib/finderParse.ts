// Turn a plain-English request into the Finder's structured constraints —
// deterministically, no AI required (an optional AI pass can refine it server-
// side). Pure + client-safe so the UI can show the parse live as you type.
import type { FinderQuery } from '@/lib/finder';
import { GENRE_IDS } from '@/lib/finderGenres';

export const EMPTY_QUERY: FinderQuery = {
  mediaType: 'any',
  genreIds: [],
  maxRuntime: null,
  sinceMonths: null,
  minAudience: null,
  englishAudioOnly: false,
  onMyServices: false,
  minMatch: null,
};

export function naiveParseQuery(input: string): FinderQuery {
  const t = ` ${input.toLowerCase()} `;
  const q: FinderQuery = { ...EMPTY_QUERY, genreIds: [] };

  // Media type.
  const wantsTv = /\b(show|series|tv|season|seasons|episodes?)\b/.test(t);
  const wantsMovie = /\b(movie|film|flick)s?\b/.test(t);
  q.mediaType = wantsTv && !wantsMovie ? 'tv' : wantsMovie && !wantsTv ? 'movie' : 'any';

  // Genres (longest names first so "science fiction" wins over nothing).
  const ids = new Set<number>();
  for (const name of Object.keys(GENRE_IDS).sort((a, b) => b.length - a.length)) {
    if (t.includes(` ${name} `) || t.includes(`${name}s `) || t.includes(` ${name},`) || t.includes(` ${name}.`)) {
      ids.add(GENRE_IDS[name]!);
    }
  }
  q.genreIds = Array.from(ids);

  // Max runtime — "under 140 minutes" / "less than 2 hours".
  const minMatchStr = t.match(/(?:under|less than|below|shorter than|max)\s+(\d{2,3})\s*(?:min|minutes|mins|m)\b/);
  if (minMatchStr) q.maxRuntime = Number(minMatchStr[1]);
  const hrMatch = t.match(/(?:under|less than|below|max)\s+(\d(?:\.\d)?)\s*(?:hours?|hrs?|h)\b/);
  if (hrMatch && q.maxRuntime == null) q.maxRuntime = Math.round(Number(hrMatch[1]) * 60);

  // Recency.
  const mo = t.match(/(?:last|past|within|in the last)\s+(\d{1,3})\s*months?/);
  const yr = t.match(/(?:last|past|within|in the last)\s+(\d{1,2})\s*years?/);
  if (mo) q.sinceMonths = Number(mo[1]);
  else if (yr) q.sinceMonths = Number(yr[1]) * 12;
  else if (/\b(recent|recently|new releases?|brand new|just came out)\b/.test(t)) q.sinceMonths = 24;

  // Audience score — "audience above 80", "80%+".
  const aud = t.match(/(?:audience|score|rating)\D{0,14}(\d{2,3})/) || t.match(/(\d{2,3})\s*%/);
  if (aud) q.minAudience = Math.min(100, Number(aud[1]));

  // English audio.
  if (/\benglish (?:audio|dub|dubbed|language)\b|not subtitl|no subtitl|dubbed in english/.test(t)) {
    q.englishAudioOnly = true;
  }

  // On my services.
  if (/\bmy services?\b|\bi (?:already )?have\b|\bcan watch (?:it )?tonight\b|\bon (?:my )?(?:plans?|streaming|subscriptions?)\b|\bsubscrib/.test(t)) {
    q.onMyServices = true;
  }

  // Match / verdict / watch-meter threshold — "watch verdict of 80+", "match 85".
  const match =
    t.match(/(?:match|verdict|watch ?meter|watch ?verdict|score for [a-z]+)\D{0,12}(\d{2})\+?/) ||
    t.match(/\b(\d{2})\+/);
  if (match) q.minMatch = Number(match[1]);

  return q;
}
