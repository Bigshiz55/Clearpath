/**
 * CANONICAL CONVERSATION STATE for the Judge (pure, client-safe, no I/O).
 *
 * The conversation UI shows history, but until this module each request sent
 * only the LATEST sentence — "Newer." after "Something like Rocky." reached
 * the server as the one word "Newer". This module is the fix at the
 * architectural level: one validated, structured request object that both the
 * client and the server share, updated intentionally on every turn.
 *
 * Design rules:
 * - Merge is INTENTIONAL: each turn merges, replaces, or removes specific
 *   fields; nothing is inferred by concatenating chat text.
 * - Hard constraints are never silently dropped. Every mutation this module
 *   makes is reported in `interpretation` so the UI can read the change back.
 * - Relative follow-ups ("newer", "shorter") are resolved DETERMINISTICALLY
 *   against the years/runtimes of the results the user is reacting to; with
 *   no context they fall back to documented defaults, and the read-back says
 *   exactly what was done.
 * - The state is client-held and passed with each request (validated
 *   server-side), so there is no server-side conversation store to leak
 *   between users. A userKey pins a stored conversation to the account that
 *   created it.
 */
import { naiveParseQuery, parseTopicTerms, extractExcludedPerson } from '@/lib/finderParse';
import { GENRE_IDS } from '@/lib/finderGenres';

import { resolveSource } from '@/lib/nlu/mediaOntology';

export type Monetization = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';

export interface CanonicalRequest {
  version: 1;
  /** "like Rocky" reference titles (kept as text; resolved server-side). */
  referenceTitles: string[];
  /** Subject keywords the user stated ("boxing", "heist"). */
  subjects: string[];
  includePeople: string[];
  excludePeople: string[];
  includeGenreIds: number[];
  excludeGenreIds: number[];
  minYear: number | null;
  maxYear: number | null;
  /** Exact calendar-window bounds (ISO dates) — distinct from year bounds. */
  releasedAfter: string | null;
  releasedBefore: string | null;
  maxRuntime: number | null;
  mediaType: 'movie' | 'tv' | 'any';
  excludeDocumentaries: boolean;
  originCountries: string[];
  originalLanguages: string[];
  /** Canonical provider names (resolved through the source ontology). */
  providers: string[];
  onMyServices: boolean;
  monetization: Monetization[];
  /** Titles the user said they already saw — excluded from results. */
  excludeIds: { mediaType: 'movie' | 'tv'; id: number }[];
  unseenOnly: boolean;
  /** Soft tone preferences ("funny", "dark") — ranking hints, never filters. */
  tones: string[];
  minImdb: number | null;
  minAudience: number | null;
}

export const EMPTY_REQUEST: CanonicalRequest = {
  version: 1,
  referenceTitles: [],
  subjects: [],
  includePeople: [],
  excludePeople: [],
  includeGenreIds: [],
  excludeGenreIds: [],
  minYear: null,
  maxYear: null,
  releasedAfter: null,
  releasedBefore: null,
  maxRuntime: null,
  mediaType: 'any',
  excludeDocumentaries: false,
  originCountries: [],
  originalLanguages: [],
  providers: [],
  onMyServices: false,
  monetization: [],
  excludeIds: [],
  unseenOnly: false,
  tones: [],
  minImdb: null,
  minAudience: null,
};

/** What the user is reacting to — lets "newer"/"shorter" resolve against real data. */
export interface TurnContext {
  shownYears?: number[];
  shownRuntimes?: number[];
  shownIds?: { mediaType: 'movie' | 'tv'; id: number }[];
  /** Wall-clock year, injected for determinism in tests. */
  nowYear?: number;
}

export interface TurnResult {
  state: CanonicalRequest;
  /** Plain-language read-back of every change this turn made. */
  interpretation: string[];
  /** A single concise question when two readings materially diverge. */
  clarify: string | null;
}

