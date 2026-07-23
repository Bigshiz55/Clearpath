import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { DIMENSIONS, DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { searchTitles } from '@/lib/tmdb/client';
import { rateQuizTitle } from '@/lib/actions/quiz';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface AxisSig { key: string; target: number; confidence: number }
interface Parsed { axes: AxisSig[]; likedTitles: string[]; avoidTitles: string[] }

const UNIT = 3; // evidence weight per unit of confidence (saturates in dimensionMatch)

/** LLM parse of a free-text taste statement → axis targets + named titles. */
async function parseWithAi(text: string): Promise<Parsed | null> {
  const key = serverEnv.openaiKey();
  if (!key) return null;
  const axes = DIMENSIONS.map((d) => `${d.key} (0 = ${d.low}, 100 = ${d.high})`).join('; ');
  const system =
    `Convert a person's description of their movie/TV taste into JSON. They may say what they LOVE and what they AVOID/dislike. Return ONLY:\n` +
    `{"axes":[{"key":<axis key>,"target":0-100,"confidence":0-1}],"likedTitles":[".."],"avoidTitles":[".."]}\n` +
    `Axis keys and meaning: ${axes}.\n` +
    `target = where their preference sits on that axis; include an axis ONLY when the text clearly implies it. ` +
    `"avoid supernatural / no supernatural" -> realism high; "too slow / hate slow" -> pacing high; "dark/gritty" -> darkness high; ` +
    `"light/feel-good" -> darkness low; "no violence" -> violence low; "intelligent/smart/complex" -> complexity high; "funny" -> humor high. ` +
    `likedTitles / avoidTitles = specific show/movie names they name.\n` +
    `Examples:\n` +
    `"I love intelligent crime mysteries, but I avoid supernatural stories and anything too slow" -> ` +
    `{"axes":[{"key":"complexity","target":72,"confidence":0.7},{"key":"realism","target":82,"confidence":0.8},{"key":"pacing","target":70,"confidence":0.7}],"likedTitles":[],"avoidTitles":[]}\n` +
    `"Give me feel-good comedies, nothing scary or violent — loved Ted Lasso" -> ` +
    `{"axes":[{"key":"humor","target":78,"confidence":0.8},{"key":"darkness","target":22,"confidence":0.7},{"key":"violence","target":15,"confidence":0.7},{"key":"suspense","target":25,"confidence":0.6}],"likedTitles":["Ted Lasso"],"avoidTitles":[]}\n` +
    `"gritty character-driven dramas with real emotional weight, hate cheesy rom-coms" -> ` +
    `{"axes":[{"key":"darkness","target":70,"confidence":0.7},{"key":"character","target":80,"confidence":0.8},{"key":"emotion","target":75,"confidence":0.7},{"key":"humor","target":30,"confidence":0.5},{"key":"romance","target":25,"confidence":0.6}],"likedTitles":[],"avoidTitles":[]}\n` +
    `"fast action-packed blockbusters, big stakes, don't care about deep plots — like John Wick" -> ` +
    `{"axes":[{"key":"pacing","target":85,"confidence":0.8},{"key":"stakes","target":78,"confidence":0.7},{"key":"complexity","target":30,"confidence":0.6}],"likedTitles":["John Wick"],"avoidTitles":[]}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text.slice(0, 600) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = JSON.parse(data.choices?.[0]?.message?.content ?? 'null');
    return normalize(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(raw: unknown): Parsed | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const axes: AxisSig[] = [];
  for (const a of Array.isArray(r.axes) ? r.axes : []) {
    const o = a as Record<string, unknown>;
    const key = String(o.key ?? '');
    const target = Number(o.target);
    const confidence = Number(o.confidence);
    if (DIMENSION_KEYS.includes(key) && Number.isFinite(target) && Number.isFinite(confidence)) {
      axes.push({ key, target: Math.max(0, Math.min(100, target)), confidence: Math.max(0, Math.min(1, confidence)) });
    }
  }
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 6) : []);
  return { axes, likedTitles: strs(r.likedTitles), avoidTitles: strs(r.avoidTitles) };
}

/** Regex fallback when the AI key is absent — directional but honest. */
function parseNaive(text: string): Parsed {
  const t = ` ${text.toLowerCase()} `;
  const axes: AxisSig[] = [];
  const add = (key: string, target: number) => axes.push({ key, target, confidence: 0.5 });
  if (/supernatural|paranormal|ghost|zombie|vampire|witch/.test(t)) add('realism', 80);
  if (/(science fiction|sci-?fi)/.test(t) && /(avoid|no |not |hate|dislike|too much)/.test(t)) add('realism', 76);
  if (/too slow|\bslow\b|boring|drags?|plodding/.test(t)) add('pacing', 72);
  if (/fast[- ]?paced|action[- ]?packed|adrenaline|thrilling|edge of/.test(t)) add('pacing', 72);
  if (/\bdark\b|gritty|bleak|heavy|grim/.test(t)) add('darkness', 72);
  if (/light|feel[- ]?good|uplifting|cozy|comfort|wholesome/.test(t)) add('darkness', 28);
  if (/intelligent|smart|clever|complex|cerebral|thought[- ]?provoking|mind[- ]?bend/.test(t)) add('complexity', 72);
  if (/funny|comed|hilarious|humou?r/.test(t)) add('humor', 68);
  if (/(no |not |avoid|too much|hate|less )\s*(violen|gore|brutal)/.test(t)) add('violence', 20);
  if (/(no |not |avoid|too )\s*(scary|horror|frighten)/.test(t)) add('suspense', 30);
  if (/character[- ]?driven|deep characters|great characters/.test(t)) add('character', 72);
  return { axes, likedTitles: [], avoidTitles: [] };
}

/**
 * Detect when the case text is (also) an actionable "what's coming on / airing
 * in the next N hours / tonight" request, and return the horizon in hours (so we
 * can route to the live TV guide windowed to it). Null = no live-TV ask, so we
 * fall through to the normal "build DNA → Watch Now" behaviour. Conservative on
 * purpose: only an explicit airing cue or an explicit hour window routes away.
 */
function detectAiringHorizon(text: string): number | null {
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
 * Extract a specific title from a "where can I watch/stream X" or "is X on …"
 * question, so we can route to that title's page (which shows every provider).
 * Null when the text isn't a where-to-watch lookup, or the "title" is generic
 * (e.g. "is there anything good on Netflix" → that's a platform browse, not a title).
 */
/**
 * Starter alias table (a hand-seeded cold-start for the "learned corrections"
 * step): common shorthand/abbreviations that TMDB search resolves poorly on
 * their own. Applied only to the where-to-watch title lookup. The data-driven
 * version of this table grows from confirmed user corrections later.
 */
const TITLE_ALIASES: Record<string, string> = {
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
function normalizeTitleAlias(title: string): string {
  const key = title.toLowerCase().trim().replace(/[?.!]+$/, '');
  return TITLE_ALIASES[key] ?? title;
}

function extractWatchTitle(text: string): string | null {
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
function detectGenre(text: string): string | null {
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
function detectNetwork(text: string): { key: string; name: string } | null {
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
function detectPlatform(text: string): { id: number; name: string } | null {
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

const AXIS_LEAN: Record<string, [string, string]> = {
  pacing: ['a slower burn', 'a faster pace'],
  darkness: ['a lighter tone', 'a darker tone'],
  humor: ['less comedy', 'more comedy'],
  complexity: ['an easier watch', 'more cerebral'],
  realism: ['more fantastical', 'grounded over supernatural'],
  violence: ['tamer content', 'a harder edge'],
  suspense: ['lower tension', 'high tension'],
  character: ['plot-driven', 'character-driven'],
  emotion: ['a breezier feel', 'more emotional weight'],
};

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown; source?: unknown; lang?: unknown; priorCaseId?: unknown };
    const text = typeof body.text === 'string' ? body.text.slice(0, 600).trim() : '';
    if (text.length < 4) return NextResponse.json({ error: 'Tell us a bit about what you like.' }, { status: 400 });

    // ── Step 1 of the voice/intent flywheel ────────────────────────────────
    // Log what we parsed a request as and how we routed it, plus a weak
    // "reworded" label when a request is resubmitted quickly (a likely miss).
    // This is the labeled substrate later steps mine (prompt few-shots, an alias
    // table, a fine-tune) — collect now, improve later. Guarded so a missing
    // table never blocks a response. NOTE: props include the raw text, so before
    // scaling this needs a retention/consent policy (it can carry personal phrasing).
    const caseId = crypto.randomUUID();
    const source = body.source === 'voice' ? 'voice' : 'text';
    const lang = typeof body.lang === 'string' ? body.lang.slice(0, 8) : 'en';
    const priorCaseId = typeof body.priorCaseId === 'string' ? body.priorCaseId.slice(0, 64) : null;
    const logCase = async (intentKind: string, route: string, extra: Record<string, unknown> = {}) => {
      try {
        const rows: { user_id: string; name: string; props: Record<string, unknown> }[] = [
          { user_id: user.id, name: 'case_parsed', props: { caseId, source, lang, len: text.length, text: text.slice(0, 300), intentKind, route, ...extra } },
        ];
        if (priorCaseId) rows.push({ user_id: user.id, name: 'case_reworded', props: { caseId: priorCaseId, nextCaseId: caseId } });
        await supabase.from('analytics_events').insert(rows);
      } catch {
        /* analytics_events missing (pre-migration) → skip logging */
      }
    };

    // ── Pure lookup: "where can I stream <title>?" ──────────────────────────
    // Answer it by opening that title's page (which lists every provider). No
    // DNA writes — a where-to-watch question is not a statement of taste, so we
    // must never mark the queried title as "loved".
    const whereTitle = extractWatchTitle(text);
    if (whereTitle) {
      const hits = await searchTitles(normalizeTitleAlias(whereTitle)).catch(() => []);
      const top = hits[0];
      if (top) {
        await logCase('where_to_watch', `/app/title/${top.mediaType}/${top.id}`, { title: whereTitle });
        return NextResponse.json({
          ok: true,
          learned: false,
          caseId,
          redirect: `/app/title/${top.mediaType}/${top.id}`,
          summary: `Here’s where to stream ${top.title}${top.year ? ` (${top.year})` : ''}.`,
        });
      }
      await logCase('where_to_watch_miss', 'stay', { title: whereTitle });
      return NextResponse.json({
        ok: true,
        learned: false,
        stay: true,
        caseId,
        summary: `Couldn’t find “${whereTitle}” — try the 🔎 search up top.`,
      });
    }

    const parsed = (await parseWithAi(text)) ?? parseNaive(text);

    // 1) Fold the inferred axis targets into the user's DNA signals.
    const byAxis = new Map<string, { w: number; wv: number }>();
    for (const a of parsed.axes) {
      const w = a.confidence * UNIT;
      const e = byAxis.get(a.key) ?? { w: 0, wv: 0 };
      e.w += w;
      e.wv += w * a.target;
      byAxis.set(a.key, e);
    }
    if (byAxis.size > 0) {
      try {
        const axesKeys = [...byAxis.keys()];
        const { data: existing } = await supabase
          .from('dimension_signals')
          .select('dimension_key, w_sum, wv_sum')
          .eq('user_id', user.id)
          .in('dimension_key', axesKeys);
        const prev = new Map((existing ?? []).map((r) => [r.dimension_key as string, { w: r.w_sum as number, wv: r.wv_sum as number }]));
        const now = new Date().toISOString();
        const rows = axesKeys.map((k) => {
          const addv = byAxis.get(k)!;
          const p = prev.get(k) ?? { w: 0, wv: 0 };
          return { user_id: user.id, dimension_key: k, w_sum: p.w + addv.w, wv_sum: p.wv + addv.wv, updated_at: now };
        });
        await supabase.from('dimension_signals').upsert(rows, { onConflict: 'user_id,dimension_key' });
      } catch {
        /* dimension_signals table not applied yet — degrade */
      }
    }

    // 2) Honest title seeds — the user explicitly asserted these, so a rating is legit.
    const seedTitle = async (name: string, rating: number) => {
      const hits = await searchTitles(name).catch(() => []);
      const top = hits[0];
      if (top) await rateQuizTitle({ tmdbId: top.id, mediaType: top.mediaType, title: top.title, year: top.year, posterPath: top.posterPath, rating }).catch(() => {});
    };
    await Promise.all([
      ...parsed.likedTitles.slice(0, 6).map((n) => seedTitle(n, 9)),
      ...parsed.avoidTitles.slice(0, 6).map((n) => seedTitle(n, 2)),
    ]);

    revalidateTag(`dim-profile:${user.id}`);
    revalidatePath('/app');
    revalidatePath('/app/watch');

    // Read-back so it never feels like a black box.
    const phrases = parsed.axes
      .map((a) => AXIS_LEAN[a.key]?.[a.target >= 50 ? 1 : 0])
      .filter((x): x is string => Boolean(x));
    const uniquePhrases = [...new Set(phrases)].slice(0, 4);
    const parts: string[] = [];
    if (uniquePhrases.length) parts.push(uniquePhrases.join(', '));
    if (parsed.likedTitles.length) parts.push(`loves ${parsed.likedTitles.slice(0, 3).join(', ')}`);
    const learned = byAxis.size > 0 || parsed.likedTitles.length > 0 || parsed.avoidTitles.length > 0;
    const tasteLead = parts.length ? `Locked in ${parts.join(' · ')}. ` : '';

    // If they named a streaming service ("find me something on Amazon Prime"),
    // route to Forensic Search pre-filtered to that provider and auto-run. Their
    // stated taste is folded in above and the results are still scored for them.
    const engPlatform = detectPlatform(text);
    const wantsFind = /\b(find|show me|recommend|suggest|something|anything|browse|watch|good|what should i watch|what can i watch)\b/.test(` ${text.toLowerCase()} `) || /\bon\s+/.test(` ${text.toLowerCase()} `);
    const platform = engPlatform && wantsFind ? engPlatform : null;
    if (platform) {
      await logCase('platform_find', `/app/finder?providers=${platform.id}`, { platform: platform.name });
      return NextResponse.json({
        ok: true,
        learned,
        caseId,
        redirect: `/app/finder?providers=${platform.id}&q=${encodeURIComponent(text.slice(0, 200))}&run=1`,
        summary: `${tasteLead}Finding something on ${platform.name}, scored for you.`,
      });
    }

    // If they asked for something *coming on* soon, honour that constraint: send
    // them to the live TV guide windowed to the horizon they named, rather than
    // the generic Watch Now grid. Their stated taste is still folded in above.
    const horizon = detectAiringHorizon(text);
    if (horizon != null) {
      const genre = detectGenre(text);
      const network = detectNetwork(text);
      const movieOnly = /\b(movies?|films?)\b/.test(` ${text.toLowerCase()} `);
      const params = new URLSearchParams({ within: String(horizon) });
      if (genre) params.set('genre', genre);
      if (network) params.set('network', network.key);
      if (movieOnly) params.set('type', 'movie');
      const redirect = `/app/tv?${params.toString()}`;
      await logCase('airing', redirect, { horizon, genre, network: network?.key ?? null, movieOnly });
      // Read the filters back into the summary: "Lifetime comedy movies".
      const what = [network?.name, genre?.toLowerCase(), movieOnly ? 'movies' : null].filter(Boolean).join(' ');
      return NextResponse.json({
        ok: true,
        learned,
        caseId,
        redirect,
        summary: what
          ? `${tasteLead}Here’s ${what} coming on in the next ${horizon} hours.`
          : `${tasteLead}Here’s what’s coming on in the next ${horizon} hours.`,
      });
    }

    const summary = parts.length ? `Locked in: ${parts.join(' · ')}.` : 'Got it — building your Taste DNA.';
    await logCase('taste', 'watch', { axes: parsed.axes.length, liked: parsed.likedTitles.length, avoid: parsed.avoidTitles.length });
    return NextResponse.json({ ok: true, summary, learned, caseId });
  } catch {
    return NextResponse.json({ error: 'Could not read that — try again.' }, { status: 500 });
  }
}
