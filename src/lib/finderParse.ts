// Turn a plain-English request into the Finder's structured constraints —
// deterministically, no AI required (an optional AI pass can refine it server-
// side). Pure + client-safe so the UI can show the parse live as you type.
import type { FinderQuery } from '@/lib/finder';
import { GENRE_IDS, genreLabel } from '@/lib/finderGenres';

export const EMPTY_QUERY: FinderQuery = {
  mediaType: 'any',
  genreIds: [],
  maxRuntime: 150, // default cap ~2.5h; drag right to "Any length"
  sinceMonths: null,
  minAudience: null,
  minImdb: null,
  englishAudioOnly: false,
  onMyServices: false,
  minMatch: null,
  streamItOnly: false,
  bingeableOnly: false,
  upcoming: false,
  liveOnly: false,
  pace: null,
  count: null,
};

/** Plain-English read-back of the constraints the parser extracted — the judge
 *  says "here's how I read your case" so the parse is never a black box. Pure. */
export function describeQuery(q: FinderQuery): string {
  const parts: string[] = [];
  if (q.similarTo) parts.push(`more like ${q.similarTo}`);
  if (q.mediaType === 'movie') parts.push('movies');
  else if (q.mediaType === 'tv') parts.push('shows');
  for (const id of q.genreIds) parts.push(genreLabel(id).toLowerCase());
  // Only announce a length the user actually asked for — not the silent default cap.
  if (q.maxRuntime != null && q.maxRuntime !== EMPTY_QUERY.maxRuntime) {
    const h = Math.floor(q.maxRuntime / 60);
    const m = q.maxRuntime % 60;
    parts.push(h > 0 ? `under ${h}${m ? `h${m}m` : 'h'}` : `under ${m}m`);
  }
  if (q.sinceMonths != null) {
    const y = Math.round(q.sinceMonths / 12);
    parts.push(y >= 1 ? `from the last ${y} year${y > 1 ? 's' : ''}` : `from the last ${q.sinceMonths} months`);
  }
  if (q.minAudience != null) parts.push(`${q.minAudience}%+ audience`);
  if (q.minImdb != null) parts.push(`IMDb ${q.minImdb.toFixed(1)}+`);
  if (q.minMatch != null) parts.push(`${q.minMatch}+ match`);
  if (q.englishAudioOnly) parts.push('English audio');
  if (q.streamItOnly) parts.push('“watch it” calls only');
  if (q.bingeableOnly) parts.push('fully bingeable');
  if (q.upcoming) parts.push('upcoming (not out yet)');
  if (q.onMyServices) parts.push('on your services');
  if (q.pace != null) parts.push(q.pace <= 33 ? 'a slow burn' : q.pace >= 67 ? 'high-adrenaline' : 'balanced pace');
  return parts.length ? parts.join(' · ') : 'anything — you didn’t pin down a single rule yet';
}