const clone = (s: CanonicalRequest): CanonicalRequest => ({
  ...s,
  referenceTitles: [...s.referenceTitles],
  subjects: [...s.subjects],
  includePeople: [...s.includePeople],
  excludePeople: [...s.excludePeople],
  includeGenreIds: [...s.includeGenreIds],
  excludeGenreIds: [...s.excludeGenreIds],
  originCountries: [...s.originCountries],
  originalLanguages: [...s.originalLanguages],
  providers: [...s.providers],
  monetization: [...s.monetization],
  excludeIds: [...s.excludeIds],
  tones: [...s.tones],
});

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

const addUnique = <T,>(arr: T[], v: T) => {
  if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(v))) arr.push(v);
};

/** Apply one conversational turn. Pure; same code runs on client and server. */
export function applyTurn(prev: CanonicalRequest, rawText: string, ctx: TurnContext = {}): TurnResult {
  const s = clone(prev);
  const notes: string[] = [];
  let clarify: string | null = null;
  const text = (rawText ?? '').trim();
  const t = ` ${text.toLowerCase().replace(/[’‘]/g, "'")} `;
  const nowYear = ctx.nowYear ?? new Date().getUTCFullYear();
  if (!text) return { state: s, interpretation: notes, clarify };

  // ── Relative follow-ups, resolved against what was just shown ────────────
  const med = median(ctx.shownYears ?? []);
  if (/\b(newer|more recent)\b/.test(t) && !/\bthan\s/.test(t)) {
    const bound = med != null ? med + 1 : nowYear - 5;
    s.minYear = Math.max(s.minYear ?? 0, bound);
    if (s.maxYear != null && s.maxYear < s.minYear) s.maxYear = null;
    notes.push(
      med != null
        ? `newer → ${s.minYear} or later (than the picks you just saw)`
        : `newer → ${s.minYear} or later (no results to compare against, so the last 5 years)`,
    );
  } else if (/\bolder\b/.test(t) && !/\bthan\s/.test(t)) {
    const bound = med != null ? med - 1 : nowYear - 15;
    s.maxYear = Math.min(s.maxYear ?? 9999, bound);
    if (s.minYear != null && s.minYear > s.maxYear) s.minYear = null;
    notes.push(
      med != null
        ? `older → ${s.maxYear} or earlier (than the picks you just saw)`
        : `older → ${s.maxYear} or earlier`,
    );
  } else if (/\bnot (that|so|too) old\b/.test(t) && med != null) {
    s.minYear = Math.max(s.minYear ?? 0, med);
    notes.push(`not that old → ${s.minYear} or later`);
  }

  if (/\bshorter\b/.test(t) && !/\bthan\s/.test(t)) {
    const shownMin = ctx.shownRuntimes && ctx.shownRuntimes.length > 0 ? Math.min(...ctx.shownRuntimes) : null;
    s.maxRuntime = Math.max(60, shownMin != null ? shownMin - 1 : s.maxRuntime != null ? s.maxRuntime - 30 : 100);
    notes.push(`shorter → under ${s.maxRuntime} minutes`);
  } else if (/\blonger\b/.test(t) && !/\bthan\s/.test(t) && s.maxRuntime != null) {
    s.maxRuntime = null;
    notes.push('longer → runtime limit removed');
  }

  if (/\bfunnier\b/.test(t) || /\bmore funny\b/.test(t)) {
    addUnique(s.tones, 'funny');
    addUnique(s.includeGenreIds, GENRE_IDS.comedy!);
    notes.push('funnier → leaning comedic (added comedy)');
  }
  if (/\bdarker\b/.test(t)) {
    addUnique(s.tones, 'dark');
    notes.push('darker → leaning darker in tone (ranking preference, not a filter)');
  }
  if (/\blighter\b/.test(t)) {
    addUnique(s.tones, 'light');
    s.tones = s.tones.filter((x) => x !== 'dark');
    notes.push('lighter → leaning lighter in tone');
  }

  // ── Media type ───────────────────────────────────────────────────────────
  let mediaExplicit = false;
  if (/\bonly (movies?|films?)\b/.test(t) || /\b(movies?|films?) only\b/.test(t) || /\bno (shows|series|tv)\b/.test(t)) {
    s.mediaType = 'movie';
    mediaExplicit = true;
    notes.push('only movies');
  } else if (/\bonly (shows?|series|tv)\b/.test(t) || /\b(shows?|series|tv) only\b/.test(t) || /\bno (movies?|films?)\b/.test(t)) {
    s.mediaType = 'tv';
    mediaExplicit = true;
    notes.push('only series');
  } else if (/\binclude (series|shows?|tv|movies?|films?) (too|as well)\b/.test(t) || /\b(series|shows?|movies?) too\b/.test(t)) {
    s.mediaType = 'any';
    mediaExplicit = true;
    notes.push('movies and series both');
  }

  // ── Documentaries ────────────────────────────────────────────────────────
  if (/\b(no|without|exclude|skip) documentar/.test(t) || /\bno docs\b/.test(t)) {
    s.excludeDocumentaries = true;
    addUnique(s.excludeGenreIds, GENRE_IDS.documentary!);
    notes.push('no documentaries');
  } else if (/\b(include|with) documentar/.test(t)) {
    s.excludeDocumentaries = false;
    s.excludeGenreIds = s.excludeGenreIds.filter((g) => g !== GENRE_IDS.documentary);
    notes.push('documentaries allowed again');
  }

  // ── Providers: add / remove / only ───────────────────────────────────────
  // "remove Hulu", "drop Netflix", "not on Max" → remove; "actually Peacock
  // too", "add Acorn", "include BritBox" → add; "only on Hulu" → replace.
  const providerOps: { re: RegExp; op: 'remove' | 'add' | 'replace' }[] = [
    { re: /\b(?:remove|drop|without|not on|no)\s+([a-z0-9+ ]{2,24}?)(?=[,.!?]| and | or |$)/g, op: 'remove' },
    { re: /\b(?:actually\s+)?(?:add|include|also|plus)\s+([a-z0-9+ ]{2,24}?)(?:\s+too|\s+as well)?(?=[,.!?]| and | or |$)/g, op: 'add' },
    { re: /\bonly (?:things? )?(?:on|included with|from)\s+([a-z0-9+ ]{2,24}?)(?=[,.!?]| and | or |$)/g, op: 'replace' },
    { re: /\b([a-z0-9+ ]{2,24}?)\s+too\b/g, op: 'add' },
  ];
  let replacedProviders = false;
  for (const { re, op } of providerOps) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const src = resolveSource(m[1]!.trim());
      if (!src) continue;
      if (op === 'remove') {
        if (s.providers.includes(src.canonicalName)) {
          s.providers = s.providers.filter((p) => p !== src.canonicalName);
          notes.push(`removed ${src.canonicalName}`);
        }
      } else {
        if (op === 'replace' && !replacedProviders) {
          s.providers = [];
          replacedProviders = true;
        }
        if (!s.providers.includes(src.canonicalName)) {
          s.providers.push(src.canonicalName);
          notes.push(`${op === 'replace' ? 'only ' : 'added '}${src.canonicalName}`);
        }
      }
    }
  }

  // ── "Watch tonight" / my services / monetization ─────────────────────────
  if (/\b(watch|see) tonight\b/.test(t) || /\bcan watch (right )?now\b/.test(t)) {
    s.onMyServices = true;
    s.monetization = ['flatrate', 'free', 'ads'];
    notes.push('watchable tonight → on your services, included or free (no rentals)');
  }
  if (/\bincluded with\b/.test(t) || /\bno rentals?\b/.test(t) || /\bwithout (renting|paying extra)\b/.test(t)) {
    s.monetization = ['flatrate'];
    notes.push('included with a subscription only (no rentals or purchases)');
  }
  if (/\bmy (services|subscriptions|apps)\b/.test(t)) {
    s.onMyServices = true;
    notes.push('limited to your services');
  }

  // ── History references ("I already saw those", "something else") ─────────
  if (/\b(already|just) (saw|watched|seen)\b/.test(t) || /\bseen (those|these|them|all of those)\b/.test(t)) {
    for (const id of ctx.shownIds ?? []) addUnique(s.excludeIds, id);
    s.unseenOnly = true;
    notes.push(`skipping the ${ctx.shownIds?.length ?? 0} you said you've seen`);
  }
  if (/\bsomething else\b/.test(t)) {
    for (const id of ctx.shownIds ?? []) addUnique(s.excludeIds, id);
    if (/\bwith (that|the same) (actor|actress|person|director)\b/.test(t)) {
      // Keep people, drop the title reference — the person is now the anchor.
      s.referenceTitles = [];
      notes.push('same person, different titles');
    } else if ((ctx.shownIds?.length ?? 0) > 0) {
      notes.push('excluding what you already saw here');
    }
  }

  // ── Full-sentence parsing (years, dates, runtime, genres, people, refs) ──
  const det = naiveParseQuery(text);
  if (det.minYear != null) {
    s.minYear = det.minYear;
    notes.push(`released ${det.minYear} or later`);
  }
  if (det.maxYear != null) {
    s.maxYear = det.maxYear;
    notes.push(`released ${det.maxYear} or earlier`);
  }
  // Exact calendar windows ("in the last five months") — a real date window,
  // not a year approximation.
  const monthWin = t.match(/\b(?:last|past|within the last)\s+(\d{1,2})\s+months?\b/);
  if (monthWin) {
    const months = Number(monthWin[1]);
    const d = new Date(Date.UTC(nowYear, new Date().getUTCMonth(), new Date().getUTCDate()));
    d.setUTCMonth(d.getUTCMonth() - months);
    s.releasedAfter = d.toISOString().slice(0, 10);
    notes.push(`released on or after ${s.releasedAfter} (exact ${months}-month window)`);
  }
  if (det.maxRuntime != null) {
    s.maxRuntime = det.maxRuntime;
    notes.push(`under ${det.maxRuntime} minutes`);
  }
  if (!mediaExplicit && (det.mediaType === 'movie' || det.mediaType === 'tv')) s.mediaType = det.mediaType;
  for (const g of det.genreIds) addUnique(s.includeGenreIds, g);
  for (const g of det.excludeGenreIds ?? []) {
    addUnique(s.excludeGenreIds, g);
    s.includeGenreIds = s.includeGenreIds.filter((x) => x !== g);
  }
  if (det.minImdb != null) s.minImdb = det.minImdb;
  if (det.minAudience != null) s.minAudience = det.minAudience;

  for (const topic of parseTopicTerms(text)) addUnique(s.subjects, topic);

  const excludedPerson = extractExcludedPerson(text);
  if (excludedPerson) {
    addUnique(s.excludePeople, excludedPerson);
    s.includePeople = s.includePeople.filter((p) => p.toLowerCase() !== excludedPerson.toLowerCase());
    notes.push(`excluding ${excludedPerson}`);
  }

  // Reference titles ("like Rocky") — take exactly what follows the cue, cut
  // at the first clause break or constraint word. The server still resolves
  // every candidate against the real catalog before trusting it.
  const refMatch = text.match(/\b(?:like|similar to)\s+(.{2,60})/i);
  if (refMatch) {
    const span = refMatch[1]!.split(
      /[,.;!?]|\s+\b(?:but|no|not|without|under|over|only|on|from|released|filmed|after|before|newer|older)\b/i,
    )[0]!;
    for (const part of span.split(/\s+(?:or|and)\s+/i).slice(0, 2)) {
      const cand = part.trim().replace(/\s+/g, ' ');
      if (
        cand.length >= 2 &&
        cand.split(' ').length <= 5 &&
        (!excludedPerson || cand.toLowerCase() !== excludedPerson.toLowerCase())
      ) {
        addUnique(s.referenceTitles, cand);
      }
    }
  }

  // ── Material ambiguity → one concise clarification ───────────────────────
  if (/\bfilmed\b/.test(t) && (det.minYear != null || monthWin)) {
    clarify =
      'Filming dates aren’t reliably available — I used the RELEASE date instead. Say "released" or "filmed is fine" to confirm.';
  }

  return { state: s, interpretation: notes, clarify };
}

