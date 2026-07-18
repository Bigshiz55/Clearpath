'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { HelixMark } from './HelixMark';

/**
 * The "true DNA" score for a card — a slim pink row (helix + your 0–100 odds +
 * tier) that sits just under the poster, above the ratings. Only shows once the
 * user actually has a Taste-DNA (rated some titles); before that the objective
 * call in the top bar already covers "is it good", so this stays hidden.
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

  if (!dna || !isPersonalized(dna)) return null;

  const v = scoreVerdict(dna.score);
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border border-pink-400/60 bg-gradient-to-r from-pink-500/25 to-rose-500/15 px-2 py-1 ${className}`}
      title="WatchVerdict DNA Score — the odds you’ll love this (0–100), learned from what you’ve rated. It drives your call and sharpens the more you use the app."
    >
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-pink-100">
        <HelixMark className="h-4 w-4" />
        DNA Score
      </span>
      <span className="flex items-baseline gap-1 tabular-nums text-white">
        <span className="text-sm font-black">{dna.score}</span>
        <span className="text-[9px] font-bold text-pink-100/80">/100</span>
        <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide text-pink-100/90">{v.tier}</span>
      </span>
    </div>
  );
}
