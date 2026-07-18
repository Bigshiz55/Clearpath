'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult as Dna } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { HelixMark } from './HelixMark';

/**
 * The WatchVerdict DNA Score — a per-user "odds you'll love it" (0..100),
 * fetched from the user's Taste-DNA. Shows a hot-pink DNA badge with the number.
 * When the model has little of your data yet, it leans on the objective score
 * and says so; it sharpens as you rate more.
 */
export function DnaScore({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const [dna, setDna] = useState<Dna | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadDna(mediaType, tmdbId)
      .then((d) => {
        if (!active) return;
        setDna(d);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  if (!loaded) {
    return <div className="h-[52px] w-40 flex-shrink-0 animate-pulse rounded-xl bg-pink-500/10" />;
  }
  if (!dna) return null;

  const personal = isPersonalized(dna);
  const learning = dna.confidence < 0.5;
  const sub = !dna.available
    ? 'Odds you’ll love it'
    : dna.sampleSize === 0
      ? 'Rate titles to personalize'
      : learning
        ? `Learning · ${dna.sampleSize} rated`
        : 'Odds you’ll love it';

  const v = scoreVerdict(dna.score);

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 border-pink-400/80 bg-gradient-to-r from-pink-500/40 to-rose-500/25 px-3 py-1.5 shadow-[0_0_18px_rgba(244,63,94,0.35)]"
      title="WatchVerdict DNA Score — a 0–100 estimate of how much YOU will love this, learned from what you’ve rated. It drives your Stream It / Skip It call and sharpens the more you use the app."
    >
      <HelixMark className="h-5 w-5" />
      <span className="text-[10px] font-black uppercase tracking-wide text-white">🧬 DNA Score</span>
      <span className="flex items-baseline gap-1 tabular-nums text-white">
        <span className="text-lg font-black">{dna.score}</span>
        <span className="text-[10px] font-bold text-pink-100/80">/100</span>
      </span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${v.visual.badge}`}>
        {personal ? '🧬' : v.emoji} {v.call}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-pink-100/90">{sub}</span>
    </div>
  );
}
