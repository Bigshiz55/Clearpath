import type { PackSlug } from './packChannelMap';

/**
 * FRANCHISE SEEDS — what a franchise IS, kept apart from what the catalog
 * SAYS about it.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────
 * The previous seeds matched on a single title PREFIX. Three of the biggest
 * Hallmark franchises don't work that way — they changed title format
 * mid-run, putting the franchise name in a SUFFIX:
 *
 *   Aurora Teagarden   "A Bone to Pick: An Aurora Teagarden Mystery"  (2015-2017)
 *                      "Aurora Teagarden Mysteries: Til Death Do Us Part" (2019+)
 *   Hannah Swensen     "Murder, She Baked: A Plum Pudding Mystery"    (2015-2017)
 *                      "Sweet Revenge: A Hannah Swensen Mystery"      (2021+)
 *
 * A prefix-only matcher silently dropped a whole ERA of each franchise —
 * eleven Hannah Swensen films and seven Aurora Teagarden films — and the
 * page looked complete while being roughly half a franchise. Membership now
 * accepts a prefix OR a suffix, which is what these titles actually do.
 *
 * ── DERIVED vs EDITORIAL MEMBERSHIP ───────────────────────────────────────
 * Most franchises are DERIVED: the title itself carries the franchise name,
 * so membership is a text fact anyone can re-derive from the catalog.
 *
 * A few are not. "The Wrong ..." is a real Lifetime thriller series whose
 * titles share a phrase with unrelated films the catalog also holds — The
 * Wrong Man (Hitchcock, 1956), The Wrong Guy (1997), The Wrong Missy
 * (Netflix, 2020). No text rule separates them. Those franchises are
 * EDITORIAL: membership is an explicit list of REAL TMDB ids, each one
 * verified present in the live catalog before being written here, and the
 * UI labels them as verified rather than derived. Order still comes from
 * release dates — the ids say WHICH films, never WHAT ORDER.
 *
 * Nothing here invents a title. Every id below was returned by a real
 * catalog search; every derived group is recomputed from the catalog by
 * scripts/generateFranchiseCatalog.mjs.
 */

export interface FranchiseSeed {
  /** The Pack this franchise belongs to. Franchises are never global. */
  pack: PackSlug;
  name: string;
  /** Catalog queries to union before matching. */
  queries: string[];
  /** Normalized title prefixes that indicate membership. */
  prefixes: string[];
  /** Normalized title suffixes that indicate membership (the era problem). */
  suffixes: string[];
  kind: 'movies' | 'series';
  /**
   * derived  — membership is re-derivable from the title text alone.
   * editorial — membership is the explicit id list; text cannot decide it.
   */
  membership: 'derived' | 'editorial';
  /** Real TMDB ids, verified against the live catalog. Editorial only. */
  includeIds?: number[];
  /** Real ids that match the text rule but are NOT members. */
  excludeIds?: number[];
}

