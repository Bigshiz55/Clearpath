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
  compact = false,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year?: number | null;
  objectiveScore?: number | null;
  /** Row cards are height-constrained: smaller badge, tighter box, one line. */
  compact?: boolean;
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
      /* LIGHTER, NOT QUIETER. This was a two-pixel pink border over a
         saturated gradient with a glow — three separate ways of shouting, on a
         card that also had green, red, magenta, red-tomato, yellow-IMDb and
         gold all competing. The score and the call are still the loudest thing
         here; they just no longer have to outshout their own container. A soft
         tint and a one-pixel ring do the framing. */
      className={`rounded-xl bg-[#ff1493]/[0.09] ring-1 ring-[#ff1493]/35 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} ${className}`}
      title="Your VERD1CT — your taste blended with every rating into one 0–100 estimate of how much YOU will like it. The blue TV means it’s from WatchVerdict."
    >
      {/* The VERD1CT badge (number + TV) beside the ruling (Stream It / …).
          flex-wrap so the ruling drops below the badge on a narrow card instead
          of clipping at the right edge. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {score != null ? (
          <Verd1ctBadge score={score} px={compact ? 38 : 44} />
        ) : (
          <span className={`grid flex-none place-items-center rounded-[24%] bg-white/10 text-xl font-black text-slate-400 ${compact ? 'h-[38px] w-[38px]' : 'h-11 w-11'}`}>—</span>
        )}
        <div className="min-w-0">
          {v && (
            <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-black tracking-tight ${v.visual.badge}`}>
              {v.call}
            </span>
          )}
          <div className={`text-[10px] font-black uppercase tracking-wide text-pink-200/80 ${compact ? '' : 'mt-1'}`}>
            {personal ? (<>Your VERD<span style={{ color: '#ff1493' }}>1</span>CT</>) : 'WatchVerdict'}
            {personal && dna!.sampleSize > 0 && dna!.confidence < 0.5 ? ' · learning' : ''}
          </div>
        </div>
      </div>

      {/* The source ratings that feed the score — shown prominently. */}
      <CardRatings mediaType={mediaType} tmdbId={tmdbId} title={title} year={year} hideCall className={compact ? 'mt-1.5' : 'mt-2'} />
    </div>
  );
}
