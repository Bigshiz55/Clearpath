import 'server-only';
import { serverEnv } from '@/lib/env';
import type { FinderQuery } from '@/lib/finder';
import { EMPTY_QUERY } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import { searchPeople, searchKeywords } from '@/lib/tmdb/client';
import { DEFAULT_RESULT_COUNT, MAX_REQUESTED_COUNT } from '@/lib/nlu/count';
import { stripRequestFrame } from '@/lib/nlu/requestFrame';
import type { ConsumedEntity } from '@/lib/nlu/consumedEntities';

/**
 * Turn a free-form ask into structured search filters using the LLM — so the
 * judge understands almost anything ("five Sigourney Weaver movies with an
 * audience score over 70%", "a slow-burn Korean thriller under two hours").
 *
 * IMPORTANT: the AI only fills SEARCH FILTERS. It never scores or ranks — the
 * deterministic finder still computes every match score. If OPENAI_API_KEY is
 * unset or the call fails, the caller falls back to the regex parser.
 */
export interface AiAsk {
  query: FinderQuery;
  limit: number;
  /** A reference title the user compared to ("like Succession") — seeds a
   *  "more like this" search instead of a plain filter query. */
  similarTo?: string;
  /**
   * Entities this parse SPENT resolving a cast id, each carrying the user's own
   * wording alongside the catalog's name. Handed to the subject layer so those
   * occurrences cannot also become a content subject — the defect that made
   * "give me a Stallone movie" demand films about Stallone and return none.
   * See lib/nlu/consumedEntities.ts.
   */
  resolvedPeople?: ConsumedEntity[];
}

interface RawAi {
  mediaType?: string;
  genres?: string[];
  excludeGenres?: string[];
  maxRuntimeMinutes?: number | null;
  sinceYears?: number | null;
  minAudiencePct?: number | null;
  minImdb?: number | null;
  minMatchPct?: number | null;
  englishAudioOnly?: boolean;
  allEpisodesOut?: boolean;
  upcoming?: boolean;
  liveTv?: boolean;
  pace?: number | null;
  people?: string[];
  keywords?: string[];
  similarTo?: string;
  count?: number | null;
}

const SYSTEM = `You convert a person's plain-English request for something to watch into JSON search filters. Understand VIBES, TONE, PACING, TROPES, NEGATIONS, and "like X" comparisons — not just literal keywords. Return ONLY a JSON object. Omit fields you're unsure about (do not guess).

Fields:
- mediaType: "movie" | "tv" | "any"
- genres: array of genre names from: action, adventure, animation, comedy, crime, documentary, drama, family, fantasy, history, horror, music, mystery, reality, romance, "science fiction", thriller, war, western
- excludeGenres: genre names to AVOID
- keywords: array of short trope/subject/setting words (lowercase) that a movie database would tag, e.g. "heist", "time loop", "based on a true story", "corporate", "dystopia", "courtroom", "road trip", "revenge", "coming of age", "small town", "one location". Use these for specific vibes/tropes that aren't genres.
- maxRuntimeMinutes: number (movies) if they mention a length limit ("under 2 hours" -> 120)
- sinceYears: number, if they want recent titles ("from the last 5 years" -> 5; "90s" is not this)
- minAudiencePct: 0-100, audience/popcorn score threshold. Also set ~75 for "well-reviewed / critically loved / the best / acclaimed".
- minImdb: 0-10, IMDb rating threshold
- minMatchPct: 0-100, personal match threshold
- englishAudioOnly: true if they want English audio
- allEpisodesOut: true if they want a fully-released/bingeable show
- upcoming: true if they want unreleased/upcoming titles
- liveTv: true if they specifically want what's on live TV
- pace: 0 (slow burn) to 100 (fast/adrenaline). Infer from vibe: "slow-burn/meditative/quiet/atmospheric" -> ~15; "cozy/comfort/easy" -> ~35; "fast-paced/edge-of-your-seat/relentless/pulse-pounding" -> ~90.
- similarTo: a single reference TITLE if they compare ("like Succession", "in the vein of Fargo") — the show/movie name only.
- people: array of actor/director names mentioned
- count: how many RESULTS they asked for ("give me five movies" -> 5). ONLY set this when the number counts the titles they want back. A number attached to anything else is NOT a count: "under two hours" is a runtime, "the last 3 years" is a date window, "8/10 or better" is a rating, "3 seasons" is a length. If they did not say how many to return, OMIT this field.

INFERENCE RULES:
- "like Succession but a movie" -> {"mediaType":"movie","similarTo":"Succession","keywords":["corporate","family drama"],"genres":["drama"]}
- "no sad endings / nothing depressing / feel-good only" -> excludeGenres tends to add "drama" is WRONG; instead add keywords:["feel good"] and DON'T force a downer genre.
- "nothing too scary / not violent" -> excludeGenres:["horror"] (and "war" if violence).
- "highly stylized / visually stunning / great cinematography" -> keep genres/pace; these aren't filterable, so just don't block on them.
- Map tone words to genres+pace: "cozy mystery" -> genres:["mystery"], pace:35; "gritty crime" -> genres:["crime"], pace:60; "mind-bending sci-fi" -> genres:["science fiction"], keywords:["mind bending"].

Examples:
"five Sigourney Weaver movies with an audience score over 70%" -> {"mediaType":"movie","people":["Sigourney Weaver"],"minAudiencePct":70,"count":5}
"a slow burn korean thriller under two hours, no gore" -> {"mediaType":"movie","genres":["thriller"],"maxRuntimeMinutes":120,"pace":15}
"a fast-paced corporate thriller like Succession but a movie" -> {"mediaType":"movie","genres":["thriller","drama"],"keywords":["corporate"],"similarTo":"Succession","pace":85}
"cozy feel-good shows, nothing sad, all out so i can binge" -> {"mediaType":"tv","keywords":["feel good"],"pace":35,"allEpisodesOut":true}
"bingeable sci-fi shows imdb above 8" -> {"mediaType":"tv","genres":["science fiction"],"minImdb":8,"allEpisodesOut":true}`;

