'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { Verd1ctBadge } from './Verd1ctBadge';

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
      className={`flex items-center gap-2 rounded-lg border border-pink-400/50 bg-gradient-to-r from-pink-500/20 to-rose-500/10 px-2 py-1.5 ${className}`}
      title={`Your VERD1CT ${dna.tasteScore} — how closely this matches YOUR taste (0–100), learned from what you’ve rated. The blue TV means it’s from WatchVerdict.`}
    >
      <Verd1ctBadge score={dna.tasteScore} px={38} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] font-black uppercase tracking-wide text-pink-100">Your VERD<span style={{ color: '#ff1493' }}>1</span>CT</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-pink-100/70">your taste match</span>
      </span>
    </div>
  );
}
