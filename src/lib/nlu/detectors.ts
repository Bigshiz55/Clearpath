/**
 * Pure, dependency-free intent detectors for WatchVerdict natural-language
 * requests.
 *
 * These functions were previously module-local inside
 * `src/app/api/build-case/route.ts`. They are extracted here **verbatim** (a
 * behaviour-preserving refactor) so that:
 *   1. the production route imports them from one place, and
 *   2. the voice-search evaluation framework (`eval/`) can grade the *real*
 *      production intent extraction directly, offline, with no network.
 *
 * A parity test (`src/lib/nlu/detectors.test.ts`) freezes their behaviour.
 *
 * NOTHING here does I/O or reads env — keep it that way so it stays importable
 * from a plain test process. Taste-axis parsing (`parseNaive`) and the LLM
 * parser stay in the route; these are only the *constraint* detectors the
 * search pipeline routes on (network / platform / genre / airing window / a
 * where-to-watch title).
 */

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** The default result count when none is stated. Mirrors askParse. */
export const DEFAULT_COUNT = 8;

/** A requested result count from the ask ("five …" → 5). Default 8.
 *  Extracted verbatim from askParse so build-case/ask/finder share one parser. */
export function parseRequestedCount(text: string): number {
  const m = text.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/);
  if (!m || !m[1]) return DEFAULT_COUNT;
  const n = NUM_WORDS[m[1]] ?? Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : DEFAULT_COUNT;
}

/** Like parseRequestedCount but returns null when no count word/number is
 *  present (so the evaluator can distinguish "user said nothing" from a
 *  defaulted 8). Same first-number semantics — reproduces the known bug where
 *  "last 5 years" is misread as a count. */
export function extractCount(text: string): number | null {
  const m = text.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/);
  if (!m || !m[1]) return null;
  const n = NUM_WORDS[m[1]] ?? Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
}

/**
 * Detect when the case text is (also) an actionable "what's coming on / airing
 * in the next N hours / tonight" request, and return the horizon in hours (so we
 * can route to the live TV guide windowed to it). Null = no live-TV ask, so we
 * fall through to the normal "build DNA → Watch Now" behaviour. Conservative on
 * purpose: only an explicit airing cue or an explicit hour window routes away.
 */
export function detectAiringHorizon(text: string): number | null {
  const t = ` ${text.toLowerCase()} `;
  // Explicit "(in the) next / within N hours" — almost always means scheduling.
  const m = t.match(/(?:next|within|in the next|coming up in)\s+(\d{1,2})\s*(?:hours?|hrs?|h)\b/);
  if (m && m[1]) return Math.max(1, Math.min(48, Number(m[1])));
  // Spelled-out numbers ("the next four hours").
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const wm = t.match(/(?:next|within|in the next|coming up in)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?|h)\b/);
  if (wm && wm[1] && words[wm[1]]) return words[wm[1]]!;
  // Fuzzy windows people actually say.
  if (/next\s+(?:a\s+)?couple(?:\s+of)?\s+hours/.test(t)) return 3;
  if (/next\s+few\s+hours/.test(t)) return 4;
  // A clear "on the air" cue, without a number.
  const airing = /(coming on|what'?s on|whats on|on tv|on t\.v\.|on television|\bairing\b|on right now|on the air|on later|live tv|on tonight|what'?s airing|what'?s playing|whats playing|showing tonight|playing tonight|on air|on the tube)/.test(t);
  if (airing) {
    if (/\btonight\b|\bthis evening\b|\blater tonight\b/.test(t)) return 6; // the rest of the evening
    return 24; // generic "what's on"
  }
  return null;
}

/**
 * A more liberal temporal-window reader for use ONLY when another broadcast
 * signal is present (e.g. a named linear network). `detectAiringHorizon` stays
 * deliberately conservative — a bare "tonight" with no cue there means taste,
 * not the guide. But "AMC movies later tonight" names a linear channel, so the
 * temporal word is enough to mean broadcast. Returns a horizon in hours, or null.
 */
