'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { Verd1ctBadge } from './Verd1ctBadge';
import { CardRatings } from './CardRatings';

/**
 * The one pink "algorithm" box on every card. It folds the user's DNA together
 * with every rating (RT, audience, IMDb) into a single 0–100 score and a plain
 * "will you like it?" answer, with the source ratings shown prominently beneath.
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
      className={`rounded-xl border-2 border-pink-400/70 bg-gradient-to-br from-pink-500/30 to-rose-500/20 px-2 py-2 shadow-[0_0_16px_rgba(244,63,94,0.28)] ${className}`}
      title="Your VERD1CT — your taste blended with every rating into one 0–100 estimate of how much YOU will like it. The blue TV means it’s from WatchVerdict."
    >
      {/* The VERD1CT badge (number + TV) beside the ruling (Stream It / …). */}
      <div className="flex items-center gap-2.5">
        {score != null ? (
          <Verd1ctBadge score={score} px={44} />
        ) : (
          <span className="grid h-11 w-11 flex-none place-items-center rounded-[24%] bg-white/10 text-xl font-black text-slate-400">—</span>
        )}
        <div className="min-w-0">
          {v && (
            <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-black tracking-tight ${v.visual.badge}`}>
              {v.call}
            </span>
          )}
          <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-pink-100/90">
            {personal ? (<>Your VERD<span style={{ color: '#ff1493' }}>1</span>CT</>) : 'WatchVerdict'}
            {personal && dna!.sampleSize > 0 && dna!.confidence < 0.5 ? ' · learning' : ''}
          </div>
        </div>
      </div>

      {/* The source ratings that feed the score — shown prominently. */}
      <CardRatings mediaType={mediaType} tmdbId={tmdbId} title={title} year={year} hideCall className="mt-2" />
    </div>
  );
}