async function toQuery(raw: RawAi): Promise<AiAsk> {
  const q: FinderQuery = { ...EMPTY_QUERY, genreIds: [], maxRuntime: null };

  if (raw.mediaType === 'movie' || raw.mediaType === 'tv') q.mediaType = raw.mediaType;
  if (Array.isArray(raw.genres)) {
    q.genreIds = raw.genres.map((g) => genreIdFromName(g)).filter((n): n is number => n != null).slice(0, 6);
  }
  if (Array.isArray(raw.excludeGenres)) {
    const ex = raw.excludeGenres.map((g) => genreIdFromName(g)).filter((n): n is number => n != null);
    if (ex.length) q.excludeGenreIds = ex;
  }
  if (typeof raw.maxRuntimeMinutes === 'number') q.maxRuntime = Math.max(30, Math.min(300, raw.maxRuntimeMinutes));
  if (typeof raw.sinceYears === 'number' && raw.sinceYears > 0) q.sinceMonths = Math.round(raw.sinceYears * 12);
  if (typeof raw.minAudiencePct === 'number') q.minAudience = Math.max(0, Math.min(100, raw.minAudiencePct));
  if (typeof raw.minImdb === 'number') q.minImdb = Math.max(0, Math.min(10, raw.minImdb));
  if (typeof raw.minMatchPct === 'number') q.minMatch = Math.max(0, Math.min(100, raw.minMatchPct));
  if (raw.englishAudioOnly) q.englishAudioOnly = true;
  if (raw.allEpisodesOut) q.bingeableOnly = true;
  if (raw.upcoming) q.upcoming = true;
  if (raw.liveTv) { q.liveOnly = true; q.mediaType = 'tv'; }
  if (typeof raw.pace === 'number') q.pace = Math.max(0, Math.min(100, raw.pace));

  // Resolve trope/vibe words to TMDB keyword ids so we can filter by subject
  // matter ("heist", "dystopia", "feel good"), not just genre.
  const kwTerms = (Array.isArray(raw.keywords) ? raw.keywords : [])
    .map((k) => String(k).trim())
    .filter(Boolean)
    .slice(0, 4);
  if (kwTerms.length) {
    const ids = await searchKeywords(kwTerms).catch(() => []);
    if (ids.length) q.keywordIds = ids;
  }

  // Resolve the first named person to a TMDB cast id (cast filtering is movie-only).
  const firstPerson = Array.isArray(raw.people) ? raw.people[0] : undefined;
  const resolvedPeople: ConsumedEntity[] = [];
  if (firstPerson) {
    const people = await searchPeople(firstPerson).catch(() => []);
    const top = people[0];
    if (top) {
      q.castIds = [top.id];
      q.mediaType = 'movie';
      // BOTH namings, because they are not interchangeable: the utterance may
      // say only a surname, or spell it their own way, while the catalog answers
      // with the canonical full name. The mask needs the user's wording to find
      // the occurrence and the catalog's to know what was spent.
      resolvedPeople.push({ spokenAs: firstPerson, resolvedName: top.name });
    }
  }

  // A stated count wins; otherwise it is a browse and gets a full page. The
  // fallback here used to be a literal 8 — the AI parser is the live path for
  // every free-text ask, so that 8 was the real result limit of the product no
  // matter what `DEFAULT_RESULT_LIMIT` said.
  const limit =
    typeof raw.count === 'number' && raw.count >= 1 && raw.count <= MAX_REQUESTED_COUNT
      ? Math.round(raw.count)
      : DEFAULT_RESULT_COUNT;
  const similarTo = typeof raw.similarTo === 'string' && raw.similarTo.trim() ? raw.similarTo.trim() : undefined;
  return { query: q, limit, similarTo, resolvedPeople };
}

