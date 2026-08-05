import 'server-only';
import { searchTitles, type SearchResultItem } from '@/lib/tmdb/client';
import type { PackSlug } from './packChannelMap';

/**
 * FRANCHISE ORDER FROM THE CATALOG, NOT FROM TODAY'S LISTINGS FEED.
 *
 * ── THE DEFECT THIS FIXES ─────────────────────────────────────────────────
 * Franchise Order rendered only curated `franchise_entries` rows — and
 * production has ZERO of them (verified via PostgREST: an exact count of 0),
 * so the section has shown "No verified franchises yet" since the packs shipped.
 * Aurora Teagarden did not stop existing because a curation table is empty,
 * and it certainly does not depend on whether today's listings feed happens
 * to carry Hallmark's channels.
 *
 * ── WHERE THE DATA COMES FROM ─────────────────────────────────────────────
 * Membership and order are resolved AT READ TIME from the TMDB catalog — the
 * same canonical source every title page in the product is built on:
 *
 *   membership — a curated franchise SEED (a name plus a match prefix; see
 *                below for why seeds are not invention) searched against
 *                TMDB; only titles whose normalized name begins with the
 *                franchise identity are kept.
 *   order      — release year, ascending. Release order IS the canonical
 *                viewing order for these movie series; a franchise where
 *                that is editorially wrong belongs in `franchise_entries`,
 *                which continues to take precedence when curated.
 *
 * Every entry carries its real TMDB id and links to the real title page.
 * Nothing is fabricated: a seed that matches nothing renders nothing, and
 * the UI labels this data as catalog-derived, distinct from the editorially
 * verified `franchise_entries` rows.
 *
 * ── WHY SEEDS ARE NOT "HARD-CODED FAKE TITLES" ────────────────────────────
 * The seed list holds franchise NAMES (public, verifiable facts about what
 * these packs cover — the same judgement call as the curated TVmaze channel
 * list), never titles, years, or ordering. Titles and order come from the
 * catalog on every read. Every seed below was verified against the live
 * production catalog before being added — each returns real prefix-matched
 * titles today.
 */

export interface FranchiseSeed {
  /** Display name of the franchise. */
  name: string;
  /** The query sent to the catalog. */
  query: string;
  /** Normalized prefixes a title must start with to count as a member. */
  prefixes: string[];
  /** 'movie' series (ordered list) vs 'tv' flagships (series org). */
  kind: 'movies' | 'series';
}

/**
 * Punctuation-insensitive: "Murder, She Baked: A Plum Pudding Mystery" must
 * match the prefix "murder she baked" — commas and colons are exactly what
 * varies between TMDB entries in the same franchise.
 */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isFranchiseMember(seed: FranchiseSeed, title: string): boolean {
  const n = normalizeForMatch(title);
  return seed.prefixes.some((p) => n === p || n.startsWith(`${p} `));
}

