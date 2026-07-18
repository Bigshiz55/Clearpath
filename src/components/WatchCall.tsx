'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';

/**
 * The single headline "should you watch this" call — driven by the user's DNA
 * Score when they've rated enough to personalize it, and by the objective score
 * otherwise. This replaces the old objective-only STREAM IT badge AND the old
 * personal-match pill, so a card shows exactly one call.
 *
 * `objectiveScore` is the fallback (0–100, or null when there's genuinely
 * nothing to judge, e.g. unreleased).
 */
export function WatchCall({
  mediaType,
  tmdbId,
  objectiveScore,
  compact = false,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  objectiveScore: number | null;
  /** Call only (no "· score") — for the tight card top bar, where the DNA box
   *  below carries the number. */
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
          ? `Your DNA call — a ${score}/100 fit for you, learned from what you’ve rated. This drives the recommendation.`
          : 'WatchVerdict’s objective call. Rate a few titles and this becomes your personal DNA call.'
      }
    >
      {personal ? '🧬' : v.emoji} {v.call}
      {!compact && ` · ${score}`}
    </span>
  );
}
