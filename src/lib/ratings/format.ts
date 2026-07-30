/**
 * ONE WAY TO PRINT A RATING, EVERYWHERE.
 *
 * Rating displays were assembled per-surface, and per-surface assembly is how
 * "7.9/10 / 10" ships: the engine's `raw` string already carries the scale
 * ("7.9/10"), and a card that appends its own "/ 10" label prints the scale
 * twice. This module is the single formatter every surface goes through.
 *
 * It PARSES the engine's `raw` rather than changing how the engine writes it —
 * the deterministic engine in `src/lib/scoring/` is authoritative and stays
 * untouched (see CLAUDE.md).
 *
 * Every formatted rating carries, separately:
 *   value   — the score alone ("7.9", "85")
 *   scale   — what it is out of ("/10", "%", "/100", …), never duplicated
 *   source  — who says so ("IMDb", "Rotten Tomatoes", "Audience score", …)
 *   kind    — critic | audience | user | watchverdict
 *   detail  — plain-language provenance for tooltips/details
 *
 * HONESTY RULE: a TMDB-derived audience number is never labelled with Rotten
 * Tomatoes' Popcornmeter branding. It is an "Audience score", and the detail
 * says exactly where it came from.
 *
 * Pure. No I/O.
 */
import type { RatingSource } from '@/lib/types';

/** The one fallback string for a rating we do not hold. Never "—/10", never
 *  broken punctuation. */
export const RATING_UNAVAILABLE = 'Not available';

export type RatingKind = 'critic' | 'audience' | 'user' | 'watchverdict';

export interface FormattedRating {
  /** Who says so — the display source name. */
  source: string;
  /** The score alone, e.g. "7.9" or "85". `RATING_UNAVAILABLE` when absent. */
  value: string;
  /** The scale, e.g. "/10", "%", "/100". Empty when unavailable or unitless. */
  scale: string;
  /** Extra context parsed off the raw string, e.g. "12,345 votes". */
  note: string | null;
  kind: RatingKind;
  /** Plain-language provenance, for tooltips and detail rows. */
  detail: string;
  available: boolean;
}

/**
 * Split an engine `raw` string into score and scale.
 * Handles "7.9/10", "85%", "74/100", "3.5/5", "3.5/4", and a trailing
 * parenthetical note like "7.9/10 (12,345 votes)".
 */
export function parseRatingRaw(raw: string | null | undefined): { value: string; scale: string; note: string | null } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(%|\/\s*\d+)?\s*(?:\(([^)]*)\))?$/);
  if (!m) return { value: raw.trim(), scale: '', note: null }; // unknown shape → show as-is, never mangle
  const scale = m[2] ? m[2].replace(/\s+/g, '') : '';
  return { value: m[1]!, scale, note: m[3] ?? null };
}

/** What we say about each engine source name: display label, kind, provenance. */
const SOURCE_META: Record<string, { label: string; kind: RatingKind; detail: string }> = {
  IMDb: { label: 'IMDb', kind: 'user', detail: 'IMDb user rating, out of 10.' },
  'Rotten Tomatoes': {
    label: 'Rotten Tomatoes',
    kind: 'critic',
    detail: 'Rotten Tomatoes Tomatometer — the share of professional critics who reviewed it positively.',
  },
  'RT Audience': {
    label: 'Audience score',
    kind: 'audience',
    detail: 'Rotten Tomatoes audience score — the share of viewers who rated it positively.',
  },
  // THE HONESTY CASE. This number comes from TMDB's user votes. It is a real
  // audience signal — but it is NOT Rotten Tomatoes' Popcornmeter, and it is
  // never dressed as one.
  'TMDB Audience': {
    label: 'Audience score',
    kind: 'audience',
    detail: 'Audience score from TMDB user votes — shown when Rotten Tomatoes’ own audience score isn’t in our data feed.',
  },
  Metacritic: { label: 'Metacritic', kind: 'critic', detail: 'Metacritic Metascore — weighted average of professional critic reviews, out of 100.' },
  'Metacritic Users': { label: 'Metacritic users', kind: 'user', detail: 'Metacritic user score, out of 10.' },
  Trakt: { label: 'Trakt', kind: 'user', detail: 'Trakt user rating — the share of Trakt users who liked it.' },
  Letterboxd: { label: 'Letterboxd', kind: 'user', detail: 'Letterboxd member rating, out of 5.' },
  'Roger Ebert': { label: 'RogerEbert.com', kind: 'critic', detail: 'RogerEbert.com review rating, out of 4 stars.' },
};

/** Format one engine rating source for display. Never throws; unknown sources
 *  keep their engine name and an honest generic detail. */
export function formatRating(s: Pick<RatingSource, 'name' | 'raw' | 'available'>): FormattedRating {
  const meta = SOURCE_META[s.name] ?? { label: s.name, kind: 'critic' as RatingKind, detail: `${s.name} rating.` };
  const parsed = s.available ? parseRatingRaw(s.raw) : null;
  if (!parsed) {
    return { source: meta.label, value: RATING_UNAVAILABLE, scale: '', note: null, kind: meta.kind, detail: meta.detail, available: false };
  }
  return { source: meta.label, value: parsed.value, scale: parsed.scale, note: parsed.note, kind: meta.kind, detail: meta.detail, available: true };
}

/** The compact one-line print: "7.9/10" or "85%" — value and scale exactly
 *  once, `RATING_UNAVAILABLE` when absent. */
export function ratingText(s: Pick<RatingSource, 'name' | 'raw' | 'available'>): string {
  const f = formatRating(s);
  return f.available ? `${f.value}${f.scale}` : RATING_UNAVAILABLE;
}