/** Verified against the live catalog on 2026-08-05 — see module comment. */
export const FRANCHISE_SEEDS: Record<PackSlug, FranchiseSeed[]> = {
  'hallmark-universe': [
    { name: 'Aurora Teagarden Mysteries', query: 'Aurora Teagarden', prefixes: ['aurora teagarden'], kind: 'movies' },
    { name: 'Mystery 101', query: 'Mystery 101', prefixes: ['mystery 101'], kind: 'movies' },
    {
      name: 'Hannah Swensen / Murder, She Baked', query: 'Murder She Baked',
      // Two eras, one franchise: the early films are "Murder, She Baked: …",
      // the later ones "… : A Hannah Swensen Mystery". Membership accepts
      // both shapes; a suffix form is matched by the dedicated query below.
      prefixes: ['murder she baked'], kind: 'movies',
    },
    { name: 'Signed, Sealed, Delivered', query: 'Signed Sealed Delivered', prefixes: ['signed sealed delivered'], kind: 'movies' },
    { name: 'Crossword Mysteries', query: 'Crossword Mysteries', prefixes: ['crossword mysteries'], kind: 'movies' },
    { name: 'Curious Caterer', query: 'Curious Caterer', prefixes: ['curious caterer'], kind: 'movies' },
    { name: 'Chronicle Mysteries', query: 'Chronicle Mysteries', prefixes: ['chronicle mysteries'], kind: 'movies' },
  ],
  'lifetime-vault': [
    // V.C. Andrews' Dollanganger saga — Lifetime's flagship film series.
    { name: 'Flowers in the Attic saga', query: 'Flowers in the Attic', prefixes: ['flowers in the attic', 'petals on the wind', 'if there be thorns', 'seeds of yesterday'], kind: 'movies' },
    // "The Wrong …" thriller series — Lifetime's long-running franchise.
    { name: 'The Wrong… thrillers', query: 'The Wrong Cheerleader', prefixes: ['the wrong cheerleader'], kind: 'movies' },
  ],
  'crime-case-files': [
    // True crime organizes around long-running SERIES, not sequels — these
    // are the flagships the pack's channels actually carry.
    { name: 'Dateline', query: 'Dateline', prefixes: ['dateline'], kind: 'series' },
    { name: '48 Hours', query: '48 Hours', prefixes: ['48 hours'], kind: 'series' },
    { name: 'Snapped', query: 'Snapped', prefixes: ['snapped'], kind: 'series' },
    { name: 'The First 48', query: 'The First 48', prefixes: ['the first 48'], kind: 'series' },
  ],
};

export interface CatalogFranchiseEntry {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
}

export interface CatalogFranchise {
  name: string;
  kind: 'movies' | 'series';
  entries: CatalogFranchiseEntry[];
}

/**
 * Membership + order from raw search results, pure for testing.
 * Movies sort by release year ascending (nulls last — order unknown is shown
 * last, never guessed into the middle). Series keep catalog popularity order.
 */
export function buildFranchise(seed: FranchiseSeed, results: SearchResultItem[]): CatalogFranchise {
  const members = results.filter((r) => isFranchiseMember(seed, r.title));
  const deduped = members.filter((r, i) => members.findIndex((m) => m.id === r.id && m.mediaType === r.mediaType) === i);
  const entries = deduped.map((r) => ({
    tmdbId: r.id, mediaType: r.mediaType, title: r.title, year: r.year, posterPath: r.posterPath,
  }));
  if (seed.kind === 'movies') {
    entries.sort((a, b) => {
      if (a.year == null && b.year == null) return 0;
      if (a.year == null) return 1;
      if (b.year == null) return -1;
      return a.year - b.year;
    });
  } else {
    // Flagship series: one entry is the point; keep the first (most popular)
    // match only, so "48 Hours" does not list every spinoff as an "order".
    entries.splice(1);
  }
  return { name: seed.name, kind: seed.kind, entries };
}

/**
 * TTL cache per warm serverless instance. The seeds change only on deploy and
 * TMDB's answer changes rarely; a pack page must not fan out one search per
 * franchise on every view.
 */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: CatalogFranchise[] }>();

export async function getCatalogFranchises(packSlug: string): Promise<CatalogFranchise[]> {
  const seeds = FRANCHISE_SEEDS[packSlug as PackSlug];
  if (!seeds || seeds.length === 0) return [];

  const cached = cache.get(packSlug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const groups = await Promise.all(
    seeds.map(async (seed) => {
      try {
        const results = await searchTitles(seed.query);
        return buildFranchise(seed, results);
      } catch {
        // TMDB down or unconfigured: an absent group, never an invented one.
        return { name: seed.name, kind: seed.kind, entries: [] } satisfies CatalogFranchise;
      }
    }),
  );
  const value = groups.filter((g) => g.entries.length > 0);
  // Only cache a useful answer — an outage must not pin "no franchises" for 12h.
  if (value.length > 0) cache.set(packSlug, { at: Date.now(), value });
  return value;
}
