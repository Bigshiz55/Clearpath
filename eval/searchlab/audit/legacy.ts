/**
 * VERBATIM copies of the PRE-FIX ("before") identity/resolution logic, kept here
 * purely so the audit can compute an honest before/after in a single deterministic
 * run without checking out an old git state. These are NOT imported by production —
 * production uses the fixed versions in src/lib/search/*. Do not edit to "improve";
 * they must stay byte-faithful to the code that shipped in commit cc5ab45.
 */
import type { SeedTitle } from '@/lib/search/titleDna';

/** BEFORE: raw lowercase alphanumeric, NO diacritic folding. */
const legacyNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** BEFORE: exact OR raw character-substring containment (min length 3). */
export function legacyTitleMatches(cleaned: string, resultTitle: string): boolean {
  const a = legacyNorm(cleaned);
  const b = legacyNorm(resultTitle);
  if (a.length < 3 || b.length < 3) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** BEFORE: canonical key without shared normalization (kept for reference). */
export function legacyCanonicalKey(t: Pick<SeedTitle, 'title' | 'year' | 'mediaType'>): string {
  const norm = t.title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  return t.mediaType === 'movie' && t.year != null ? `movie:${norm}:${t.year}` : `${t.mediaType}:${norm}`;
}

/** BEFORE: title-text hint via raw startsWith (no word boundary). */
function legacyTitleTextFranchiseHint(a: SeedTitle, b: SeedTitle): boolean {
  const na = a.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nb = b.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (na.length < 4 || nb.length < 4 || na === nb) return false;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 4 && long.startsWith(short);
}

export type LegacyRelation = 'same_canonical' | 'canonical_duplicate' | 'franchise' | 'similar' | 'unknown';
export type LegacyIdentity = 'known' | 'inferred' | 'unknown';

/** BEFORE: franchiseAssessment without the collection-disagreement downgrade. */
export function legacyFranchiseAssessment(seed: SeedTitle, cand: SeedTitle): { relation: LegacyRelation; identity: LegacyIdentity } {
  const sk = legacyCanonicalKey(seed);
  const ck = legacyCanonicalKey(cand);
  if (sk === ck) {
    return { relation: seed.tmdbId === cand.tmdbId ? 'same_canonical' : 'canonical_duplicate', identity: 'known' };
  }
  const seedCol = seed.collectionId ?? null;
  const candCol = cand.collectionId ?? null;
  if (seedCol != null && candCol != null) {
    return { relation: seedCol === candCol ? 'franchise' : 'similar', identity: 'known' };
  }
  if (legacyTitleTextFranchiseHint(seed, cand)) return { relation: 'franchise', identity: 'inferred' };
  return { relation: 'unknown', identity: 'unknown' };
}