export function naiveParseQuery(input: string): FinderQuery {
  const t = ` ${input.toLowerCase()} `;
  const q: FinderQuery = { ...EMPTY_QUERY, genreIds: [] };

  // Media type. "show" is a TV signal only as a *noun* — the request verb
  // "show me/us/them" must not count, or "show me movies" flips to 'any' and
  // leaks TV. Strip the verb usage, then look for a remaining "show".
  const noVerbShow = t.replace(/\bshows?\s+(me|us|them)\b/g, ' ');
  const wantsTv = /\b(show|shows|series|tv|season|seasons|episodes?)\b/.test(noVerbShow);
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

  // Max runtime — "under 140 minutes" / "less than 2 hours". An explicit
  // request overrides the default cap; minutes take priority over hours.
  const minMatchStr = t.match(/(?:under|less than|below|shorter than|max)\s+(\d{2,3})\s*(?:min|minutes|mins|m)\b/);
  if (minMatchStr) q.maxRuntime = Number(minMatchStr[1]);
  else {
    const hrMatch = t.match(/(?:under|less than|below|max)\s+(\d(?:\.\d)?)\s*(?:hours?|hrs?|h)\b/);
    if (hrMatch) q.maxRuntime = Math.round(Number(hrMatch[1]) * 60);
  }

  // Recency.
  const mo = t.match(/(?:last|past|within|in the last)\s+(\d{1,3})\s*months?/);
  const yr = t.match(/(?:last|past|within|in the last)\s+(\d{1,2})\s*years?/);
  if (mo) q.sinceMonths = Number(mo[1]);
  else if (yr) q.sinceMonths = Number(yr[1]) * 12;
  else if (/\b(recent|recently|new releases?|brand new|just came out)\b/.test(t)) q.sinceMonths = 24;

  // IMDb rating — "imdb 7.5", "imdb above 8", "8+ on imdb". Parse before the
  // generic audience match so "imdb 8" isn't misread as an 8% audience score.
  const imdb =
    t.match(/imdb\D{0,10}(\d(?:\.\d)?)/) || t.match(/(\d(?:\.\d)?)\s*\+?\s*(?:on |stars? )?imdb/);
  if (imdb) q.minImdb = Math.min(10, Number(imdb[1]));

  // Audience score — "audience above 80", "80%+".
  const aud = t.match(/(?:audience|score|rating)\D{0,14}(\d{2,3})/) || t.match(/(\d{2,3})\s*%/);
  if (aud) q.minAudience = Math.min(100, Number(aud[1]));

  // English audio. A strict phrase ("with english audio", "english dub(bed)",
  // "no subtitles", "dub required", "listen in english") requires VERIFIED audio in
  // the primary results (likely/unknown split into possibleMatches downstream).
  if (/\benglish (?:audio|dub|dubbed|language)\b|not subtitl|no subtitl|dubbed in english/.test(t)) {
    q.englishAudioOnly = true;
  }
  if (/\bwith english audio\b|\benglish dub(bed)?\b|\bdub required\b|\bno subtitles\b|\blisten in english\b|\benglish spoken\b/.test(t)) {
    q.englishAudioOnly = true;
    q.strictEnglishAudio = true;
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

  // Stream It only (our WATCH IT verdict).
  if (/\bstream[- ]?it\b|\bmust[- ]?watch\b|only (?:great|the best)\b/.test(t)) q.streamItOnly = true;

  // Bingeable — all episodes out.
  if (/\bbinge\w*\b|all (?:the )?episodes? (?:are )?out\b|finished (?:series|show)\b|complete (?:series|season)\b/.test(t)) {
    q.bingeableOnly = true;
  }

  // Upcoming — not out yet (upcoming, coming soon, hasn't been released).
  if (/\bupcoming\b|\bcoming soon\b|\bnot (?:out|released)( yet)?\b|\bhasn'?t (?:come out|been released)\b|\bfuture releases?\b/.test(t)) {
    q.upcoming = true;
  }

  // Explicit result count — "recommend 3 thrillers", "show me 5 movies", "top 3".
  // Capped 1–12 so a stray number can't blow out the grid. Only counts when the
  // number sits right before a media/quantity word or a request verb.
  const countMatch =
    t.match(/\b(?:recommend|show me|give me|find|suggest|top|pick|list)\s+(\d{1,2})\b/) ||
    t.match(/\b(\d{1,2})\s+(?:great |good |best )?(?:thrillers?|movies?|films?|shows?|series|picks?|titles?|comedies|documentaries|options?)\b/);
  if (countMatch) {
    const n = Number(countMatch[1]);
    if (n >= 1 && n <= 12) q.count = n;
  }

  // Pace.
  if (/\bslow[- ]?burn\b|\bslow[- ]?paced?\b|\bdeliberate\b/.test(t)) q.pace = 15;
  else if (/\badrenaline\b|\bfast[- ]?paced?\b|\bhigh[- ]?octane\b|\bnon[- ]?stop\b|\bedge of (?:my|your) seat\b/.test(t)) q.pace = 90;

  return q;
}