export const FRANCHISE_SEEDS: FranchiseSeed[] = [
  // ── Hallmark Universe ───────────────────────────────────────────────────
  {
    pack: 'hallmark-universe',
    name: 'Aurora Teagarden Mysteries',
    queries: ['Aurora Teagarden', 'Aurora Teagarden Mysteries'],
    prefixes: ['aurora teagarden'],
    suffixes: ['an aurora teagarden mystery'],
    kind: 'movies',
    membership: 'derived',
  },
  {
    pack: 'hallmark-universe',
    name: 'Hannah Swensen / Murder, She Baked',
    queries: ['Hannah Swensen', 'Murder She Baked'],
    prefixes: ['murder she baked'],
    suffixes: ['a hannah swensen mystery'],
    kind: 'movies',
    membership: 'derived',
  },
  {
    pack: 'hallmark-universe',
    name: 'Mystery 101',
    queries: ['Mystery 101'],
    prefixes: ['mystery 101'],
    suffixes: [],
    kind: 'movies',
    membership: 'derived',
    // "Murder 101: The Locked Room Mystery" (2008) is a different series that
    // the query returns on title similarity alone.
    excludeIds: [354463],
  },
  {
    pack: 'hallmark-universe',
    name: 'Signed, Sealed, Delivered',
    queries: ['Signed Sealed Delivered'],
    prefixes: ['signed sealed delivered'],
    suffixes: [],
    kind: 'movies',
    membership: 'derived',
  },
  {
    pack: 'hallmark-universe',
    name: 'Crossword Mysteries',
    queries: ['Crossword Mysteries'],
    prefixes: ['crossword mysteries'],
    suffixes: [],
    kind: 'movies',
    membership: 'derived',
    // A behind-the-scenes featurette, not an entry in the viewing order.
    excludeIds: [1690500],
  },
  {
    pack: 'hallmark-universe',
    name: 'Curious Caterer',
    queries: ['Curious Caterer'],
    prefixes: ['curious caterer'],
    suffixes: [],
    kind: 'movies',
    membership: 'derived',
  },
  {
    pack: 'hallmark-universe',
    name: 'Chronicle Mysteries',
    queries: ['Chronicle Mysteries'],
    prefixes: ['chronicle mysteries'],
    suffixes: [],
    kind: 'movies',
    membership: 'derived',
  },

  // ── Lifetime Movie Vault ────────────────────────────────────────────────
  {
    pack: 'lifetime-vault',
    name: 'Flowers in the Attic (Dollanganger saga)',
    queries: ['Flowers in the Attic', 'Petals on the Wind', 'If There Be Thorns', 'Seeds of Yesterday'],
    prefixes: [],
    suffixes: [],
    kind: 'movies',
    membership: 'editorial',
    // Lifetime's Dollanganger adaptations. The 1987 theatrical Flowers in the
    // Attic (15658) and the unrelated 2009 If There Be Thorns (225864) share
    // titles with these but are not part of the same run, so text cannot
    // decide membership here.
    includeIds: [236399, 267793, 333653, 333658, 203728],
  },
  {
    pack: 'lifetime-vault',
    name: 'The Wrong… thrillers',
    queries: [
      'The Wrong Cheerleader', 'The Wrong Teacher', 'The Wrong Daughter',
      'The Wrong Stepmother', 'The Wrong Prince Charming', 'The Wrong Boy Next Door',
    ],
    prefixes: [],
    suffixes: [],
    kind: 'movies',
    membership: 'editorial',
    // Every id verified present in the live catalog. Unrelated same-phrase
    // films (The Wrong Man 1956, The Wrong Guy 1997, The Wrong Missy 2020,
    // The Wrong Paris 2025) are excluded by not being listed.
    includeIds: [495776, 571622, 522915, 630054, 614154, 615114, 754739, 788757, 865050],
  },

  // ── Crime Case Files ────────────────────────────────────────────────────
  // True crime organizes around long-running SERIES, not sequels — there is
  // no "viewing order" to assert, so these render as flagships.
  {
    pack: 'crime-case-files',
    name: 'Dateline',
    queries: ['Dateline'],
    prefixes: ['dateline'],
    suffixes: [],
    kind: 'series',
    membership: 'derived',
  },
  {
    pack: 'crime-case-files',
    name: '48 Hours',
    queries: ['48 Hours'],
    prefixes: ['48 hours'],
    suffixes: [],
    kind: 'series',
    membership: 'derived',
  },
  {
    pack: 'crime-case-files',
    name: 'Snapped',
    queries: ['Snapped'],
    prefixes: ['snapped'],
    suffixes: [],
    kind: 'series',
    membership: 'derived',
  },
  {
    pack: 'crime-case-files',
    name: 'The First 48',
    queries: ['The First 48'],
    prefixes: ['the first 48'],
    suffixes: [],
    kind: 'series',
    membership: 'derived',
  },
];

/** Punctuation-insensitive: ": A Hannah Swensen Mystery" vs " a hannah swensen mystery". */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface CatalogCandidate {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
}

/**
 * Membership, pure. Editorial seeds trust their id list and nothing else;
 * derived seeds accept a prefix OR a suffix. Exclusions always win.
 */
export function isFranchiseMember(seed: FranchiseSeed, candidate: CatalogCandidate): boolean {
  if (seed.excludeIds?.includes(candidate.id)) return false;
  if (seed.membership === 'editorial') return seed.includeIds?.includes(candidate.id) ?? false;

  const n = normalizeForMatch(candidate.title);
  if (seed.prefixes.some((p) => n === p || n.startsWith(`${p} `))) return true;
  if (seed.suffixes.some((s) => n === s || n.endsWith(` ${s}`))) return true;
  return seed.includeIds?.includes(candidate.id) ?? false;
}

/**
 * Release-date order for film franchises; unknown years last so an
 * un-dated entry is never guessed into the middle of a viewing order.
 * Series keep a single flagship entry — a spinoff list is not an "order".
 */
export function orderMembers(seed: FranchiseSeed, members: CatalogCandidate[]): CatalogCandidate[] {
  const deduped = members.filter((m, i) => members.findIndex((o) => o.id === m.id && o.mediaType === m.mediaType) === i);
  if (seed.kind === 'series') {
    return deduped.slice(0, 1);
  }
  return [...deduped].sort((a, b) => {
    if (a.year == null && b.year == null) return a.id - b.id;
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    if (a.year !== b.year) return a.year - b.year;
    return a.id - b.id;
  });
}
