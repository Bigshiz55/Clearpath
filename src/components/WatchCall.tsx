'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { useT } from '@/i18n/I18nProvider';

/**
 * The single headline Watchability rating — the 0–100 score that blends your DNA
 * with every other rating (RT, IMDb, audience), leading with the number and
 * followed by the Stream It / Skip It call it produces. This is the same score
 * that drives the ranking order, so the top of the card and the sort agree.
 *
 * `objectiveScore` is the fallback (0–100, or null when there's genuinely
 * nothing to judge, e.g. unreleased).
 */
export function WatchCall({
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
  const t = useT();
  const [dna, setDna] = useState<DnaClientResult | null>(null);

  useEffect(() => {
    let active = true;
    loadDna(mediaType, tmdbId).then((d) => active && setDna(d));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  const personal = isPersonalized(dna);
  // The /api/dna endpoint returns the objective score as `dna.score` even before
  // the model is personalized, so prefer it; fall back to the passed objective
  // score for guests (no dna at all).
  const score = personal ? dna!.score : dna?.score ?? objectiveScore;

  if (score == null) return null;

  const v = scoreVerdict(score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black ${v.visual.badge} ${className}`}
      title={
        personal
          ? t('card.watchabilityPersonal', { score, call: v.call.toLowerCase() })
          : t('card.watchabilityObjective', { score })
      }
    >
      {personal ? '🧬' : v.emoji} {score} · {v.call}
    </span>
  );
}
