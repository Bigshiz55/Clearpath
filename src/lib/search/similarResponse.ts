/**
 * Shapes the outcome of a similar-to-title request. When the seed-similarity gate
 * qualifies zero candidates we return an explicit `no_close_matches` result — the
 * request is NEVER silently handed to the ungated Finder. Any broader,
 * personally-appealing titles are carried in a separate, clearly-labelled field,
 * never blended with (non-existent) similar results.
 *
 * Pure and I/O-free so the decision is unit-testable without Next/Supabase.
 */
import type { RankOutput } from './seedSimilarity';

export type BroadenOption =
  | 'broaden_similarity'
  | 'emotional_feeling'
  | 'genre'
  | 'include_franchise'
  | 'remove_constraint'
  | 'personal_alternatives';

/** The offered broaden controls, in display order. */
export const BROADEN_OPTIONS: BroadenOption[] = [
  'broaden_similarity',
  'emotional_feeling',
  'genre',
  'include_franchise',
  'remove_constraint',
  'personal_alternatives',
];

export interface SimilarInterpretation {
  seedTitle: string;
  lens: string | null;
  intent: 'similar_to';
}

export interface NoCloseMatches {
  kind: 'no_close_matches';
  /** The preserved search interpretation (what we understood the request to be). */
  interpretation: SimilarInterpretation;
  /** The gate that eliminated the most candidates (the dominant no-match reason). */
  reason: string;
  /** exclusionReason → how many candidates it eliminated. */
  gateBreakdown: Record<string, number>;
  /** How many candidates were considered before the gate. */
  candidatesConsidered: number;
  broadenOptions: BroadenOption[];
  /** Honest copy that does NOT claim any unrelated title is a close match. */
  message: string;
}

/** Build the no-close-matches result from a (zero-qualified) rank output. */
export function noCloseMatches(
  seedTitle: string,
  lens: string | null,
  ranked: Pick<RankOutput, 'gateBreakdown' | 'traces' | 'qualifiedCount'>,
): NoCloseMatches {
  const entries = Object.entries(ranked.gateBreakdown).sort((a, b) => b[1] - a[1]);
  const reason = entries[0]?.[0] ?? 'no_candidates';
  return {
    kind: 'no_close_matches',
    interpretation: { seedTitle, lens, intent: 'similar_to' },
    reason,
    gateBreakdown: ranked.gateBreakdown,
    candidatesConsidered: ranked.traces.length,
    broadenOptions: BROADEN_OPTIONS,
    message: `No close matches met the similarity standard for “${seedTitle}”. I can broaden the search or show titles you may personally like that are less similar — clearly labelled as broader alternatives, not close matches.`,
  };
}

/** Decide whether a rank output is a similar result or a no-close-matches result.
 *  This is the seam the route uses; a zero-qualified similar request MUST resolve
 *  to `no_close_matches`, never to the ungated Finder. */
export function classifySimilar(
  seedTitle: string,
  lens: string | null,
  ranked: RankOutput,
): { kind: 'similar' } | NoCloseMatches {
  if (ranked.items.length > 0) return { kind: 'similar' };
  return noCloseMatches(seedTitle, lens, ranked);
}