/** A requested result count from the ask ("five …" → 5). Default 8.
 *  Re-exported from the pure NLU module so build-case/ask/finder share one
 *  parser and the evaluation framework can grade it offline. */
export { parseRequestedCount } from '@/lib/nlu/detectors';

// Words that are never part of a person's name — stripped before we treat the
// remainder as a candidate name to look up (TMDB's search fixes misspellings).
//
// The generic-noun fillers at the end ("something", "else", "to") were missing,
// so "find me something to watch tonight" reduced to "something to" — two words,
// which clears the 2-4 word guard — and spent a person lookup on it. Harmless in
// production only because the `knownFor` check below refuses the result; a
// wasted call on every plain request is still a wasted call.
const NON_NAME =
  /\b(show|me|find|get|give|recommend|want|looking|for|search|pull|up|list|please|the|some|a|an|of|in|on|with|starring|featuring|directed|by|top|best|great|good|movies?|films?|shows?|series|tv|episodes?|one|two|three|four|five|six|seven|eight|nine|ten|and|or|over|under|above|below|audience|score|rating|ratings|imdb|percent|match|new|recent|old|classic|latest|popular|trending|today|tonight|tomorrow|now|currently|this|that|week|weekend|night|right|playing|streaming|watch|funny|scary|sad|happy|short|long|bingeable|comedy|comedies|action|thriller|thrillers|drama|dramas|horror|romance|romantic|documentary|documentaries|sci|fi|fantasy|mystery|crime|western|war|animated|animation|kids|family|something|anything|everything|nothing|thing|things|stuff|else|to|too|really|just|maybe)\b/g;

/**
 * Resolve a person mentioned in the ask to a TMDB id — AI-independent. Strips
 * filler words, then fuzzy-searches TMDB people on the remainder (so "sylvester
 * stalone" still finds Sylvester Stallone). Returns null when there's no
 * confident person, so a plain request isn't hijacked into an actor search.
 */
export async function resolvePersonId(text: string): Promise<number | null> {
  return (await resolvePerson(text))?.id ?? null;
}

/**
 * The same resolution, KEEPING BOTH NAMINGS.
 *
 * `resolvePersonId` threw away everything except the id, which is why
 * "Stallone" could be spent twice: the cast filter had the number, and nothing
 * downstream knew which words had bought it, so subject detection read the
 * surname again and demanded films ABOUT Stallone.
 *
 * `spokenAs` IS NOT A SOURCE SPAN, AND MUST NOT BE READ AS ONE. It is the exact
 * string this function handed to the catalog — the language this extractor
 * ATTRIBUTED to the person — recovered from the same filtering pass, not a
 * second parse. That is a filtered token bag, not a contiguous range: the
 * stop-word list is imperfect, so for "I watched 3 movies yesterday. Give me a
 * Stallone movie." it attributes "watched yesterday stallone" and cannot tell
 * which of those three is the name. Calling that a span would be a lie, and
 * masking all of it would delete anecdote the user did say.
 *
 * The mask closes that gap from the other side: it spends only the attributed
 * words that also match the RESOLVED identity, so the residue survives and the
 * separate extractor defect stays visible. When the canonical interpreter
 * supplies a real `PersonReference.span`, it drops into the same field and the
 * approximation goes away without touching the boundary.
 */
export async function resolvePerson(
  text: string,
): Promise<{ id: number; name: string; spokenAs: string } | null> {
  /* PEEL THE REQUEST FRAME BEFORE THE STOPWORD LIST SEES IT.
     `NON_NAME` below is a good list of words that are never part of a name, and
     it was missing the entire class of words a person uses to say the answer
     should suit THEM. Measured on the reported production failure: "find me 3
     Sylvester Stallone movies you think I'll like" reduced to
     "sylvester stallone you think i'll like" — six words — and the 2–4 word
     guard, which exists for good reason, rejected it. The guard was right; it
     was being handed the wrong string. */
  const candidate = stripRequestFrame(text)
    .text.toLowerCase()
    .replace(/[0-9]+%?/g, ' ')
    .replace(NON_NAME, ' ')
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = candidate.split(' ').filter((w) => w.length > 1);
  // Require a full name (2–4 words) — a single leftover word like "today" or
  // "tonight" must never be treated as a person and hijack a plain request.
  if (words.length < 2 || words.length > 4) return null;
  const attributed = words.join(' ');
  const people = await searchPeople(attributed).catch(() => []);
  const top = people[0];
  // Require a real, findable person (has known-for credits) to avoid false hits.
  return top && top.knownFor ? { id: top.id, name: top.name, spokenAs: attributed } : null;
}

export async function parseAskWithAI(text: string): Promise<AiAsk | null> {
  const key = serverEnv.openaiKey();
  if (!key || text.trim().length < 2) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text.slice(0, 500) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const raw = JSON.parse(content) as RawAi;
    return await toQuery(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
