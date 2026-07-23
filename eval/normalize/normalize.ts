/**
 * The normalizer runs the REAL deterministic production parsers over a raw
 * (possibly voice-transcribed) query and returns a `NormalizedQuery`. This is
 * the "what WatchVerdict actually understood" side that Layer A grades against
 * the generator's "intended meaning".
 *
 * Provenance of each field (so the grading is honest about what's real):
 *   - networks/platforms/genres(tv)/airing-window/watchTitle/count/mediaType/
 *     runtime/recency  → REAL production parsers (nlu/detectors + finderParse).
 *   - exclusions/personalization/household/ambiguities → a thin deterministic
 *     layer here. Production today parses these only partially (parseNaive
 *     negations) or via the nondeterministic LLM path; where production has no
 *     deterministic signal, the *gap* Layer A reports IS the finding. These
 *     regexes are intentionally conservative — they never invent constraints.
 *
 * Deterministic by construction: no LLM, no I/O, no clock. The LLM parse path
 * (parseAskWithAI) is nondeterministic and is exercised only in live mode.
 */
import { naiveParseQuery } from '@/lib/finderParse';
import {
  detectAiringHorizon,
  detectTemporalHorizon,
  detectGenre,
  detectNetwork,
  detectPlatform,
  extractWatchTitle,
  extractCount,
} from '@/lib/nlu/detectors';
import {
  emptyNormalized,
  type NormalizedQuery,
  type NormalizedIntent,
  type ContentType,
  UNSUPPORTED_CONTENT_TYPES,
} from '../contract';

const UNSUPPORTED_WORDS: [RegExp, ContentType][] = [
  [/\b(audiobooks?)\b/, 'audiobook'],
  [/\b(books?|novels?)\b/, 'book'],
  [/\b(podcasts?)\b/, 'podcast'],
  [/\b(songs?|music|albums?|playlists?)\b/, 'music'],
  [/\b(video ?games?|games?)\b/, 'game'],
];

function detectContentTypes(t: string, mediaType: string): ContentType[] {
  const out = new Set<ContentType>();
  for (const [re, ct] of UNSUPPORTED_WORDS) if (re.test(t)) out.add(ct);
  if (out.size) return [...out]; // unsupported wins so we can test rejection
  if (/\b(documentar(y|ies)|docs?)\b/.test(t)) out.add('documentary');
  if (/\b(sports?|games?|match|game)\b/.test(t) && /\b(live|tonight|on tv)\b/.test(t)) out.add('sports');
  if (/\b(episodes?)\b/.test(t)) out.add('episode');
  if (/\b(live tv|on tv|on television|airing|channel)\b/.test(t)) out.add('live_tv');
  if (mediaType === 'movie' || /\b(movies?|films?|flicks?)\b/.test(t)) out.add('movie');
  // "show" only as a noun (mirrors naiveParseQuery) — strip the verb "show me/us".
  const noVerbShow = t.replace(/\bshows?\s+(me|us|them)\b/g, ' ');
  if (mediaType === 'tv' || /\b(show|shows|series|sitcoms?)\b/.test(noVerbShow)) out.add('tv');
  return [...out];
}

const EXCLUSION_PATTERNS: [RegExp, string][] = [
  [/\b(no|not|nothing|avoid|without|except)\b[^.]*\bsupernatural|ghost|paranormal|haunt|witch|vampire|zombie\b/, 'supernatural'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\b(sci-?fi|science fiction)\b/, 'science_fiction'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\bnoir\b/, 'noir'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\b(slow|slow-?burn)\b/, 'slow_burn'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\bhorror|scary\b/, 'horror'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\bromance|romantic\b/, 'romance'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\b(graphic )?violence|gore\b/, 'graphic_violence'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\bsubtitles?|subbed\b/, 'subtitles'],
  [/\b(no|not|nothing|avoid|without)\b[^.]*\bdubbed|dub\b/, 'dubbed'],
];

