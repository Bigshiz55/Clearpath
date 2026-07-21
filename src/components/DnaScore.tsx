'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { isPersonalized, type DnaClientResult as Dna } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { Verd1ctBadge } from './Verd1ctBadge';

/**
 * The WatchVerdict DNA Score — a per-user "odds you'll love it" (0..100). On the
 * title page it requests the AI adjustment layer (`?ai=1`): the deterministic
 * Watchability blend, refined by a bounded ±15 AI nudge with a one-line reason.
 * When the model has little of your data yet, it leans on the objective score.
 */
export function DnaScore({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const [dna, setDna] = useState<Dna | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    // Dedicated fetch (not the shared card loader) so the title page gets the AI
    // adjustment + reasoning that the many-card grids deliberately skip.
    fetch(`/api/dna/${mediaType}/${tmdbId}?ai=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setDna((d?.dna as Dna | null) ?? null);
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
  const adj = dna.adjustment ?? 0;
  const hasAi = adj !== 0 && dna.baseScore != null;

  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-center gap-3 rounded-xl border-2 border-pink-400/80 bg-gradient-to-r from-pink-500/40 to-rose-500/25 px-3 py-2 shadow-[0_0_18px_rgba(244,63,94,0.35)]"
        title="Your VERD1CT — a 0–100 estimate of how much YOU will love this, learned from what you’ve rated. It drives your Stream It / Skip It call and sharpens the more you use the app."
      >
        <Verd1ctBadge score={dna.score} px={52} />
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white">Your VERD1CT</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${v.visual.badge}`}>
              {personal ? '🧬' : v.emoji} {v.call}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-pink-100/90">{sub}</span>
          </div>
        </div>
      </div>

      {/* The bounded AI refinement, shown transparently: base → adjustment → final. */}
      {hasAi && (
        <div className="flex items-start gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-300">
          <span aria-hidden className="mt-px">🤖</span>
          <span>
            <span className="font-bold text-white">AI {adj > 0 ? `+${adj}` : adj}</span>{' '}
            <span className="tabular-nums text-slate-400">({dna.baseScore} → {dna.score})</span>
            {dna.reasoning ? <> — {dna.reasoning}</> : null}
          </span>
        </div>
      )}
    </div>
  );
}
