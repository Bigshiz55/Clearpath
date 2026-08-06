/**
 * REFINEMENT-STATE MODEL (pure, no I/O).
 *
 * The release-mission contract for filters and refinements:
 *
 *   1. Constraint layers stay separate — the original ask's parsed constraints
 *      (`queryConstraints`), account-level saved preferences
 *      (`savedPreferences`), and this session's slider/toggle edits
 *      (`temporaryRefinements`) are never merged blindly. The merge order is
 *      explicit: saved < query < temporary (only keys the user actually
 *      touched override).
 *   2. Every optional refinement has a genuine neutral state. "Any" maps to
 *      null / absent — never to a secret numeric threshold.
 *   3. The effective constraints produce a DETERMINISTIC canonical key. Two
 *      states that mean the same thing (e.g. genre order, minAudience 0 vs
 *      null, absent vs empty array) produce the SAME key; any change to an
 *      effective constraint produces a DIFFERENT key. The key is what decides
 *      "these results are stale relative to the controls" and what a cache
 *      would be keyed on.
 *   4. Active (non-neutral) constraints are enumerable as human-readable chips
 *      so the UI can always show what's filtering the results.
 */

import type { FinderQuery } from '@/lib/finder';
import { EMPTY_QUERY } from '@/lib/finderParse';

/** The separated constraint layers (never merged blindly). */
export interface ConstraintLayers {
  /** Parsed from the user's ask text — what they explicitly asked for. */
  queryConstraints: FinderQuery;
  /** Account-level defaults (e.g. "only on my services" when configured). Applied ONLY where the ask is neutral. */
  savedPreferences: Partial<FinderQuery>;
  /** Slider/toggle edits made after the ask — only keys the user touched. */
  temporaryRefinements: Partial<FinderQuery>;
}

/**
 * Merge the layers into the effective constraints with explicit precedence:
 * temporary (user just touched it) > query (user asked for it) > saved
 * (account default). Saved preferences apply only where the ask left the field
 * neutral, so "spanish movies" is never silently narrowed by a saved English-
 * audio preference.
 */
