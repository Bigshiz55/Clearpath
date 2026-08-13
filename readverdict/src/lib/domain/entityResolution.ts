// Canonical entity resolution & deduplication. Two records are only merged when
// identifiers or a confident combination of title + author + edition signals
// agree. Similar titles alone NEVER merge — that is the classic dedup mistake
// (e.g. the many unrelated books called "Beautiful" or "Home").

import { toCanonicalIsbn13 } from './isbn';

/** Normalize a title for comparison: lowercase, drop subtitle, strip noise. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .split(/[:—–-]/)[0]! // drop subtitle after a colon/dash
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize an author name to a comparable last-name-ish token set. */
function authorTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** Dice coefficient over character bigrams — a robust 0..1 string similarity. */
export function stringSimilarity(a: string, b: string): number {
  const x = titleKey(a);
  const y = titleKey(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const bx = bigrams(x);
  const by = bigrams(y);
  let intersection = 0;
  for (const [g, cx] of bx) {
    const cy = by.get(g);
    if (cy) intersection += Math.min(cx, cy);
  }
  const total = x.length - 1 + (y.length - 1);
  return total > 0 ? (2 * intersection) / total : 0;
}

/** Jaccard overlap of two author name sets (any shared surname counts). */
export function authorOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const ta = new Set<string>();
  a.forEach((n) => authorTokens(n).forEach((t) => ta.add(t)));
  const tb = new Set<string>();
  b.forEach((n) => authorTokens(n).forEach((t) => tb.add(t)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export interface MatchCandidate {
  title: string;
  authors: string[];
  isbn13?: string | null;
  isbn10?: string | null;
  year?: number | null;
}

export interface MatchResult {
  /** 0..1 overall confidence the two refer to the same work. */
  score: number;
  /** True when identifiers prove they are the same physical edition. */
  sameEdition: boolean;
  /** True when they are confidently the same conceptual work. */
  sameWork: boolean;
  reason: string;
}

function canonicalIsbn(c: MatchCandidate): string | null {
  return (
    (c.isbn13 && toCanonicalIsbn13(c.isbn13)) ||
    (c.isbn10 && toCanonicalIsbn13(c.isbn10)) ||
    null
  );
}

/**
 * Decide whether two candidates are the same edition/work. Precedence:
 *   1. Matching canonical ISBN-13 ⇒ same edition (score 1).
 *   2. Otherwise combine title similarity, author overlap, and year proximity —
 *      but require real author agreement, so similar titles never merge alone.
 */
export function matchBooks(a: MatchCandidate, b: MatchCandidate): MatchResult {
  const ia = canonicalIsbn(a);
  const ib = canonicalIsbn(b);
  if (ia && ib) {
    if (ia === ib) {
      return { score: 1, sameEdition: true, sameWork: true, reason: 'Matching ISBN-13.' };
    }
    // Different valid ISBNs → different editions; may still be the same work.
  }

  const titleSim = stringSimilarity(a.title, b.title);
  const authors = authorOverlap(a.authors, b.authors);
  const yearClose =
    a.year != null && b.year != null ? Math.max(0, 1 - Math.abs(a.year - b.year) / 5) : 0.5;

  const workScore = 0.6 * titleSim + 0.3 * authors + 0.1 * yearClose;

  // Guardrails: never declare same-work on title similarity alone.
  const sameWork = workScore >= 0.82 && titleSim >= 0.7 && authors > 0;
  const sameEdition = sameWork && ia != null && ib != null && ia === ib;

  let reason: string;
  if (sameWork) reason = 'Title, author, and year agree.';
  else if (titleSim >= 0.7 && authors === 0)
    reason = 'Similar title but no shared author — kept separate.';
  else reason = 'Insufficient agreement to merge.';

  return { score: Number(workScore.toFixed(3)), sameEdition, sameWork, reason };
}

/**
 * Group a list of candidates into clusters of the same work. Greedy union by
 * pairwise match; deterministic given input order.
 */
export function clusterWorks(candidates: MatchCandidate[]): number[][] {
  const clusters: number[][] = [];
  const assigned = new Array(candidates.length).fill(false);
  for (let i = 0; i < candidates.length; i++) {
    if (assigned[i]) continue;
    const cluster = [i];
    assigned[i] = true;
    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned[j]) continue;
      if (matchBooks(candidates[i]!, candidates[j]!).sameWork) {
        cluster.push(j);
        assigned[j] = true;
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}
