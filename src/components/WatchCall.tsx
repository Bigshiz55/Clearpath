'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { WatchVerd1ctScore } from './WatchVerd1ctScore';

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

  // ONE MARK EVERYWHERE — see WatchVerd1ctScore.
  //
  // This drew its own pill: an emoji, the number and the call as plain text
  // ("🧬 84 · STREAM IT"). It carried the right INFORMATION and the wrong
  // IDENTITY — the same score wore the pink Verd1ct television on a result
  // card and a bare emoji here, so nothing taught a viewer they were the same
  // proprietary metric. The distinction this component actually owns — whether
  // the number is the user's own DNA-weighted score or the blend — survives as
  // `personal`, which the shared mark renders as "Your VERD1CT" vs
  // "WatchVerd1ct". Everything visual now comes from one place.
  return <WatchVerd1ctScore score={score} personal={personal} px={34} className={className} />;
}
