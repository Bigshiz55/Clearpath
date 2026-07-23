/**
 * Stage 4 — Confidence Engine. PURE. Scores each candidate 0..1 against the set
 * of expansion queries that could have produced it, combining title-match
 * strength (exact → token-window → fuzzy edit distance), the originating
 * expansion's weight, and the source's own relevance signal when present.
 */
import { normTitle, titleTokens, isTokenWindow } from '@/lib/search/titleMatch';
import type { Candidate, ScoredCandidate, Expansion } from './types';

/** Confidence bands. Tunable, kept conservative so "low" routes to Recovery Mode. */
export const CONFIDENCE_BANDS = { high: 0.75, medium: 0.45 };

const lev = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]!; d[0] = i;
    for (let j = 1; j <= n; j++) { const t = d[j]!; d[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, d[j]!, d[j - 1]!); prev = t; }
  }
  return d[n]!;
};

/** Raw string similarity 0..1 between a query and a candidate title. */
export function titleSimilarity(query: string, title: string): { score: number; how: string } {
  const a = normTitle(query), b = normTitle(title);
  if (!a || !b) return { score: 0, how: 'empty' };
  if (a === b) return { score: 1, how: 'exact' };
  const ta = titleTokens(query), tb = titleTokens(title);
  if (isTokenWindow(ta, tb) || isTokenWindow(tb, ta)) {
    // partial-but-clean containment; scale by length ratio so "Cars" vs "Cars 3"
    // scores higher than "Star" vs "Star Wars: The Rise of Skywalker".
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return { score: 0.7 + 0.2 * ratio, how: 'token_window' };
  }
  const dist = lev(a, b);
  const sim = 1 - dist / Math.max(a.length, b.length);
  return { score: Math.max(0, sim), how: 'fuzzy' };
}

export function scoreCandidate(cand: Candidate, expansions: Expansion[]): ScoredCandidate {
  const weightByQuery = new Map(expansions.map((e) => [e.query.toLowerCase(), e.weight]));
  const reasons: string[] = [];

  // Best title-similarity across all expansions (a candidate can be reached by many).
  let best = { score: 0, how: 'none', via: cand.viaQuery };
  for (const e of expansions) {
    const s = titleSimilarity(e.query, cand.title);
    if (s.score > best.score) best = { score: s.score, how: s.how, via: e.query };
  }
  const exp = weightByQuery.get(best.via.toLowerCase()) ?? weightByQuery.get(cand.viaQuery.toLowerCase()) ?? 0.5;

  // Blend: title match dominates; expansion weight and source score modulate.
  const src = cand.sourceScore ?? 0.5;
  let confidence = 0.68 * best.score + 0.2 * exp + 0.12 * src;
  reasons.push(`match=${best.how}(${round(best.score)}) via "${best.via}"`);
  reasons.push(`expansionWeight=${round(exp)} sourceScore=${round(src)}`);

  // Small provenance bonus: a hit from the authoritative provider (tmdb/alias) is
  // more trustworthy than an embeddings/fuzzy-only hit, all else equal.
  if (cand.source === 'tmdb' || cand.source === 'alias') { confidence += 0.03; reasons.push('provider=authoritative'); }
  confidence = Math.max(0, Math.min(1, confidence));

  const band: ScoredCandidate['confidenceBand'] =
    confidence >= CONFIDENCE_BANDS.high ? 'high' : confidence >= CONFIDENCE_BANDS.medium ? 'medium' : 'low';

  return { ...cand, confidence: round(confidence), confidenceBand: band, reasons };
}

/** Rank + de-duplicate candidates by canonical id, keeping the highest confidence. */
export function scoreAndRank(cands: Candidate[], expansions: Expansion[]): ScoredCandidate[] {
  const byId = new Map<string, ScoredCandidate>();
  for (const c of cands) {
    const scored = scoreCandidate(c, expansions);
    const prev = byId.get(scored.id);
    if (!prev || scored.confidence > prev.confidence) byId.set(scored.id, scored);
  }
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence);
}

function round(x: number): number { return Math.round(x * 100) / 100; }
