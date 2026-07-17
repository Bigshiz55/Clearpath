import 'server-only';
import { serverEnv } from '@/lib/env';
import type { FinderQuery } from '@/lib/finder';
import { EMPTY_QUERY } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import { searchPeople } from '@/lib/tmdb/client';

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
  count?: number | null;
}

const SYSTEM = `You convert a person's plain-English request for something to watch into JSON search filters. Return ONLY a JSON object. Omit fields you're unsure about (do not guess).

Fields:
- mediaType: "movie" | "tv" | "any"
- genres: array of genre names from: action, adventure, animation, comedy, crime, documentary, drama, family, fantasy, history, horror, music, mystery, romance, "science fiction", thriller, war, western
- excludeGenres: genre names to AVOID (e.g. "no horror")
- maxRuntimeMinutes: number (movies) if they mention a length limit ("under 2 hours" -> 120)
- sinceYears: number, if they want recent titles ("from the last 5 years" -> 5; "90s" is not this)
- minAudiencePct: 0-100, audience/popcorn score threshold ("over 70%" -> 70)
- minImdb: 0-10, IMDb rating threshold ("imdb above 8" -> 8)
- minMatchPct: 0-100, personal match threshold
- englishAudioOnly: true if they want English audio
- allEpisodesOut: true if they want a fully-released/bingeable show
- upcoming: true if they want unreleased/upcoming titles
- liveTv: true if they specifically want what's on live TV
- pace: 0 (slow burn) to 100 (fast/adrenaline) if implied
- people: array of actor/director names mentioned ("Sigourney Weaver" -> ["Sigourney Weaver"])
- count: number of results requested ("five" -> 5)

Examples:
"five Sigourney Weaver movies with an audience score over 70%" -> {"mediaType":"movie","people":["Sigourney Weaver"],"minAudiencePct":70,"count":5}
"a slow burn korean thriller under two hours, no gore" -> {"mediaType":"movie","genres":["thriller"],"maxRuntimeMinutes":120,"pace":15}
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

  // Resolve the first named person to a TMDB cast id (cast filtering is movie-only).
  const firstPerson = Array.isArray(raw.people) ? raw.people[0] : undefined;
  if (firstPerson) {
    const people = await searchPeople(firstPerson).catch(() => []);
    const top = people[0];
    if (top) {
      q.castIds = [top.id];
      q.mediaType = 'movie';
    }
  }

  const limit = typeof raw.count === 'number' && raw.count >= 1 && raw.count <= 20 ? Math.round(raw.count) : 8;
  return { query: q, limit };
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