// ── Chips: the visible, removable form of the state ─────────────────────────

export interface Chip {
  id: string;
  label: string;
}

export function chipsFor(s: CanonicalRequest): Chip[] {
  const chips: Chip[] = [];
  for (const r of s.referenceTitles) chips.push({ id: `ref:${r}`, label: `like ${r}` });
  for (const x of s.subjects) chips.push({ id: `subj:${x}`, label: x });
  for (const p of s.includePeople) chips.push({ id: `person:${p}`, label: p });
  for (const p of s.excludePeople) chips.push({ id: `xperson:${p}`, label: `not ${p}` });
  if (s.mediaType !== 'any') chips.push({ id: 'media', label: s.mediaType === 'movie' ? 'movies' : 'series' });
  if (s.excludeDocumentaries) chips.push({ id: 'nodocs', label: 'no documentaries' });
  if (s.minYear != null && s.maxYear != null) chips.push({ id: 'years', label: `${s.minYear}–${s.maxYear}` });
  else if (s.minYear != null) chips.push({ id: 'years', label: `${s.minYear} or later` });
  else if (s.maxYear != null) chips.push({ id: 'years', label: `${s.maxYear} or earlier` });
  if (s.releasedAfter) chips.push({ id: 'window', label: `since ${s.releasedAfter}` });
  if (s.maxRuntime != null) chips.push({ id: 'runtime', label: `under ${s.maxRuntime}m` });
  for (const p of s.providers) chips.push({ id: `prov:${p}`, label: p });
  if (s.onMyServices) chips.push({ id: 'mine', label: 'my services' });
  if (s.monetization.length > 0 && s.monetization.every((m) => m !== 'rent' && m !== 'buy')) {
    chips.push({ id: 'money', label: 'no rentals' });
  }
  if (s.unseenOnly || s.excludeIds.length > 0) chips.push({ id: 'unseen', label: 'unseen only' });
  for (const tone of s.tones) chips.push({ id: `tone:${tone}`, label: tone });
  return chips;
}

