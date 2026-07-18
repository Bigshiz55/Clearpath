'use client';

import type { MediaType } from '@/lib/types';

/** The shape the /api/dna endpoint returns for a title (or null for guests). */
export interface DnaClientResult {
  score: number;
  confidence: number; // 0..1 — taste vs. objective blend
  tasteScore: number | null;
  available: boolean; // whether we had a title vibe vector (needs OPENAI key)
  sampleSize: number; // rated titles feeding the model
}

// One in-flight fetch per title, shared across every component on the page (the
// DNA badge and the watch-call badge both read from this, so a card fetches once).
const cache = new Map<string, Promise<DnaClientResult | null>>();

export function loadDna(mediaType: MediaType, tmdbId: number): Promise<DnaClientResult | null> {
  const key = `${mediaType}:${tmdbId}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/dna/${mediaType}/${tmdbId}`)
      .then((r) => r.json())
      .then((d) => (d?.dna as DnaClientResult | null) ?? null)
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** True once the model is actually personalized to this user (not just the
 *  objective fallback it returns before you've rated anything). */
export function isPersonalized(dna: DnaClientResult | null): boolean {
  return !!dna && dna.available && dna.sampleSize > 0;
}
