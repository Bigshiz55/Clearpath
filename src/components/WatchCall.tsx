'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';

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

  // THE ONE CANONICAL HEADLINE. This badge used to print `dna.score` — the
  // TASTE blend — while the briefing and the title page printed the Standard
  // Score plus this user's deterministic rules, so the same title carried two
  // different headline numbers depending on which surface you were looking at.
  // `canonical` is the shared contract; `dna.score` remains the taste view and
  // still drives the DNA panel. Guests (no dna at all) fall back to the
  // objective score the card already had.
  const canonical = dna?.canonical ?? null;
  const personal = canonical ? canonical.personalized : isPersonalized(dna);
  const score = canonical?.score ?? dna?.score ?? objectiveScore;

  if (score == null) return null;

  const v = scoreVerdict(score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black ${v.visual.badge} ${className}`}
      title={
        canonical
          ? `${canonical.label} ${score}/100 — ${canonical.why}. This drives the ${v.call.toLowerCase()} call and the ranking order.`
          : personal
            ? `Watchability ${score}/100 — your DNA blended with every rating. This drives the ${v.call.toLowerCase()} call and the ranking order.`
            : `Watchability ${score}/100 — every rating blended. Rate a few titles and your DNA starts weighting it. Drives the ranking order.`
      }
    >
      {personal ? '🧬' : v.emoji} {score} · {v.call}
    </span>
  );
}