/** Remove one chip — the "correct me without restarting" mechanism. */
export function removeChip(prev: CanonicalRequest, chipId: string): CanonicalRequest {
  const s = clone(prev);
  const [kind, value] = chipId.includes(':') ? [chipId.slice(0, chipId.indexOf(':')), chipId.slice(chipId.indexOf(':') + 1)] : [chipId, ''];
  switch (kind) {
    case 'ref': s.referenceTitles = s.referenceTitles.filter((x) => x !== value); break;
    case 'subj': s.subjects = s.subjects.filter((x) => x !== value); break;
    case 'person': s.includePeople = s.includePeople.filter((x) => x !== value); break;
    case 'xperson': s.excludePeople = s.excludePeople.filter((x) => x !== value); break;
    case 'media': s.mediaType = 'any'; break;
    case 'nodocs':
      s.excludeDocumentaries = false;
      s.excludeGenreIds = s.excludeGenreIds.filter((g) => g !== GENRE_IDS.documentary);
      break;
    case 'years': s.minYear = null; s.maxYear = null; break;
    case 'window': s.releasedAfter = null; s.releasedBefore = null; break;
    case 'runtime': s.maxRuntime = null; break;
    case 'prov': s.providers = s.providers.filter((x) => x !== value); break;
    case 'mine': s.onMyServices = false; break;
    case 'money': s.monetization = []; break;
    case 'unseen': s.unseenOnly = false; s.excludeIds = []; break;
    case 'tone': s.tones = s.tones.filter((x) => x !== value); break;
  }
  return s;
}

