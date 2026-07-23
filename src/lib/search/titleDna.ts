/**
 * Title DNA — the reliable, provenance-aware knowledge about one work that the
 * seed-similarity gate compares. This module is PURE (no I/O) and introduces no
 * ranking behaviour on its own; it is the shared data contract + fingerprint math
 * used by both the production gate (src/lib/search/seedSimilarity.ts) and the
 * Search Lab. It is grounded in the SAME 15-axis fingerprint the deterministic
 * engine already computes (src/lib/scoring/dimensions.ts, 0..100 per axis), so
 * production supplies real values from the cached `title_dimensions` fingerprint
 * rather than any invented metadata.
 */
import { normTitle, titleTokens } from './titleMatch';

/** The 15 interpretable fingerprint axes (mirrors DIMENSIONS in scoring). */
export const DNA_AXES = [
  'pacing', 'darkness', 'warmth', 'humor', 'suspense', 'emotion', 'complexity',
  'realism', 'character', 'stakes', 'morality', 'violence', 'attention', 'serialized', 'romance',
] as const;
export type DnaAxis = (typeof DNA_AXES)[number];

/** Axes whose disagreement is *defining* — a strong split here is a real
 *  contradiction, not incidental. Weighted higher in the contradiction score. */
export const DEFINING_AXES: ReadonlySet<DnaAxis> = new Set<DnaAxis>([
  'realism', 'darkness', 'humor', 'character', 'violence', 'romance',
]);

/** One canonical work under comparison. `dims` may be partial/absent; missing
 *  axes lower confidence and are never invented. */
export interface SeedTitle {
  /** Stable canonical identity — normalized so re-releases / alternate records of
   *  the SAME work collapse together (see canonicalKey). */
  canonicalId: string;
  tmdbId: number;
  title: string;
  year: number | null;
  mediaType: 'movie' | 'tv';
  /** TMDB genre names, e.g. ["Drama","Sport"]. */
  genres: string[];
  /** Interpretable attribute anchors (from TMDB keywords / ontology), e.g.
   *  ["boxing","underdog","training"]. Defining shared anchors live here. */
  keywords: string[];
  /** 15-axis fingerprint, 0..100. Partial allowed. */
  dims: Partial<Record<string, number>>;
  /** Same-franchise collection id (TMDB belongs_to_collection), else null. */
  collectionId?: number | null;
  /** Confidence in the fingerprint (0..1); low when dims are sparse/derived. */
  dimsConfidence?: number;
}

const NEUTRAL = 50;

/** How far an axis value sits from neutral (0..1). ≥0.3 counts as "salient". */
export function salience(v: number): number {
  return Math.min(1, Math.abs(v - NEUTRAL) / NEUTRAL);
}
/** -1 (low pole), +1 (high pole), 0 (neutral band 45..55). */
export function pole(v: number): -1 | 0 | 1 {
  if (v >= 55) return 1;
  if (v <= 45) return -1;
  return 0;
}

/** Canonical identity key: same work → same key regardless of TMDB record.
 *  Movies: normalized title + release year. TV: normalized title. This is what
 *  seed exclusion and duplicate exclusion compare (never a bare TMDB id).
 *  Normalization is the shared, diacritic-insensitive `normTitle` so resolution
 *  and identity never disagree (e.g. "Amélie" and "Amelie" collapse together). */
export function canonicalKey(t: Pick<SeedTitle, 'title' | 'year' | 'mediaType'>): string {
  const norm = normTitle(t.title);
  return t.mediaType === 'movie' && t.year != null ? `movie:${norm}:${t.year}` : `${t.mediaType}:${norm}`;
}

/** Count of fingerprint axes actually present (drives metadata confidence). */
export function knownAxisCount(dims: Partial<Record<string, number>>): number {
  return DNA_AXES.filter((a) => typeof dims[a] === 'number').length;
}

// ── Franchise / canonical identity ─────────────────────────────────────────
/** The relationship between a candidate and the seed. */
export type FranchiseRelation =
  | 'same_canonical' // literally the seed work (same identity)
  | 'canonical_duplicate' // a different record of the SAME work (re-release/edition)
  | 'franchise' // same collection / franchise family
  | 'similar' // unrelated work that happens to be a candidate
  | 'unknown'; // franchise membership could not be reliably determined
/** How the relationship was established. `inferred` (title-text) is low-confidence
 *  and must never independently trigger production filtering. */
export type IdentitySource = 'known' | 'inferred' | 'unknown';

export interface FranchiseAssessment {
  relation: FranchiseRelation;
  identity: IdentitySource;
}

/** Conservative title-text franchise hint — the shorter title must be a strict
 *  WHOLE-WORD leading token run of the longer, e.g. ["Rocky"] ⊂ ["Rocky","II"].
 *  Word-boundary aware so "The Ring" does NOT hint a franchise with "The Ringer".
 *  Low-confidence fallback ONLY (never independently triggers filtering). */
function titleTextFranchiseHint(a: SeedTitle, b: SeedTitle): boolean {
  const ta = titleTokens(a.title);
  const tb = titleTokens(b.title);
  const na = ta.join('');
  const nb = tb.join('');
  if (na.length < 4 || nb.length < 4 || na === nb) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Strict leading-token prefix: the longer must have extra tokens beyond a full
  // whole-token match of the shorter (so "ring" ≠ "ringer" ⇒ no hint).
  if (short.length === 0 || short.length >= long.length) return false;
  for (let i = 0; i < short.length; i++) if (short[i] !== long[i]) return false;
  return short.join('').length >= 4;
}

/**
 * Determine the seed↔candidate franchise/identity relationship, preferring the
 * reliable provider collection id and falling back to canonical identity, then to
 * a low-confidence title-text hint (recorded but not filter-triggering).
 */
export function franchiseAssessment(seed: SeedTitle, cand: SeedTitle): FranchiseAssessment {
  const sk = canonicalKey(seed);
  const ck = canonicalKey(cand);
  if (sk === ck) {
    if (seed.tmdbId === cand.tmdbId) return { relation: 'same_canonical', identity: 'known' };
    // Same normalized title+year, different TMDB record. If BOTH carry a known
    // collection id and they DIFFER, these are provably distinct works that merely
    // share a title (a TMDB identity collision) — not a duplicate of the seed.
    const sc = seed.collectionId ?? null;
    const cc = cand.collectionId ?? null;
    if (sc != null && cc != null && sc !== cc) return { relation: 'similar', identity: 'known' };
    return { relation: 'canonical_duplicate', identity: 'known' };
  }
  const seedCol = seed.collectionId ?? null;
  const candCol = cand.collectionId ?? null;
  if (seedCol != null && candCol != null) {
    // Both franchise identities known → reliable relation.
    return { relation: seedCol === candCol ? 'franchise' : 'similar', identity: 'known' };
  }
  // At least one collection id is missing → we cannot reliably know franchise
  // membership. A title-text hint is recorded as *inferred* (never filters).
  if (titleTextFranchiseHint(seed, cand)) return { relation: 'franchise', identity: 'inferred' };
  return { relation: 'unknown', identity: 'unknown' };
}