export function detectTemporalHorizon(text: string): number | null {
  const strong = detectAiringHorizon(text);
  if (strong != null) return strong;
  const t = ` ${text.toLowerCase()} `;
  if (/\b(right now|on now)\b/.test(t)) return 3;
  if (/\btomorrow night\b/.test(t)) return 24;
  if (/\btomorrow\b/.test(t)) return 24;
  if (/\bthis weekend\b/.test(t)) return 48;
  if (/\blater tonight\b|\bthis evening\b|\btonight\b|\blater today\b/.test(t)) return 6;
  if (/\bthis afternoon\b/.test(t)) return 6;
  // Clock times ("after 8", "at 8pm", "by 9", "before 10") → rest of the evening.
  if (/\b(after|at|by|before|around)\s+\d{1,2}(:\d{2})?\s*(pm|am|o'?clock)?\b/.test(t)) return 6;
  return null;
}

/**
 * Starter alias table (a hand-seeded cold-start for the "learned corrections"
 * step): common shorthand/abbreviations that TMDB search resolves poorly on
 * their own. Applied only to the where-to-watch title lookup. The data-driven
 * version of this table grows from confirmed user corrections later.
 */
export const TITLE_ALIASES: Record<string, string> = {
  got: 'Game of Thrones',
  lotr: 'The Lord of the Rings',
  hp: 'Harry Potter',
  atla: 'Avatar: The Last Airbender',
  b99: 'Brooklyn Nine-Nine',
  iasip: "It's Always Sunny in Philadelphia",
  tlou: 'The Last of Us',
  aot: 'Attack on Titan',
  jjk: 'Jujutsu Kaisen',
  mib: 'Men in Black',
  'the office us': 'The Office',
  'the shark movie': 'Jaws',
};

export function normalizeTitleAlias(title: string): string {
  const key = title.toLowerCase().trim().replace(/[?.!]+$/, '');
  return TITLE_ALIASES[key] ?? title;
}

/**
 * Extract a specific title from a "where can I watch/stream X" or "is X on …"
 * question, so we can route to that title's page (which shows every provider).
 * Null when the text isn't a where-to-watch lookup, or the "title" is generic
 * (e.g. "is there anything good on Netflix" → that's a platform browse, not a title).
 */
export function extractWatchTitle(text: string): string | null {
  const raw = text.trim().replace(/[?!.]+$/, '');
  const low = ` ${raw.toLowerCase()} `;
  const clean = (s: string): string | null => {
    let title = s.trim().replace(/\s+on(\s+.*)?$/i, '').trim(); // drop trailing "on <platform>"
    title = title.replace(/^(the movie|the show|the film)\s+/i, '').trim();
    if (title.length < 2) return null;
    if (/^(there|anything|something|any|a|an|some|it)\b/i.test(title)) return null; // generic, not a title
    return title;
  };
  // "is <title> on <somewhere>" — availability check for a named title.
  let m = raw.match(/^\s*is\s+(.+?)\s+on\s+[a-z0-9+.\s]+$/i);
  if (m && m[1]) return clean(m[1]);
  // "where's <title> streaming/available/playing/showing" — title BEFORE the cue.
  m = raw.match(/\bwhere(?:'s|s| is)?\s+(.+?)\s+(?:streaming|available|playing|showing)\b/i);
  if (m && m[1]) return clean(m[1]);
  // Gate: is this a where-to-watch question at all? (broadened phrasings)
  const gate = /(where can i (watch|stream|see|find|get)|where to (watch|stream|find)|what (network|channel|service|platform|streaming)|which (service|platform|channel|network)|how (can|do) i (watch|stream|see|get)|who (has|streams|carries))/i;
  if (!gate.test(low)) return null;
  // "(verb) <title> [on …]" — verb precedes the title.
  m = raw.match(/(?:watch|stream|see|find|get|has|carries|streams|streaming)\s+(.+)$/i);
  if (!m || !m[1]) return null;
  return clean(m[1]);
}

/** A genre named in the request → its TVmaze genre tag, for filtering live-TV
 *  airings ("five comedies coming on…"). Null when no clear genre is named. */
export function detectGenre(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  const table: [RegExp, string][] = [
    [/\b(comed(y|ies)|sitcoms?|funny)\b/, 'Comedy'],
    [/\b(dramas?)\b/, 'Drama'],
    [/\b(crime)\b/, 'Crime'],
    [/\b(thrillers?)\b/, 'Thriller'],
    [/\b(horror|scary)\b/, 'Horror'],
    [/\b(sci-?fi|science fiction)\b/, 'Science-Fiction'],
    [/\b(rom-?coms?|romance|romantic)\b/, 'Romance'],
    [/\b(myster(y|ies))\b/, 'Mystery'],
    [/\b(action)\b/, 'Action'],
    [/\b(reality)\b/, 'Reality'],
    [/\b(sports?)\b/, 'Sports'],
    [/\b(documentar(y|ies)|docs?)\b/, 'Documentary'],
    [/\b(fantasy)\b/, 'Fantasy'],
    [/\b(family|kids?|children'?s?)\b/, 'Family'],
    [/\b(western)\b/, 'Western'],
    [/\b(anime)\b/, 'Anime'],
  ];
  for (const [re, g] of table) if (re.test(t)) return g;
  return null;
}

/** A TV network named in the request ("Lifetime movies", "on Hallmark") → the
 *  keyword we match against the airing's channel. Null when none named. */
export function detectNetwork(text: string): { key: string; name: string } | null {
  const t = ` ${text.toLowerCase()} `;
  // Ordered specific-before-general: multi-word and easily-confused names first
  // (e.g. "fox news" before bare "fox", "espn2" before "espn"). Short/ambiguous
  // tokens that double as ordinary words (own, id, we) are matched only in a
  // channel-y phrasing to avoid false hits. The key is what we match against a
  // TVmaze channel name and against the On-TV page's official-schedule links.
  const nets: [RegExp, string, string][] = [
    // News (before the broadcast/sports networks they share a name with)
    [/\bfox news\b/, 'fox news', 'Fox News'],
    [/\bfox business\b/, 'fox business', 'Fox Business'],
    [/\bmsnbc\b/, 'msnbc', 'MSNBC'],
    [/\bcnbc\b/, 'cnbc', 'CNBC'],
    [/\bcnn\b/, 'cnn', 'CNN'],
    [/\bhln\b/, 'hln', 'HLN'],
    [/\bnewsmax\b/, 'newsmax', 'Newsmax'],
    [/\bnewsnation\b/, 'newsnation', 'NewsNation'],
    // Sports
    [/\bespn\s*u\b/, 'espnu', 'ESPNU'],
    [/\bespn\s*2\b/, 'espn2', 'ESPN2'],
    [/\bespn\b/, 'espn', 'ESPN'],
    [/\bfs1\b/, 'fs1', 'FS1'],
    [/\bfs2\b/, 'fs2', 'FS2'],
    [/\bfox sports\b/, 'fox sports', 'Fox Sports'],
    [/\bnbc sports\b/, 'nbc sports', 'NBC Sports'],
    [/\bcbs sports\b/, 'cbs sports', 'CBS Sports'],
    [/\bnfl network\b/, 'nfl network', 'NFL Network'],
    [/\bnba tv\b/, 'nba tv', 'NBA TV'],
    [/\bmlb network\b/, 'mlb network', 'MLB Network'],
    [/\bnhl network\b/, 'nhl network', 'NHL Network'],
    [/\bgolf channel\b/, 'golf channel', 'Golf Channel'],
    [/\btennis channel\b/, 'tennis channel', 'Tennis Channel'],
    // Movie-heavy cable (the ones people ask about most)
    [/\blmn\b|\blifetime movie network\b/, 'lmn', 'LMN (Lifetime Movies)'],
    [/\blifetime\b/, 'lifetime', 'Lifetime'],
    [/\bhallmark\b/, 'hallmark', 'Hallmark'],
    [/\btcm\b|\bturner classic\b/, 'tcm', 'TCM'],
    // Cable entertainment
    [/\busa network\b|\busa\b/, 'usa', 'USA Network'],
    [/\bamc\b/, 'amc', 'AMC'],
    [/\btnt\b/, 'tnt', 'TNT'],
    [/\btbs\b/, 'tbs', 'TBS'],
    [/\btrutv\b|\btru tv\b/, 'trutv', 'truTV'],
    [/\bfxx\b/, 'fxx', 'FXX'],
    [/\bfxm\b/, 'fxm', 'FXM'],
    [/\bfx\b/, 'fx', 'FX'],
    [/\bbravo\b/, 'bravo', 'Bravo'],
    [/\be!(?=\s)|\be entertainment\b/, 'e!', 'E!'],
    [/\bcomedy central\b/, 'comedy central', 'Comedy Central'],
    [/\bparamount network\b/, 'paramount network', 'Paramount Network'],
    [/\bsyfy\b/, 'syfy', 'Syfy'],
    [/\bfreeform\b/, 'freeform', 'Freeform'],
    [/\bhgtv\b/, 'hgtv', 'HGTV'],
    [/\bcooking channel\b/, 'cooking channel', 'Cooking Channel'],
    [/\bfood network\b/, 'food network', 'Food Network'],
    [/\bdiscovery\b/, 'discovery', 'Discovery'],
    [/\btlc\b/, 'tlc', 'TLC'],
    [/\bhistory( channel)?\b/, 'history', 'History'],
    [/\ba&e\b/, 'a&e', 'A&E'],
    [/\bnat(ional)? geo(graphic)?( wild)?\b/, 'geographic', 'National Geographic'],
    [/\banimal planet\b/, 'animal planet', 'Animal Planet'],
    [/\bbbc america\b/, 'bbc america', 'BBC America'],
    [/\bifc\b/, 'ifc', 'IFC'],
    [/\bsundance ?tv\b/, 'sundance', 'SundanceTV'],
    [/\btv land\b/, 'tv land', 'TV Land'],
    [/\bwe tv\b|\bwetv\b/, 'we tv', 'WE tv'],
    [/\bown\b(?=.*\bnetwork\b)|\boprah winfrey network\b/, 'own', 'OWN'],
    [/\bmtv\b/, 'mtv', 'MTV'],
    [/\bvh1\b/, 'vh1', 'VH1'],
    [/\bbet\b/, 'bet', 'BET'],
    [/\bcartoon network\b/, 'cartoon network', 'Cartoon Network'],
    [/\badult swim\b/, 'adult swim', 'Adult Swim'],
    [/\bnickelodeon\b|\bnick jr\b/, 'nickelodeon', 'Nickelodeon'],
    [/\bdisney (channel|xd|junior|jr)\b/, 'disney', 'Disney Channel'],
    [/\boxygen\b/, 'oxygen', 'Oxygen'],
    [/\binvestigation discovery\b/, 'investigation discovery', 'Investigation Discovery'],
    [/\bgsn\b|\bgame show network\b/, 'gsn', 'Game Show Network'],
    [/\breelz\b/, 'reelz', 'Reelz'],
    [/\bmotortrend\b/, 'motortrend', 'MotorTrend'],
    [/\btravel channel\b/, 'travel', 'Travel Channel'],
    [/\bscience channel\b/, 'science', 'Science Channel'],
    [/\bcmt\b/, 'cmt', 'CMT'],
    [/\bpop tv\b/, 'pop', 'Pop'],
    [/\bovation\b/, 'ovation', 'Ovation'],
    // Premium
    [/\bcinemax\b/, 'cinemax', 'Cinemax'],
    [/\bshowtime\b/, 'showtime', 'Showtime'],
    [/\bstarz\b/, 'starz', 'Starz'],
    [/\bmgm\s*\+\b|\bepix\b/, 'mgm+', 'MGM+'],
    [/\bhbo\b/, 'hbo', 'HBO'],
    [/\bcomedy central\b/, 'comedy central', 'Comedy Central'],
    // Broadcast
    [/\bpbs\b/, 'pbs', 'PBS'],
    [/\btelemundo\b/, 'telemundo', 'Telemundo'],
    [/\bunivision\b/, 'univision', 'Univision'],
    [/\bion\b/, 'ion', 'ION'],
    [/\bmynetworktv\b|\bmy network tv\b/, 'mynetworktv', 'MyNetworkTV'],
    [/\b(the )?cw\b/, 'cw', 'The CW'],
    [/\babc\b/, 'abc', 'ABC'],
    [/\bcbs\b/, 'cbs', 'CBS'],
    [/\bnbc\b/, 'nbc', 'NBC'],
    [/\bfox\b/, 'fox', 'FOX'],
  ];
  for (const [re, key, name] of nets) if (re.test(t)) return { key, name };
  return null;
}

/** Named streaming service → the TMDB provider id we filter on. Strong aliases
 *  match anywhere; "bare" aliases (amazon/max/apple — risky words) only count
 *  when used as a platform, i.e. right after "on". */
export function detectPlatform(text: string): { id: number; name: string } | null {
  const t = ` ${text.toLowerCase()} `;
  const table: { id: number; name: string; strong: RegExp; bare?: RegExp }[] = [
    { id: 8, name: 'Netflix', strong: /\bnetflix\b/ },
    { id: 9, name: 'Prime Video', strong: /\b(amazon prime|prime video|amazon video)\b/, bare: /\b(amazon|prime)\b/ },
    { id: 337, name: 'Disney+', strong: /\b(disney\s*\+|disney plus)\b/, bare: /\bdisney\b/ },
    { id: 1899, name: 'Max', strong: /\b(hbo max|hbo)\b/, bare: /\bmax\b/ },
    { id: 15, name: 'Hulu', strong: /\bhulu\b/ },
    { id: 531, name: 'Paramount+', strong: /\b(paramount\s*\+|paramount plus)\b/, bare: /\bparamount\b/ },
    { id: 386, name: 'Peacock', strong: /\bpeacock\b/ },
    { id: 350, name: 'Apple TV+', strong: /\b(apple tv\s*\+?|appletv)\b/, bare: /\bapple\b/ },
    { id: 43, name: 'Starz', strong: /\bstarz\b/ },
    { id: 37, name: 'Showtime', strong: /\bshowtime\b/ },
    { id: 526, name: 'AMC+', strong: /\bamc\s*\+/ },
    { id: 73, name: 'Tubi', strong: /\btubi\b/ },
    { id: 300, name: 'Pluto TV', strong: /\bpluto\b/ },
    { id: 207, name: 'The Roku Channel', strong: /\broku\b/ },
  ];
  for (const p of table) if (p.strong.test(t)) return { id: p.id, name: p.name };
  for (const p of table) if (p.bare && new RegExp(`\\bon\\s+(?:the\\s+)?${p.bare.source}`).test(t)) return { id: p.id, name: p.name };
  return null;
}