/** Parse + validate an untrusted state object (from the client). Returns a
 *  safe state — unknown fields dropped, arrays bounded, types coerced. */
export function sanitizeRequestState(raw: unknown): CanonicalRequest {
  const r = (raw ?? {}) as Partial<CanonicalRequest>;
  const strs = (xs: unknown, max = 8): string[] =>
    Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, max) : [];
  const nums = (xs: unknown, max = 12): number[] =>
    Array.isArray(xs) ? xs.map(Number).filter((n) => Number.isFinite(n)).slice(0, max) : [];
  const yr = (v: unknown): number | null =>
    typeof v === 'number' && v >= 1880 && v <= 2100 ? Math.round(v) : null;
  const iso = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const MONETIZATION: Monetization[] = ['flatrate', 'free', 'ads', 'rent', 'buy'];
  return {
    version: 1,
    referenceTitles: strs(r.referenceTitles, 2),
    subjects: strs(r.subjects, 4),
    includePeople: strs(r.includePeople, 4),
    excludePeople: strs(r.excludePeople, 4),
    includeGenreIds: nums(r.includeGenreIds, 6),
    excludeGenreIds: nums(r.excludeGenreIds, 6),
    minYear: yr(r.minYear),
    maxYear: yr(r.maxYear),
    releasedAfter: iso(r.releasedAfter),
    releasedBefore: iso(r.releasedBefore),
    maxRuntime: typeof r.maxRuntime === 'number' && r.maxRuntime > 0 && r.maxRuntime <= 900 ? Math.round(r.maxRuntime) : null,
    mediaType: r.mediaType === 'movie' || r.mediaType === 'tv' ? r.mediaType : 'any',
    excludeDocumentaries: Boolean(r.excludeDocumentaries),
    originCountries: strs(r.originCountries, 4),
    originalLanguages: strs(r.originalLanguages, 4),
    providers: strs(r.providers, 8),
    onMyServices: Boolean(r.onMyServices),
    monetization: Array.isArray(r.monetization)
      ? r.monetization.filter((m): m is Monetization => MONETIZATION.includes(m as Monetization)).slice(0, 5)
      : [],
    excludeIds: Array.isArray(r.excludeIds)
      ? r.excludeIds
          .filter(
            (x): x is { mediaType: 'movie' | 'tv'; id: number } =>
              x != null &&
              typeof x === 'object' &&
              ((x as { mediaType?: string }).mediaType === 'movie' || (x as { mediaType?: string }).mediaType === 'tv') &&
              Number.isFinite((x as { id?: number }).id),
          )
          .slice(0, 60)
      : [],
    unseenOnly: Boolean(r.unseenOnly),
    tones: strs(r.tones, 4),
    minImdb: typeof r.minImdb === 'number' && r.minImdb >= 0 && r.minImdb <= 10 ? r.minImdb : null,
    minAudience: typeof r.minAudience === 'number' && r.minAudience >= 0 && r.minAudience <= 100 ? r.minAudience : null,
  };
}