function detectExclusions(t: string): string[] {
  const out = new Set<string>();
  for (const [re, tag] of EXCLUSION_PATTERNS) if (re.test(t)) out.add(tag);
  // history exclusions
  if (/\b(nothing|not|no)\b[^.]*\b(i'?ve |i have )?(already )?(seen|watched)\b/.test(t) || /\bhaven'?t (already )?(seen|watched)\b/.test(t)) {
    out.add('already_watched');
  }
  if (/\b(don'?t|do not|never)\b[^.]*\b(show|recommend)\b[^.]*\b(rejected|passed|said no)\b/.test(t) || /\b(previously|already) (rejected|passed)\b/.test(t)) {
    out.add('previously_rejected');
  }
  // runtime cap ("nothing longer than two hours", "under 90 minutes")
  const rm = t.match(/\b(?:longer than|over|more than|under|less than|below)\s+(\d{1,3})\s*(?:min|minutes|hours?|hrs?)\b/);
  if (rm && /\b(no|not|nothing|avoid|under|less than|below)\b/.test(t)) out.add('__runtime_capped__');
  // network exclusion ("not Hallmark")
  const negNet = t.match(/\b(?:not|no|nothing on)\s+(hallmark|lifetime|netflix|hulu|disney|hbo|peacock|prime|amazon)\b/);
  if (negNet && negNet[1]) out.add(`network:${negNet[1]}`);
  return [...out];
}

const HOUSEHOLD_NAMES = ['heather', 'amy', 'scott', 'family', 'kids', 'my wife', 'my husband', 'my kids'];

function detectHousehold(t: string): string | null {
  // "X and I", "that X would like", "my family/kids"
  for (const name of HOUSEHOLD_NAMES) {
    if (name === 'scott') continue; // the default self
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      if (name === 'family' || name === 'kids' || name.startsWith('my ')) return 'family';
      return name;
    }
  }
  return null;
}

function detectPersonalization(t: string): boolean {
  return (
    /\bthat i(?:'d| would)? (probably )?like\b/.test(t) ||
    /\bfor me\b/.test(t) ||
    /\bbased on what i (usually |normally )?watch\b/.test(t) ||
    /\bmy (taste|dna)\b/.test(t) ||
    /\b(would both like|we'd both|we would both)\b/.test(t) ||
    /\bthat .+ would like\b/.test(t) ||
    /\blike the (last|stuff|things|movies?|shows?)\b/.test(t)
  );
}

function detectContradictions(t: string, out: string[]): void {
  if (/\blight\b/.test(t) && /\b(dark|extremely dark|very dark)\b/.test(t)) out.push('tone: asked for light AND dark');
  if (/\bslow-?burn\b/.test(t) && /\b(not|nothing)\b[^.]*\bslow\b/.test(t)) out.push('pace: asked for slow-burn AND not slow');
  if (/\bnew\b/.test(t) && /\b(already (seen|watched)|i'?ve seen)\b/.test(t)) out.push('novelty: new AND already seen');
  if (/\blifetime\b/.test(t) && /\bnetflix\b/.test(t)) out.push('source: a linear network AND a streaming service');
  const counts = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/g);
  if (counts && new Set(counts).size > 1 && /\b(actually|make it|just|only)\b/.test(t)) out.push('count: two different counts stated');
}

export interface NormalizeOptions {
  /** Conversational context (e.g. a prior title) for "like the last one". */
  context?: { lastTitle?: string | null };
}

export function normalize(rawQuery: string, opts: NormalizeOptions = {}): NormalizedQuery {
  const q = emptyNormalized(rawQuery);
  const t = ` ${rawQuery.toLowerCase()} `;
  const conf: Record<string, number> = {};

  // ── Real production parsers ───────────────────────────────────────────────
  const fq = naiveParseQuery(rawQuery);
  const platform = detectPlatform(rawQuery);
  const network = detectNetwork(rawQuery);
  const tvGenre = detectGenre(rawQuery);
  // Mirror the route: a named linear network + a temporal cue is a broadcast ask.
  const horizon = detectAiringHorizon(rawQuery) ?? (network ? detectTemporalHorizon(rawQuery) : null);
  const watchTitle = extractWatchTitle(rawQuery);
  const count = extractCount(rawQuery);

  q.contentTypes = detectContentTypes(t, fq.mediaType);
  q.networks = network ? [network.key] : [];
  q.platforms = platform ? [platform] : [];
  q.genres = tvGenre ? [tvGenre] : [];
  q.requestedCount = count;
  q.watchTitle = watchTitle;
  q.excludedAttributes = detectExclusions(t);
  q.householdProfile = detectHousehold(t);
  q.personalizationRequested = detectPersonalization(t);

  if (network) conf.networks = 0.9;
  if (platform) conf.platforms = 0.9;
  if (count != null) conf.requestedCount = 0.85;

  // ── Unsupported category → rejection intent ──────────────────────────────
  const unsupported = q.contentTypes.find((c) => UNSUPPORTED_CONTENT_TYPES.has(c));
  if (unsupported) {
    q.normalizedIntent = 'unsupported';
    conf.intent = 0.8;
  } else {
    // ── Intent (mirrors the build-case cascade order) ──────────────────────
    q.normalizedIntent = pickIntent(rawQuery, t, { platform: Boolean(platform), horizon, watchTitle });
    conf.intent = 0.7;
  }

  // ── Availability window ──────────────────────────────────────────────────
  if (q.normalizedIntent === 'scheduled_broadcast_discovery' && horizon != null) {
    q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: horizon, timezone: 'USER_TIMEZONE' };
  } else if (q.normalizedIntent === 'platform_browse' || (platform && q.normalizedIntent === 'personalized_content_discovery')) {
    q.availability = { type: 'streaming', startOffsetHours: null, endOffsetHours: null, timezone: 'USER_TIMEZONE' };
  }

  // "on my services" flag folded into exclusions so the pipeline can enforce it
  if (/\b(on )?my (services|plans|subscriptions?)\b|\bthat i have\b|\bi subscribe\b/.test(t)) {
    q.excludedAttributes.push('__my_services__');
    if (q.availability.type === 'any') q.availability = { ...q.availability, type: 'streaming' };
  }

  // moods from the naive taste axes (partial, matches parseNaive coverage)
  q.moods = moodsFromText(t);

  detectContradictions(t, q.ambiguities);
  if (opts.context?.lastTitle && /\b(last (one|movie|show)|that one|what i was watching)\b/.test(t)) {
    q.watchTitle = q.watchTitle ?? opts.context.lastTitle;
  }

  q.confidence = conf;
  return q;
}

function pickIntent(
  raw: string,
  t: string,
  s: { platform: boolean; horizon: number | null; watchTitle: string | null },
): NormalizedIntent {
  // 1. where-to-watch
  if (s.watchTitle) return 'where_to_watch';
  // 1b. similar-to — require a genuine *comparison* cue (a proper-noun-ish
  // reference follows), NOT the verb "like" in "that I would like".
  if (/\b(something (just )?like|similar to|reminds me of|in the vein of|kind of like|more like|stuff like)\s+[a-z0-9]/i.test(raw)) {
    return 'similar_to';
  }
  const wantsFind =
    /\b(find|show me|recommend|suggest|something|anything|browse|watch|good|what should i watch|what can i watch)\b/.test(t) ||
    /\bon\s+/.test(t);
  // 2. platform + find
  if (s.platform && wantsFind) return 'platform_browse';
  // 3. airing horizon
  if (s.horizon != null) return 'scheduled_broadcast_discovery';
  // 4. find words + verb (genre/mood discovery)
  const findWords = /\b(movies?|films?|shows?|series|documentar(y|ies)|comed(y|ies)|funny|scary|horror|thrillers?|family|kids?|action|adventure|dramas?|romance|romantic|rom-?com|sci-?fi|fantasy|animated|anime|western|musical|feel-?good|myster(y|ies)|crime|suspense|tearjerker|date night)\b/i;
  const findVerb = /\b(find|show me|recommend|suggest|to watch|good|great|best|binge|worth watching)\b/i;
  if (findWords.test(raw) && findVerb.test(raw)) return 'personalized_content_discovery';
  // 5. taste-building fallback
  if (/\b(i (love|like|enjoy|hate|avoid)|i'?m into)\b/.test(t)) return 'taste_building';
  return 'unknown';
}

function moodsFromText(t: string) {
  const moods: NormalizedQuery['moods'] = [];
  const add = (key: string, target: number, raw: string) => moods.push({ key, target, weight: 0.5, raw });
  if (/\bdark\b|gritty|bleak/.test(t)) add('darkness', 72, 'dark');
  if (/light|feel-?good|uplifting|cozy/.test(t)) add('darkness', 28, 'light');
  if (/funny|comed|hilarious/.test(t)) add('humor', 68, 'funny');
  if (/fast-?paced|action-?packed|adrenaline/.test(t)) add('pacing', 72, 'fast-paced');
  if (/slow|slow-?burn/.test(t)) add('pacing', 15, 'slow');
  if (/complex|cerebral|smart|clever/.test(t)) add('complexity', 72, 'complex');
  return moods;
}
