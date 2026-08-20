'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { Verd1ctBadge } from './Verd1ctBadge';

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
      /* ONE SCORE, ONE MARK. This was a bare green pill — `82 · STREAM IT` in
         10px — which is the same number the title page carries inside the
         branded VERD1CT TV badge. Two visual identities for one concept meant
         the product's primary judgment read as a metadata chip on every card
         surface. The number now lives in the SAME mark at compact scale
         (`tv={false}`, the Live-guide precedent); the Stream/Skip call keeps
         its verdict colour beside it. Compact is a size, not a demotion. */
      className={`inline-flex items-center gap-1.5 align-middle ${className}`}
      data-testid="watch-call"
      title={
        canonical
          ? `${canonical.label} ${score}/100 — ${canonical.why}. This drives the ${v.call.toLowerCase()} call and the ranking order.`
          : personal
            ? `Watchability ${score}/100 — your DNA blended with every rating. This drives the ${v.call.toLowerCase()} call and the ranking order.`
            : `Watchability ${score}/100 — every rating blended. Rate a few titles and your DNA starts weighting it. Drives the ranking order.`
      }
    >
      <Verd1ctBadge score={score} px={26} tv={false} title="" />
      <span className={`rounded px-1 py-0.5 text-[10px] font-black leading-none ${v.visual.badge}`}>
        {personal ? '🧬 ' : ''}{v.call}
      </span>
    </span>
  );
}
