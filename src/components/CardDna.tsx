'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { HelixMark } from './HelixMark';

/**
 * The pure DNA Score for a card — a slim pink row (helix + your 0–100 taste
 * match) that sits just under the poster, above the ratings. This is your
 * *taste fit* alone (not blended with quality — that's the Watchability chip in
 * the ratings row). Only shows once you actually have a Taste-DNA.
 */
export function CardDna({ mediaType, tmdbId, className = '' }: { mediaType: MediaType; tmdbId: number; className?: string }) {
  const [dna, setDna] = useState<DnaClientResult | null>(null);

  useEffect(() => {
    let active = true;
    loadDna(mediaType, tmdbId).then((d) => active && setDna(d));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  if (!dna || !isPersonalized(dna) || dna.tasteScore == null) return null;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border border-pink-400/60 bg-gradient-to-r from-pink-500/25 to-rose-500/15 px-2 py-1 ${className}`}
      title="WatchVrdIQt DNA Score — how closely this matches YOUR taste (0–100), learned from what you’ve rated. Pure taste fit; the Watchability rating blends this with the critic/audience scores."
    >
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-pink-100">
        <HelixMark className="h-4 w-4" />
        DNA Score
      </span>
      <span className="flex items-baseline gap-1 tabular-nums text-white">
        <span className="text-sm font-black">{dna.tasteScore}</span>
        <span className="text-[9px] font-bold text-pink-100/80">/100</span>
        <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide text-pink-100/90">your taste</span>
      </span>
    </div>
  );
}
