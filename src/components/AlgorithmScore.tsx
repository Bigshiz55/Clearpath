'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { HelixMark } from './HelixMark';
import { CardRatings } from './CardRatings';

/**
 * The one pink "algorithm" box on every card. It folds the user's DNA together
 * with every rating (RT, audience, IMDb) into a single 0–100 score and a plain
 * "will you like it?" answer, with the individual ratings shown underneath. This
 * replaces the old split treatment (a DNA call up top + a separate DNA row),
 * which read as two competing DNA numbers.
 */
export function AlgorithmScore({
  mediaType,
  tmdbId,
  title,
  year,
  objectiveScore = null,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year?: number | null;
  objectiveScore?: number | null;
  className?: string;
}) {
  const [dna, setDna] = useState<DnaClientResult | null>(null);

  useEffect(() => {
    let active = true;
    loadDna(mediaType, tmdbId).then((d) => active && setDna(d));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  const personal = isPersonalized(dna);
  const score = personal ? dna!.score : dna?.score ?? objectiveScore;
  const v = score != null ? scoreVerdict(score) : null;

  return (
    <div
      className={`rounded-xl border-2 border-pink-400/70 bg-gradient-to-br from-pink-500/30 to-rose-500/20 p-2.5 shadow-[0_0_16px_rgba(244,63,94,0.28)] ${className}`}
      title="WatchVerdict algorithm — your DNA blended with every rating into one 0–100 estimate of how much YOU will like it."
    >
      <div className="flex items-center gap-1.5">
        <HelixMark className="h-4 w-4" />
        <span className="text-[10px] font-black uppercase tracking-wide text-pink-100">
          {personal ? 'Will you like it?' : 'Watchability'}
        </span>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-baseline gap-1 tabular-nums text-white">
          <span className="text-2xl font-black leading-none">{score ?? '—'}</span>
          <span className="text-[10px] font-bold text-pink-100/80">/100</span>
        </span>
        {v && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${v.visual.badge}`}>
            {personal ? '🧬' : v.emoji} {v.call}
          </span>
        )}
        {personal && dna!.sampleSize > 0 && dna!.confidence < 0.5 && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-pink-100/70">learning</span>
        )}
      </div>

      {/* The ratings that feed the score, on the same card. */}
      <CardRatings mediaType={mediaType} tmdbId={tmdbId} title={title} year={year} hideCall className="mt-2" />
    </div>
  );
}