/** True when the state carries any constraint at all. */
export function hasConstraints(s: CanonicalRequest): boolean {
  return chipsFor(s).length > 0;
}

// ── Projection: canonical state → the finder's query object ────────────────

import { EMPTY_QUERY } from '@/lib/finderParse';
import type { FinderQuery } from '@/lib/finder';

/**
 * Project the canonical state into a FinderQuery. Pure — fields that need
 * catalog resolution (subjects → keyword ids, people → person ids, provider
 * names → provider ids) are resolved by the server and merged afterwards;
 * this function carries everything the state can express by itself.
 * An exact `releasedAfter` date is converted to a day-precise window
 * (fractional sinceMonths → sinceDays in the discover layer), not a year.
 */
export function stateToQuery(s: CanonicalRequest, now: Date = new Date()): FinderQuery {
  const q: FinderQuery = { ...EMPTY_QUERY };
  q.mediaType = s.mediaType;
  q.genreIds = s.includeGenreIds.filter((g) => !s.excludeGenreIds.includes(g));
  if (s.excludeGenreIds.length > 0) q.excludeGenreIds = [...s.excludeGenreIds];
  if (s.minYear != null) q.minYear = s.minYear;
  if (s.maxYear != null) q.maxYear = s.maxYear;
  if (s.maxRuntime != null) q.maxRuntime = s.maxRuntime;
  if (s.releasedAfter) {
    const days = Math.max(1, Math.round((now.getTime() - new Date(`${s.releasedAfter}T00:00:00Z`).getTime()) / 86_400_000));
    q.sinceMonths = days / 30; // finder converts back to exact days
  }
  q.onMyServices = s.onMyServices;
  if (s.originCountries.length > 0) q.originCountries = [...s.originCountries];
  if (s.originalLanguages.length > 0) q.originalLanguages = [...s.originalLanguages];
  if (s.minImdb != null) q.minImdb = s.minImdb;
  if (s.minAudience != null) q.minAudience = s.minAudience;
  if (s.referenceTitles.length > 0) q.similarTo = s.referenceTitles.join(' / ');
  return q;
}
