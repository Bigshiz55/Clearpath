/**
 * Stage 3 — Parallel Search source contract. Each source is an adapter that, given
 * expansion queries, returns candidates. Sources declare their own availability so
 * the pipeline can degrade HONESTLY: an unavailable source (no key, no index, no
 * live feed) contributes nothing and is reported as unavailable — it NEVER
 * fabricates titles, providers, schedules, or availability (data-honesty rule).
 *
 * This module is PURE/injectable: the production wiring (TMDB client, embeddings
 * index, live-TV feed) is supplied from the server layer; tests inject fakes.
 */
import type { Candidate, Expansion, SourceName } from './types';

export interface SearchSource {
  name: SourceName;
  /** False when the backing infra/keys are absent — the pipeline then skips it and
   *  records it under `sourcesUnavailable` rather than inventing data. */
  available: boolean;
  search(queries: Expansion[]): Promise<Candidate[]>;
}

/** A source that is present in the taxonomy but not yet wired to real infra.
 *  It is explicitly UNAVAILABLE so nothing fabricates data on its behalf. */
export function unavailableSource(name: SourceName): SearchSource {
  return { name, available: false, search: async () => [] };
}

/**
 * Pure fuzzy-title source over an in-memory catalog slice (used by the pipeline to
 * re-rank whatever a provider already returned, and by the offline benchmark). It
 * only ever returns titles it was GIVEN — it cannot invent a title.
 */
export function fuzzyTitleSource(catalog: Candidate[]): SearchSource {
  return {
    name: 'fuzzy_title',
    available: catalog.length > 0,
    search: async () => catalog,
  };
}

/** Alias source: expands known abbreviations to real titles present in a catalog. */
export function aliasSource(catalog: Candidate[]): SearchSource {
  return {
    name: 'alias',
    available: catalog.length > 0,
    search: async (queries) => {
      const wanted = new Set(queries.map((q) => q.query.toLowerCase()));
      return catalog.filter((c) => wanted.has(c.title.toLowerCase()));
    },
  };
}

/** Run every AVAILABLE source in parallel; report which were skipped. */
export async function searchAll(
  sources: SearchSource[],
  queries: Expansion[],
): Promise<{ candidates: Candidate[]; queried: SourceName[]; unavailable: SourceName[] }> {
  const live = sources.filter((s) => s.available);
  const unavailable = sources.filter((s) => !s.available).map((s) => s.name);
  const settled = await Promise.allSettled(live.map((s) => s.search(queries)));
  const candidates: Candidate[] = [];
  const queried: SourceName[] = [];
  settled.forEach((r, i) => {
    queried.push(live[i]!.name);
    if (r.status === 'fulfilled') candidates.push(...r.value);
    // a rejected source contributes nothing (honest) rather than failing the search
  });
  return { candidates, queried, unavailable };
}
