import 'server-only';
import type { EpisodeInput } from './extraction';

/**
 * Retitle detection — pure. Decides whether two episode records are the SAME
 * broadcast re-aired under a different title (same series, near-identical
 * synopsis — the network re-describing the same content) versus two
 * genuinely different episodes that happen to cover the same real-world
 * Case (same subject, different synopsis — different framing, new
 * interviews, a follow-up).
 *
 * This distinction matters because the two cases are handled by different
 * existing mechanisms (both already built in migration 0036, unmodified
 * here): a retitle is the SAME programme and should get a `case_aliases`
 * row, never a second programme — creating a second programme for a rerun
 * is exactly what would make `user_seen_programmes` wrongly report it as
 * unseen to someone who already saw the original. A genuinely different
 * episode covering the same subject is a `case_programmes` link between two
 * distinct programmes instead, proposed through the match/review pipeline
 * in `matching.ts` + `reviewQueue.ts`.
 */

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Jaccard similarity of the two synopses' word sets, 0..1. */
export function synopsisSimilarity(a: string, b: string): number {
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  let intersection = 0;
  for (const w of wa) if (wb.has(w)) intersection++;
  const union = wa.size + wb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Same broadcast re-aired under a different title requires near-identical wording, not just the same subject. */
export const RETITLE_SIMILARITY_THRESHOLD = 0.8;

export interface RetitleDecision {
  isRetitle: boolean;
  similarity: number;
}

/**
 * Pure. Same series + near-identical synopsis text (>= threshold) => treat
 * as one programme re-aired under a different title. Different series can
 * never be a retitle of each other by definition (a rerun stays on the same
 * network/series) — a cross-series match with a similar synopsis is a
 * separate outlet independently covering the same story, which is a Case
 * match candidate, not a retitle.
 */
export function detectRetitle(a: EpisodeInput, b: EpisodeInput): RetitleDecision {
  if (a.series !== b.series) return { isRetitle: false, similarity: 0 };
  const similarity = synopsisSimilarity(a.synopsis, b.synopsis);
  return { isRetitle: similarity >= RETITLE_SIMILARITY_THRESHOLD, similarity };
}
