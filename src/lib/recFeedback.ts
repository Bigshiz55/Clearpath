import 'server-only';
import { serverEnv } from '@/lib/env';
import { GENRE_IDS, genreIdFromName, genreLabel } from '@/lib/finderGenres';

/**
 * Turn plain-English feedback on a recommendation list ("too many old movies,
 * I don't like westerns") into concrete filters the recommender can apply on a
 * recalculate. Deterministic regex pass always runs; an optional gpt-4o-mini
 * pass refines it (understands negations / vibe), and its result is merged in.
 * Everything degrades to "no change" on any failure — real filters only.
 */
export interface RecFilters {
  excludeGenreIds: number[];
  mediaType: 'movie' | 'tv' | 'any';
  minYear: number | null; // "too many old movies" → a recency floor
  maxYear: number | null; // "give me the classics" → an age floor
  maxRuntime: number | null; // "too long" → minutes ceiling
}

export const NO_FILTERS: RecFilters = {
  excludeGenreIds: [],
  mediaType: 'any',
  minYear: null,
  maxYear: null,
  maxRuntime: null,
};

export function hasFilters(f: RecFilters): boolean {
  return (
    f.excludeGenreIds.length > 0 ||
    f.mediaType !== 'any' ||
    f.minYear != null ||
    f.maxYear != null ||
    f.maxRuntime != null
  );
}

/** A short human read-back of what a recalculation changed. */
export function describeFilters(f: RecFilters): string {
  const parts: string[] = [];
  for (const id of f.excludeGenreIds) parts.push(`no ${genreLabel(id).toLowerCase()}`);
  if (f.mediaType === 'movie') parts.push('movies only');
  else if (f.mediaType === 'tv') parts.push('shows only');
  if (f.minYear != null) parts.push(`${f.minYear} or newer`);
  if (f.maxYear != null) parts.push(`${f.maxYear} or older`);
  if (f.maxRuntime != null) {
    const h = Math.floor(f.maxRuntime / 60);
    const m = f.maxRuntime % 60;
    parts.push(`under ${h > 0 ? `${h}${m ? `h${m}m` : 'h'}` : `${m}m`}`);
  }
  return parts.join(' · ');
}

/** Regex-only parse — works with no OpenAI key. */
export function naiveParseFeedback(text: string, nowYear: number): RecFilters {
  const t = ` ${text.toLowerCase()} `;
  const f: RecFilters = { excludeGenreIds: [], mediaType: 'any', minYear: null, maxYear: null, maxRuntime: null };

  // Any genre named in feedback is treated as a dislike, unless clearly "more X".
  const ex = new Set<number>();
  for (const name of Object.keys(GENRE_IDS)) {
    const named =
      t.includes(` ${name} `) || t.includes(`${name}s `) || t.includes(` ${name},`) || t.includes(` ${name}.`);
    if (!named) continue;
    const positive = new RegExp(`\\b(?:more|love|want(?: more)?|add)\\s+${name}`).test(t);
    if (!positive) ex.add(GENRE_IDS[name]!);
  }
  f.excludeGenreIds = Array.from(ex);

  // Old vs new.
  const wantsNewer = /\b(old|older|dated|too old|newer|more recent|recent|modern)\b/.test(t);
  const wantsOlder = /\b(too new|too recent|classics?|old[- ]school|vintage|older movies)\b/.test(t) && !/\bnewer\b/.test(t);
  if (wantsOlder) f.maxYear = nowYear - 20;
  else if (wantsNewer) f.minYear = nowYear - 12;

  // Media type.
  const fewerTv = /too many (?:shows|series|tv)|less (?:tv|shows)|no (?:tv|shows)|more movies|movies only/.test(t);
  const fewerMovies = /too many movies|less movies|no movies|more (?:shows|series|tv)|shows only|tv only/.test(t);
  if (fewerTv && !fewerMovies) f.mediaType = 'movie';
  else if (fewerMovies && !fewerTv) f.mediaType = 'tv';

  // Runtime.
  const mn = t.match(/(?:under|less than|max)\s+(\d{2,3})\s*(?:min|minutes|mins|m)\b/);
  const hr = t.match(/(?:under|less than|no longer than|max)\s+(\d(?:\.\d)?)\s*(?:hours?|hrs?|h)\b/);
  if (mn) f.maxRuntime = Number(mn[1]);
  else if (hr) f.maxRuntime = Math.round(Number(hr[1]) * 60);
  else if (/\btoo long\b|\bnothing (?:too )?long\b|\bshorter\b/.test(t)) f.maxRuntime = 130;

  return f;
}