export function effectiveConstraints(layers: ConstraintLayers): FinderQuery {
  const { queryConstraints, savedPreferences, temporaryRefinements } = layers;
  const out: FinderQuery = { ...queryConstraints };
  for (const [k, v] of Object.entries(savedPreferences) as [keyof FinderQuery, unknown][]) {
    if (v == null) continue;
    if (isNeutralValue(k, out[k])) (out as unknown as Record<string, unknown>)[k] = v;
  }
  for (const [k, v] of Object.entries(temporaryRefinements) as [keyof FinderQuery, unknown][]) {
    if (v === undefined) continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Whether a field value is the neutral ("Any") state for that field. */
function isNeutralValue(key: keyof FinderQuery, value: unknown): boolean {
  const neutral = (EMPTY_QUERY as unknown as Record<string, unknown>)[key];
  if (Array.isArray(value)) return value.length === 0;
  if (value == null) return true;
  // Numeric minimums: 0 means "Any" (sliders park at 0 / far-left).
  if ((key === 'minAudience' || key === 'minImdb' || key === 'minMatch') && value === 0) return true;
  return value === neutral;
}

/**
 * Normalize a query to its canonical semantic form: neutral values become
 * null/absent, arrays are sorted + deduped, absent optional arrays and empty
 * arrays are identical. Two queries that mean the same thing normalize
 * identically.
 */
export function normalizeQuery(q: FinderQuery): Record<string, unknown> {
  const sortNums = (a?: number[] | null) => (a && a.length ? [...new Set(a)].sort((x, y) => x - y) : null);
  const sortStrs = (a?: string[] | null) => (a && a.length ? [...new Set(a)].sort() : null);
  const min = (v: number | null | undefined) => (v == null || v === 0 ? null : v);
  return {
    mediaType: q.mediaType === 'movie' || q.mediaType === 'tv' ? q.mediaType : null,
    genreIds: sortNums(q.genreIds),
    excludeGenreIds: sortNums(q.excludeGenreIds),
    maxRuntime: q.maxRuntime ?? null,
    sinceMonths: q.sinceMonths ?? null,
    minAudience: min(q.minAudience),
    minImdb: min(q.minImdb),
    minMatch: min(q.minMatch),
    englishAudioOnly: q.englishAudioOnly || null,
    onMyServices: q.onMyServices || null,
    streamItOnly: q.streamItOnly || null,
    bingeableOnly: q.bingeableOnly || null,
    upcoming: q.upcoming || null,
    liveOnly: q.liveOnly || null,
    pace: q.pace ?? null,
    providerIds: sortNums(q.providerIds),
    castIds: sortNums(q.castIds),
    keywordIds: sortNums(q.keywordIds),
    minYear: q.minYear ?? null,
    maxYear: q.maxYear ?? null,
    originCountries: sortStrs(q.originCountries),
    originalLanguages: sortStrs(q.originalLanguages),
    similarTo: q.similarTo?.trim() || null,
  };
}

/**
 * Deterministic canonical key for (effective constraints, ask text, watcher).
 * Key equality ⇔ the request means the same thing. This is the staleness
 * detector ("controls changed since these results were fetched") and the only
 * legitimate cache key for finder results.
 */
export function canonicalQueryKey(q: FinderQuery, text: string, watcherName: string | null): string {
  const norm = normalizeQuery(q);
  // Drop nulls so "absent" and "neutral" serialize identically, then emit in
  // sorted key order so property insertion order can never change the key.
  const compact: Record<string, unknown> = {};
  for (const k of Object.keys(norm).sort()) {
    if (norm[k] != null) compact[k] = norm[k];
  }
  return JSON.stringify({ t: text.trim().toLowerCase(), w: watcherName ?? null, q: compact });
}

/** Human-readable chips for every ACTIVE (non-neutral) constraint. */
export function activeFilterChips(q: FinderQuery): string[] {
  const chips: string[] = [];
  if (q.mediaType === 'movie') chips.push('Movies');
  if (q.mediaType === 'tv') chips.push(q.liveOnly ? 'Live TV' : 'Shows');
  if (q.maxRuntime != null) chips.push(`≤ ${q.maxRuntime} min`);
  if (q.sinceMonths != null) chips.push(`Last ${Math.max(1, Math.round(q.sinceMonths / 12))} yr`);
  if (q.minAudience) chips.push(`Audience ${q.minAudience}%+`);
  if (q.minImdb) chips.push(`IMDb ${q.minImdb.toFixed(1)}+`);
  if (q.minMatch) chips.push(`Match ${q.minMatch}+`);
  if (q.englishAudioOnly) chips.push('English audio');
  if (q.streamItOnly) chips.push('“Stream It” only');
  if (q.bingeableOnly) chips.push('All episodes out');
  if (q.upcoming) chips.push('Upcoming only');
  if (q.onMyServices) chips.push('My services');
  if (q.providerIds?.length) chips.push(`${q.providerIds.length} service${q.providerIds.length === 1 ? '' : 's'}`);
  // A required subject ("Boxing") is the constraint the user actually named —
  // it shows as its own chip and is never collapsed into a "N genres" count.
  if (q.subjectLabel) chips.push(q.subjectLabel);
  if (q.genreIds.length) chips.push(`${q.genreIds.length} genre${q.genreIds.length === 1 ? '' : 's'}`);
  if (q.excludeKeywordIds?.length) chips.push(`${q.excludeKeywordIds.length} subject excluded`);
  if (q.excludeGenreIds?.length) chips.push(`${q.excludeGenreIds.length} excluded`);
  if (q.originCountries?.length) chips.push(q.originCountries.join('/'));
  return chips;
}
