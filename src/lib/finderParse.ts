// Turn a plain-English request into the Finder's structured constraints —
// deterministically, no AI required (an optional AI pass can refine it server-
// side). Pure + client-safe so the UI can show the parse live as you type.
import type { FinderQuery } from '@/lib/finder';
import { GENRE_IDS, genreLabel } from '@/lib/finderGenres';

export const EMPTY_QUERY: FinderQuery = {
  mediaType: 'any',
  genreIds: [],
  maxRuntime: null, // neutral — "Any length" filters nothing until the user (or their ask) sets a cap
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
};

/**
 * Genre vocabulary for PARSING, which is a wider thing than the filter chips.
 *
 * `GENRE_IDS` is the canonical TMDB map and stays exactly as it is — other
 * callers depend on it. People do not speak in canonical names, though: they
 * say "animated", not "animation"; "scary", not "horror"; "docs", not
 * "documentary". These aliases live here, next to the parser that needs them,
 * so no other consumer of `GENRE_IDS` changes behaviour.
 */
export const GENRE_WORDS: Record<string, number> = {
  ...GENRE_IDS,
  animated: GENRE_IDS.animation!,
  cartoon: GENRE_IDS.animation!,
  anime: GENRE_IDS.animation!,
  scary: GENRE_IDS.horror!,
  funny: GENRE_IDS.comedy!,
  romantic: GENRE_IDS.romance!,
  'rom com': GENRE_IDS.romance!,
  'romcom': GENRE_IDS.romance!,
  doc: GENRE_IDS.documentary!,
  docs: GENRE_IDS.documentary!,
  detective: GENRE_IDS.mystery!,
  whodunit: GENRE_IDS.mystery!,
  'true crime': GENRE_IDS.crime!,
  musical: GENRE_IDS.music!,
  historical: GENRE_IDS.history!,
  supernatural: GENRE_IDS.fantasy!,
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Match a genre word with its real plurals.
 *
 * `documentary` → `documentaries`, `comedy` → `comedies`. The old scan tested
 * `name + "s"`, so every `-y` genre was invisible in the plural — which is how
 * people actually say them.
 */
function genreWordRe(name: string): RegExp {
  const base = escapeRe(name).replace(/[-\s]/g, '[-\\s]');
  const plural = name.endsWith('y') ? `${escapeRe(name.slice(0, -1))}ies` : `${base}s`;
  return new RegExp(`\\b(?:${plural}|${base})\\b`, 'gi');
}

/**
 * Words that turn the thing after them into an exclusion.
 *
 * Anchored to the END of the run-up so it only fires when the negator is what
 * immediately precedes the genre, and the run-up is cut at the nearest clause
 * break so "no horror, and comedy is fine" does not exclude comedy too.
 */
const NEGATOR =
  /\b(?:no|not|none|nothing|never|without|except|excluding|exclude|avoid|apart from|other than|rather not|don'?t (?:like|want)|do not (?:like|want)|hate|sick of|tired of)\s+(?:(?:a|an|the|any|too\s+much|much|more)\s+)?(?:about|involving|featuring|starring|centred\s+on|centered\s+on|to\s+do\s+with|set\s+in)?\s*$/i;

/**
 * SUBJECT words that are not genres.
 *
 * "boxing movies after 2020" states three constraints and TMDB has a genre for
 * exactly none of them — boxing is a keyword, not a genre. So the subject of
 * the canonical request was the one constraint with nowhere to go, and it was
 * dropped in silence.
 *
 * This is a VOCABULARY, not a lookup table: the terms are the words people use,
 * and the ids come from TMDB's own `/search/keyword` at request time
 * (`searchKeywords`). Nothing here invents an id.
 */
export const SUBJECT_TERMS = [
  'boxing', 'mma', 'wrestling', 'martial arts', 'underdog', 'heist', 'zombie', 'vampire',
  'werewolf', 'time travel', 'space', 'alien', 'robot', 'dystopia', 'post-apocalyptic',
  'spy', 'espionage', 'assassin', 'courtroom', 'legal', 'prison', 'survival', 'shipwreck',
  'serial killer', 'cold case', 'kidnapping', 'con artist', 'gangster', 'mafia', 'cartel',
  'christmas', 'holiday', 'wedding', 'small town', 'road trip', 'coming of age', 'high school',
  'dinosaur', 'superhero', 'pirate', 'samurai', 'cowboy', 'submarine', 'aviation', 'racing',
  'chess', 'cooking', 'baking', 'ballet', 'music industry', 'journalism', 'medical', 'hospital',
  'haunted house', 'exorcism', 'cult', 'conspiracy', 'whistleblower', 'biopic', 'true story',
];

/**
 * Subject terms the request names, EXCLUDING any that were negated.
 *
 * Returned as text for the caller to resolve through the existing TMDB keyword
 * lookup — this module is pure and client-safe and must not do I/O.
 */
export function parseTopicTerms(input: string): string[] {
  const t = ` ${(input ?? '').toLowerCase()} `;
  const out: string[] = [];
  for (const term of SUBJECT_TERMS) {
    const re = new RegExp(`\\b${escapeRe(term).replace(/[-\s]/g, '[-\\s]')}(?:s|ing)?\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      if (!isNegatedAt(t, m.index) && !out.includes(term)) out.push(term);
    }
  }
  return out.slice(0, 4);
}

/**
 * A PERSON the request rules out — "Movies like Rocky, but not another
 * Stallone movie", "no Tom Cruise films", "without Adam Sandler".
 *
 * Returns the candidate NAME TEXT only; the caller must resolve it against the
 * real people catalog and treat a non-resolving candidate as no exclusion.
 * Genre and subject words ("not boxing movies", "no documentaries") are
 * rejected here so a topic negation is never mistaken for a person.
 */
export function extractExcludedPerson(input: string): string | null {
  const text = (input ?? '').trim();
  if (!text) return null;
  const m =
    text.match(
      /\b(?:not|no|without|excluding)\s+(?:another|any\s+more|more)\s+([\w.'’-]+(?:\s+[\w.'’-]+){0,2}?)\s+(?:movies?|films?|flicks?|pictures?)\b/i,
    ) ??
    text.match(/\b(?:no|not)\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,2})\s+(?:movies?|films?|flicks?)\b/) ??
    text.match(/\bwithout\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){0,2})\b/);
  if (!m) return null;
  const candidate = m[1]!.trim();
  // Every word must be a plausible name part — any genre/subject/common word
  // means this negation is about content, not a person.
  const NON_NAME = new Set([
    ...Object.keys(GENRE_WORDS),
    ...SUBJECT_TERMS,
    'movie', 'movies', 'film', 'films', 'show', 'shows', 'series', 'tv',
    'foreign', 'english', 'american', 'british', 'french', 'korean', 'japanese',
    'scary', 'violent', 'long', 'short', 'new', 'old', 'recent', 'good', 'bad',
    'sad', 'dark', 'gory', 'boring', 'subtitles', 'subtitle', 'sequel', 'sequels',
    'remake', 'remakes', 'reboot', 'reboots', 'franchise', 'superhero',
  ]);
  const words = candidate.toLowerCase().split(/\s+/);
  if (words.some((w) => NON_NAME.has(w))) return null;
  return candidate;
}

/** Is the word starting at `idx` inside a negated span? */
function isNegatedAt(text: string, idx: number): boolean {
  const runUp = text.slice(Math.max(0, idx - 40), idx);
  // A clause break resets the polarity: in "no documentaries, and some comedy"
  // the negation belongs to documentaries only.
  const clause = runUp.split(/[,.;:]|\b(?:and|or|plus|with|but)\b/).pop() ?? runUp;
  return NEGATOR.test(clause);
}

/** Plain-English read-back of the constraints the parser extracted — the judge
 *  says "here's how I read your case" so the parse is never a black box. Pure. */
export function describeQuery(q: FinderQuery): string {
  const parts: string[] = [];
  if (q.similarTo) parts.push(`more like ${q.similarTo}`);
  if (q.mediaType === 'movie') parts.push('movies');
  else if (q.mediaType === 'tv') parts.push('shows');
  for (const id of q.genreIds) parts.push(genreLabel(id).toLowerCase());
  if (q.maxRuntime != null) {
    const h = Math.floor(q.maxRuntime / 60);
    const m = q.maxRuntime % 60;
    parts.push(h > 0 ? `under ${h}${m ? `h${m}m` : 'h'}` : `under ${m}m`);
  }
  if (q.sinceMonths != null) {
    const y = Math.round(q.sinceMonths / 12);
    parts.push(y >= 1 ? `from the last ${y} year${y > 1 ? 's' : ''}` : `from the last ${q.sinceMonths} months`);
  }
  // Years and exclusions are read back too. A constraint that is applied but
  // never stated is indistinguishable, from the outside, from one that was
  // dropped — and both look like the search ignoring you.
  if (q.minYear != null && q.maxYear != null) parts.push(`${q.minYear}–${q.maxYear}`);
  else if (q.minYear != null) parts.push(`${q.minYear} or later`);
  else if (q.maxYear != null) parts.push(`${q.maxYear} or earlier`);
  if (q.excludeGenreIds?.length) {
    parts.push(q.excludeGenreIds.map((id) => `no ${genreLabel(id).toLowerCase()}`).join(' · '));
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

  // Genres — POSITIVE and NEGATED, kept apart.
  //
  // "no documentaries" used to do nothing at all: the substring scan looked for
  // ` documentary ` and never matched the plural, so the exclusion had nothing
  // to attach to and vanished. Where a plural DID match, the negation was
  // ignored and the excluded genre was added as a REQUESTED one — an exclusion
  // silently inverted into a preference, which is worse than dropping it.
  const ids = new Set<number>();
  const excluded = new Set<number>();
  for (const name of Object.keys(GENRE_WORDS).sort((a, b) => b.length - a.length)) {
    const re = genreWordRe(name);
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      (isNegatedAt(t, m.index) ? excluded : ids).add(GENRE_WORDS[name]!);
    }
  }
  // Asked for AND excluded in one breath is a contradiction we do not resolve
  // by guessing. The exclusion is the more specific statement, so it wins.
  for (const id of excluded) ids.delete(id);
  q.genreIds = Array.from(ids);
  if (excluded.size) q.excludeGenreIds = Array.from(excluded);

  // Explicit years — "after 2020", "before 1995", "from the 1980s".
  //
  // `minYear`/`maxYear` already existed on FinderQuery and `runFinder` already
  // enforced them; nothing ever set them from free text, so every stated year
  // was dropped between the sentence and the search.
  // "not before 2020" MEANS "after 2020" — normalise the polarity before
  // matching, or the negated form sets the opposite bound.
  // "not/nothing before 2020" MEANS "2020 or later" — normalise negated
  // polarity before matching, or the bound lands on the wrong side.
  const ty = t
    .replace(/\b(?:not|nothing(?:\s+from)?|no\s+titles?|none)\s+before\b/g, 'after')
    .replace(/\b(?:not|nothing(?:\s+from)?|no\s+titles?|none)\s+after\b/g, 'before');
  const between = ty.match(/\bbetween\s+((?:19|20)\d{2})\s+and\s+((?:19|20)\d{2})\b/);
  const afterYear = ty.match(/\b(?:after|since|from|later than|newer than|post[- ]?)\s*((?:19|20)\d{2})\b/);
  // "before/prior to/earlier than/older than/pre-1970" EXCLUDES the boundary year
  // (before 1970 → 1969); "up to 1970" INCLUDES it. Kept as two matches so the
  // exclusive forms don't wrongly admit the named year.
  const beforeYear = ty.match(/\b(?:before|prior to|earlier than|older than|pre[- ]?)\s*((?:19|20)\d{2})\b/);
  const upToYear = ty.match(/\bup to\s*((?:19|20)\d{2})\b/);
  const decade = ty.match(/\b(?:the\s+)?((?:19|20)\d0)s\b/) ?? ty.match(/\b(?:the\s+)?['’]?(\d0)s\b/);
  if (between) {
    const a = Number(between[1]);
    const b = Number(between[2]);
    q.minYear = Math.min(a, b);
    q.maxYear = Math.max(a, b);
  }
  if (!between && afterYear) q.minYear = Number(afterYear[1]);
  if (!between && beforeYear) q.maxYear = Number(beforeYear[1]) - 1; // exclusive
  else if (!between && upToYear) q.maxYear = Number(upToYear[1]); // inclusive
  if (!between && !afterYear && !beforeYear && decade) {
    const raw = Number(decade[1]);
    // "80s" means the 1980s; "20s" in a streaming request means the 2020s.
    const start = raw >= 1900 ? raw : raw >= 30 ? 1900 + raw : 2000 + raw;
    q.minYear = start;
    q.maxYear = start + 9;
  }

  // Max runtime — "under 140 minutes" / "less than 2 hours". An explicit
  // request overrides the default cap; minutes take priority over hours.
  const minMatchStr = t.match(/(?:under|less than|below|shorter than|max)\s+(\d{2,3})\s*(?:min|minutes|mins|m)\b/);
  if (minMatchStr) q.maxRuntime = Number(minMatchStr[1]);
  else {
    const hrMatch = t.match(/(?:under|less than|below|max)\s+(\d(?:\.\d)?)\s*(?:hours?|hrs?|h)\b/);
    if (hrMatch) q.maxRuntime = Math.round(Number(hrMatch[1]) * 60);
    else {
      // People say "under two hours", not "under 2 hours".
      const WORD_HOURS: Record<string, number> = { a: 60, an: 60, one: 60, two: 120, three: 180 };
      const wordHr = t.match(/(?:under|less than|below|shorter than|max)\s+(an?|one|two|three)\s+hours?\b/);
      if (wordHr) q.maxRuntime = WORD_HOURS[wordHr[1]!]!;
      else if (/(?:under|less than|about)\s+an?\s+hour\s+and\s+a\s+half\b/.test(t)) q.maxRuntime = 90;
    }
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

  // Pace.
  if (/\bslow[- ]?burn\b|\bslow[- ]?paced?\b|\bdeliberate\b/.test(t)) q.pace = 15;
  else if (/\badrenaline\b|\bfast[- ]?paced?\b|\bhigh[- ]?octane\b|\bnon[- ]?stop\b|\bedge of (?:my|your) seat\b/.test(t)) q.pace = 90;

  return q;
}
