'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { LogoMark } from './Logo';
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
      {/* WatchVerdict Ruling — the blue mark + "Ruling", one line across the top. */}
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-pink-200/25 pb-1.5">
        <LogoMark box="h-5 w-5 rounded-md" inner="h-3.5 w-3.5" />
        <span className="whitespace-nowrap text-[12px] font-black uppercase tracking-wide text-white">
          Ruling
        </span>
      </div>

      {/* What the ruling is — Stream It / Worth a Look / Skip It. */}
      {v && (
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-black tracking-wide ${v.visual.badge}`}>
          {personal ? '🧬' : v.emoji} {v.call}
        </span>
      )}

      {/* DNA score label and the number, on one line (it's always out of 100). */}
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-wide text-pink-100/90">🧬 DNA</span>
        <span className="text-2xl font-black leading-none tabular-nums text-white">{score ?? '—'}</span>
        {personal && dna!.sampleSize > 0 && dna!.confidence < 0.5 && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-pink-100/70">learning</span>
        )}
      </div>

      {/* The ratings that feed the score, on the same card. */}
      <CardRatings mediaType={mediaType} tmdbId={tmdbId} title={title} year={year} hideCall className="mt-2" />
    </div>
  );
}
