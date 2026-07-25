/**
 * TITLE NORMALIZATION + EXACT MATCH (pure).
 *
 * The "Gone → Gone Girl" bug came from substring matching: "gone" is contained
 * in "gonegirl", so a fuzzy `includes` check treated the popular near-title as
 * the exact one. This module gives the search a STRICT, ordered notion of title
 * identity so an exact match always beats a mere substring/near match.
 *
 * Match tiers (highest → lowest):
 *   'exact'      normalized titles are equal (article-insensitive)
 *   'alt'        equal after a controlled leading-article add/remove ("the")
 *   'contains'   one normalized title fully contains the other as a WORD run
 *   'fuzzy'      close but not exact (edit-distance) — used only after the above
 *   'none'
 *
 * No I/O; unit-tested.
 */

export type TitleMatchTier = 'exact' | 'alt' | 'contains' | 'fuzzy' | 'none';

/** Lowercase, fold accents, drop punctuation/apostrophes/hyphens, collapse space. */
export function normalizeTitle(s: string): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '') // apostrophes vanish: "it's" → "its"
    .replace(/[^a-z0-9]+/g, ' ') // punctuation/hyphens → space
    .replace(/\s+/g, ' ')
    .trim();
}

const LEADING_ARTICLE = /^(the|a|an)\s+/;

/** Normalized form with any single leading article removed (controlled alt). */
function stripArticle(n: string): string {
  return n.replace(LEADING_ARTICLE, '');
}

/** Levenshtein distance, capped for short-circuit. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[n]!;
}

/** Does `hay` contain `needle` as a whole-WORD run (not a mid-word substring)? */
function containsWords(hay: string, needle: string): boolean {
  if (!needle) return false;
  return hay === needle || hay.startsWith(needle + ' ') || hay.endsWith(' ' + needle) || hay.includes(' ' + needle + ' ');
}

/**
 * Classify how well a candidate title matches the requested one. CRUCIAL: an
 * exact/alt match is reported distinctly from a mere 'contains', so the ranker
 * can put the true "Gone" above "Gone Girl" (which is only 'contains').
 */
export function titleMatchTier(requested: string, candidate: string): TitleMatchTier {
  const a = normalizeTitle(requested);
  const b = normalizeTitle(candidate);
  if (!a || !b) return 'none';
  if (a === b) return 'exact';
  if (stripArticle(a) === stripArticle(b)) return 'alt';
  // A one-word request must NOT be swallowed by a longer title as "contains"
  // unless it is a genuine whole-word prefix/suffix — and even then it's only
  // 'contains', never 'exact'. This is what keeps "Gone" ≠ "Gone Girl" exact.
  if (containsWords(a, b) || containsWords(b, a)) return 'contains';
  const d = editDistance(a, b);
  if (d > 0 && d <= 2 && Math.max(a.length, b.length) >= 5) return 'fuzzy';
  return 'none';
}

/** True only for a genuine exact (article-insensitive) title identity. */
export function isExactTitle(requested: string, candidate: string): boolean {
  const t = titleMatchTier(requested, candidate);
  return t === 'exact' || t === 'alt';
}

const TIER_RANK: Record<TitleMatchTier, number> = { exact: 0, alt: 1, contains: 2, fuzzy: 3, none: 4 };

/**
 * Order candidates by match tier FIRST (exact wins), then by a caller-supplied
 * popularity/score as a tiebreak only WITHIN the same tier. This is the ranking
 * rule that fixes the bug: "Gone" (exact) outranks "Gone Girl" (contains) even
 * though "Gone Girl" is far more popular.
 */
export function rankByTitleIdentity<T>(
  requested: string,
  candidates: T[],
  getTitle: (c: T) => string,
  getPopularity: (c: T) => number = () => 0,
): T[] {
  return [...candidates].sort((x, y) => {
    const tx = TIER_RANK[titleMatchTier(requested, getTitle(x))];
    const ty = TIER_RANK[titleMatchTier(requested, getTitle(y))];
    if (tx !== ty) return tx - ty;
    return getPopularity(y) - getPopularity(x);
  });
}
