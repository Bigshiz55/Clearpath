'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';

/**
 * The DNA-weighted Watchability — the objective ratings blended with your
 * Taste-DNA into one overall 0–100, shown as a chip alongside the source
 * ratings. It's what drives the Stream It / Skip It call. Before you've rated
 * enough, it's the plain objective blend (⚖️) and becomes DNA-weighted (🧬) as
 * your taste model fills in.
 */
export function WatchabilityChip({
  mediaType,
  tmdbId,
  objectiveScore,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  objectiveScore: number | null;
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
  const score = dna?.score ?? objectiveScore;
  if (score == null) return null;

  const v = scoreVerdict(score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${v.visual.badge} ${className}`}
      title={
        personal
          ? 'Watchability — your DNA Score weighted together with every rating source. This drives the Stream It / Skip It call.'
          : 'Watchability — every rating source blended into one. Rate a few titles and your DNA starts weighting it.'
      }
    >
      {personal ? '🧬' : '⚖️'} {score}
    </span>
  );
}
