// Provenance & the SourcedValue wrapper. Every externally-sourced or derived
// field in ReadVerdict is carried as a SourcedValue so we can always answer
// "where did this come from, how sure are we, and what did it conflict with?"

import type { EvidenceStatus } from './confidence';
import { clamp01 } from './confidence';

/** Where a single value came from. */
export interface Provenance {
  /** Stable source key, e.g. 'openlibrary', 'user', 'goodreads-csv', 'readverdict-estimate'. */
  source: string;
  /** The source's own identifier for the record, when available. */
  sourceRecordId?: string | null;
  /** The raw value exactly as received, before normalization. */
  originalValue?: unknown;
  /** ISO timestamp the value was retrieved. */
  retrievedAt?: string | null;
  /** ISO timestamp the value was last verified. */
  lastVerifiedAt?: string | null;
  /** Region the value applies to (e.g. 'US'), when regional. */
  region?: string | null;
  /** Edition the value applies to (edition id), when edition-specific. */
  editionScope?: string | null;
}

/** A value plus everything needed to trust, explain, or override it. */
export interface SourcedValue<T> {
  value: T;
  status: EvidenceStatus;
  /** 0..1. */
  confidence: number;
  provenance: Provenance;
  /**
   * Conflicting values from other sources, preserved (never overwritten). The
   * winning value lives in `value`; losers are kept here for auditing/repair.
   */
  conflicts?: SourcedValue<T>[];
}

export function sourced<T>(
  value: T,
  status: EvidenceStatus,
  confidence: number,
  provenance: Provenance,
): SourcedValue<T> {
  return { value, status, confidence: clamp01(confidence), provenance };
}

/** Default trust ranking of common sources (higher = more authoritative). */
export const DEFAULT_SOURCE_PRIORITY: Record<string, number> = {
  user: 100, // user-confirmed beats everything inferred
  publisher: 80,
  isbndb: 70,
  openlibrary: 60,
  googlebooks: 60,
  'goodreads-csv': 55,
  'storygraph-csv': 55,
  'readverdict-estimate': 30,
  'ai-generated': 20,
  unknown: 0,
};

function priorityOf(source: string, table: Record<string, number>): number {
  return table[source] ?? table.unknown ?? 0;
}

/**
 * Merge multiple candidate values for the same field into one SourcedValue,
 * choosing a winner by (source priority, then confidence) and PRESERVING the
 * rest as conflicts. Values that deep-equal the winner are not treated as
 * conflicts. Never discards information.
 */
export function resolveConflict<T>(
  candidates: SourcedValue<T>[],
  priority: Record<string, number> = DEFAULT_SOURCE_PRIORITY,
): SourcedValue<T> | null {
  const present = candidates.filter((c) => c && c.status !== 'insufficient');
  if (present.length === 0) return candidates[0] ?? null;

  const ranked = [...present].sort((a, b) => {
    const pa = priorityOf(a.provenance.source, priority);
    const pb = priorityOf(b.provenance.source, priority);
    if (pb !== pa) return pb - pa;
    return b.confidence - a.confidence;
  });

  const winner = ranked[0]!;
  const conflicts = ranked
    .slice(1)
    .filter((c) => !sameValue(c.value, winner.value));

  return conflicts.length > 0 ? { ...winner, conflicts } : { ...winner };
}

/** Whether a field currently has a preserved, unresolved conflict. */
export function hasConflict<T>(v: SourcedValue<T> | null | undefined): boolean {
  return !!v?.conflicts && v.conflicts.length > 0;
}

/** Freshness in whole days between retrieval and a reference time. */
export function freshnessDays(
  v: SourcedValue<unknown>,
  now: string,
): number | null {
  const t = v.provenance.lastVerifiedAt ?? v.provenance.retrievedAt;
  if (!t) return null;
  const then = Date.parse(t);
  const ref = Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(ref)) return null;
  return Math.max(0, Math.floor((ref - then) / 86_400_000));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
