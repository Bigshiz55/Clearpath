'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { HelixMark } from './HelixMark';

/**
 * The "true DNA" score box for a card — the pink helix box with your 0–100 odds,
 * sitting at the bottom of the card. Only shows once the user actually has a
 * Taste-DNA (rated some titles); before that the objective call in the top bar
 * already covers "is it good", so this stays hidden and nudges them to rate.
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
      className={`flex items-center gap-3 rounded-xl border-2 border-pink-400/70 bg-gradient-to-br from-pink-500/35 to-rose-500/25 px-3 py-2.5 shadow-[0_0_16px_rgba(244,63,94,0.3)] ${className}`}
      title="WatchVerdict DNA Score — the odds you’ll love this (0–100), learned from what you’ve rated. It drives your call and sharpens the more you use the app."
    >
      <span className="grid h-11 w-11 flex-none place-items-center rounded-lg bg-pink-500/60 ring-2 ring-pink-200/70">
        <HelixMark className="h-7 w-7" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex items-baseline gap-1 text-2xl font-black tabular-nums text-white">
          {dna.score}
          <span className="text-[11px] font-bold text-pink-100/80">/100</span>
        </span>
        <span className="text-[10px] font-black uppercase tracking-wide text-white">🧬 DNA Score</span>
        <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-pink-100/90">{v.call} · {v.tier}</span>
      </span>
    </div>
  );
}
