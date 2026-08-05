import catalog from './generated/franchiseCatalog.json';

/**
 * FRANCHISE ORDER, READ FROM A BUILD ARTIFACT — ZERO UPSTREAM CALLS.
 *
 * ── THE DEFECT THIS REPLACES ──────────────────────────────────────────────
 * This module used to call `searchTitles` once per franchise, at request
 * time, behind a per-instance TTL map. A cold Pack render therefore made
 * seven to twenty live TMDB searches before it could emit any HTML, every
 * cold instance paid that cost again, and a TMDB hiccup turned into a blank
 * Franchise Order section on a customer's screen.
 *
 * Franchise membership changes when a studio releases a film. That is not
 * per-request data. It is now resolved at build time by
 * `scripts/generateFranchiseCatalog.ts` and committed as JSON, so:
 *
 *   - a Pack render performs no network I/O at all for franchises;
 *   - the answer is identical on every instance, warm or cold;
 *   - TMDB being down cannot empty the section;
 *   - the data is reviewable in a diff instead of being invisible.
 *
 * Regenerate with:
 *   npx tsx scripts/generateFranchiseCatalog.ts
 *
 * ── SCOPING ───────────────────────────────────────────────────────────────
 * Every group carries its Pack. Franchises used to be looked up globally, so
 * any Pack that enabled the feature rendered every other Pack's franchises —
 * Lifetime's thrillers appeared under Hallmark. `getCatalogFranchises`
 * filters on the Pack and nothing else.
 */

export interface CatalogFranchiseEntry {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
}

export interface CatalogFranchise {
  pack: string;
  name: string;
  kind: 'movies' | 'series';
  /**
   * derived   — membership re-derivable from the catalog title text.
   * editorial — membership is a verified id list; text cannot decide it.
   * The UI states which, because they are different strengths of claim.
   */
  membership: 'derived' | 'editorial';
  /**
   * Always 'release' today: order comes from release dates, never from a
   * hand-written sequence. An editorially VERIFIED viewing order lives in
   * `franchise_entries` (order_source = 'editorial') and takes precedence
   * over this when a curator has actually checked one.
   */
  orderSource: 'release' | 'editorial';
  entries: CatalogFranchiseEntry[];
}

interface Artifact {
  generatedFrom: string;
  groups: CatalogFranchise[];
}

const GROUPS = (catalog as Artifact).groups;

/** Synchronous by construction — there is nothing to await. */
export function getCatalogFranchises(packSlug: string): CatalogFranchise[] {
  return GROUPS.filter((g) => g.pack === packSlug && g.entries.length > 0);
}

/** Every group, for tests and the operator surface. */
export function allCatalogFranchises(): CatalogFranchise[] {
  return GROUPS;
}