interface RawFb {
  excludeGenres?: string[];
  mediaType?: string;
  newerThanYears?: number | null;
  wantOlder?: boolean;
  maxRuntimeMinutes?: number | null;
}

const SYSTEM = `The user is looking at a list of movie/TV recommendations and telling you what to change about it. Convert their feedback into JSON adjustments. Understand negations and "too many X". Return ONLY a JSON object; omit fields you're unsure about.
Fields:
- excludeGenres: genre names to remove, chosen from: action, adventure, animation, comedy, crime, documentary, drama, family, fantasy, history, horror, music, mystery, romance, "science fiction", thriller, war, western. (e.g. "I don't like westerns" -> ["western"]; "too much violence / nothing scary" -> ["horror","war"])
- mediaType: "movie" if they want fewer shows / more movies; "tv" if the reverse; otherwise "any"
- newerThanYears: a number, if they say the titles are too old or want newer ("too many old movies" -> 12)
- wantOlder: true only if they explicitly want older / classic titles
- maxRuntimeMinutes: a number if they say things are too long ("nothing over 2 hours" -> 120)
Examples:
"too many old movies, and i don't like westerns" -> {"excludeGenres":["western"],"newerThanYears":12}
"more shows, less movies" -> {"mediaType":"tv"}
"nothing over 2 hours and no horror" -> {"excludeGenres":["horror"],"maxRuntimeMinutes":120}`;

function toFilters(raw: RawFb, nowYear: number): RecFilters {
  const f: RecFilters = { excludeGenreIds: [], mediaType: 'any', minYear: null, maxYear: null, maxRuntime: null };
  if (Array.isArray(raw.excludeGenres)) {
    f.excludeGenreIds = raw.excludeGenres
      .map((g) => genreIdFromName(String(g)))
      .filter((n): n is number => n != null);
  }
  if (raw.mediaType === 'movie' || raw.mediaType === 'tv') f.mediaType = raw.mediaType;
  if (typeof raw.newerThanYears === 'number' && raw.newerThanYears > 0) {
    f.minYear = nowYear - Math.min(60, Math.round(raw.newerThanYears));
  }
  if (raw.wantOlder) f.maxYear = nowYear - 20;
  if (typeof raw.maxRuntimeMinutes === 'number') f.maxRuntime = Math.max(30, Math.min(300, raw.maxRuntimeMinutes));
  return f;
}

async function parseFeedbackAI(text: string, nowYear: number): Promise<RecFilters | null> {
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
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text.slice(0, 400) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return toFilters(JSON.parse(content) as RawFb, nowYear);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Parse feedback into filters — AI-led when a key is present, always backed by
 *  the regex pass (their genre excludes are unioned so nothing slips through). */
export async function parseRecFeedback(text: string): Promise<RecFilters> {
  const nowYear = new Date().getFullYear();
  const naive = naiveParseFeedback(text, nowYear);
  const ai = await parseFeedbackAI(text, nowYear).catch(() => null);
  if (!ai) return naive;
  return {
    excludeGenreIds: Array.from(new Set([...ai.excludeGenreIds, ...naive.excludeGenreIds])),
    mediaType: ai.mediaType !== 'any' ? ai.mediaType : naive.mediaType,
    minYear: ai.minYear ?? naive.minYear,
    maxYear: ai.maxYear ?? naive.maxYear,
    maxRuntime: ai.maxRuntime ?? naive.maxRuntime,
  };
}
