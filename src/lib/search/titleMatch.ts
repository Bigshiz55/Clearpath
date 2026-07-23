/**
 * Title normalization + matching — PURE (no I/O), the single source of truth for
 * how a user's typed title is compared against a candidate title, and how titles
 * are normalized for canonical identity. Shared by seed resolution
 * (src/lib/askJudge.ts) and canonical/franchise identity (src/lib/search/titleDna.ts)
 * so the two layers never disagree on normalization.
 *
 * Design (conservative about false positives — an honest "no confident match" is
 * safer than resolving the WRONG title):
 *   - `foldTitle` folds case + diacritics (NFKD) so "Amélie" == "Amelie" and
 *     "Spider-Man" == "spiderman".
 *   - Matching accepts an exact fold-equality, OR a *word-boundary-aware* token
 *     window (one title's whole-word token run appears contiguously in the other,
 *     e.g. "Mad Max" ⊂ "Mad Max: Fury Road", "Cars" ⊂ "Cars 3"). It deliberately
 *     rejects mid-word character containment ("Saw" ⊄ "Warsaw", "Ted" ⊄ "Wanted",
 *     "The Ring" ⊄ "The Ringer") which the old raw-substring logic accepted.
 */

const COMBINING = /[̀-ͯ]/g;

/** Lowercase + strip diacritics (NFKD), preserving separators. */
export function foldTitle(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(COMBINING, '');
}

/** Alphanumeric-only normalized form (separators removed). Diacritic-insensitive.
 *  This is the exact normalization canonical identity keys are built from. */
export function normTitle(s: string): string {
  return foldTitle(s).replace(/[^a-z0-9]+/g, '');
}

/** Whole-word tokens (diacritic-insensitive), split on any non-alphanumeric run. */
export function titleTokens(s: string): string[] {
  return foldTitle(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/** True when `needle` appears as a contiguous whole-token window inside `hay`. */
export function isTokenWindow(needle: string[], hay: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Does a typed query title match a candidate title? Boundary-aware and
 * diacritic-insensitive. Short (<3 char) normalized forms never match, so bare
 * "It"/"Up" can't collide with substrings of longer titles.
 */
export function titleMatches(query: string, candidate: string): boolean {
  const a = normTitle(query);
  const b = normTitle(candidate);
  if (a.length < 3 || b.length < 3) return false;
  if (a === b) return true; // punctuation/spacing/diacritic-insensitive exact
  const ta = titleTokens(query);
  const tb = titleTokens(candidate);
  return isTokenWindow(ta, tb) || isTokenWindow(tb, ta);
}
