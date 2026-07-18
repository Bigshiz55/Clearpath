'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult as Dna } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';

/** A small double-helix mark — the DNA Score's identity. */
function HelixMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d="M7 3c0 4 10 5 10 9s-10 5-10 9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 3c0 4-10 5-10 9s10 5 10 9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.4 6h7.2M8.4 18h7.2M6.7 9.2h10.6M6.7 14.8h10.6" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

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
      className="flex flex-shrink-0 items-center gap-2.5 rounded-xl border-2 border-pink-400/80 bg-gradient-to-br from-pink-500/45 to-rose-500/30 px-3.5 py-2 shadow-[0_0_22px_rgba(244,63,94,0.4)]"
      title="WatchVerdict DNA Score — a 0–100 estimate of how much YOU will love this, learned from what you’ve rated. It drives your Stream It / Skip It call and sharpens the more you use the app."
    >
      <span className="grid h-12 w-12 place-items-center rounded-lg bg-pink-500/60 ring-2 ring-pink-200/70">
        <HelixMark />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="flex items-center gap-1.5 text-xl font-black tabular-nums text-white">
          {dna.score}
          <span className="text-[11px] font-bold text-pink-100/80">/100</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${v.visual.badge}`}>
            {personal ? '🧬' : v.emoji} {v.call}
          </span>
        </span>
        <span className="text-[10px] font-black uppercase tracking-wide text-white">🧬 DNA Score · {v.tier}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-pink-100/90">{sub}</span>
      </span>
    </div>
  );
}
