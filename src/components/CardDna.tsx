'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';

interface Dna {
  score: number;
  confidence: number;
  sampleSize: number;
  available: boolean;
}

// One in-flight fetch per title, shared across every card on the page.
const cache = new Map<string, Promise<Dna | null>>();
function load(mediaType: MediaType, tmdbId: number): Promise<Dna | null> {
  const key = `${mediaType}:${tmdbId}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/dna/${mediaType}/${tmdbId}`)
      .then((r) => r.json())
      .then((d) => (d?.dna as Dna | null) ?? null)
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/**
 * A compact 🧬 DNA Score badge for any card — "odds you'll love it". Only shows
 * once the user actually has a Taste-DNA (rated some titles); before that it
 * renders nothing (the objective score already covers "is it good").
 */
export function CardDna({ mediaType, tmdbId, className = '' }: { mediaType: MediaType; tmdbId: number; className?: string }) {
  const [dna, setDna] = useState<Dna | null>(null);

  useEffect(() => {
    let active = true;
    load(mediaType, tmdbId).then((d) => active && setDna(d));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  if (!dna || dna.sampleSize === 0 || !dna.available) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md border border-pink-400/60 bg-gradient-to-br from-pink-500/40 to-rose-500/30 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white shadow-[0_0_10px_rgba(244,63,94,0.35)] ${className}`}
      title="WatchVerdict DNA Score — the odds you’ll love this, learned from what you’ve rated."
    >
      🧬 {dna.score}
    </span>
  );
}
