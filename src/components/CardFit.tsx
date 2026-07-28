'use client';

import { useEffect, useState } from 'react';
import { loadDna, type DnaClientResult } from '@/lib/dnaClient';
import { buildFitReasons } from '@/lib/verdict/fitReasons';
import type { MediaType } from '@/lib/types';

/**
 * WHY YOU'D LIKE IT — one sentence, only when it is true.
 *
 * The old block said something on EVERY card: a real reason when the profile
 * could support one, and a four-line "this isn't personal yet" disclaimer when
 * it couldn't — which, repeated card after card, was noise, and was removed at
 * the user's request. But the removal took the true sentences down with the
 * boilerplate.
 *
 * This is the true half, alone. When the user's rated history decisively
 * matches this title's fingerprint ("You rate edge-of-seat tension highly."),
 * the sentence renders. When there is nothing personal to say, NOTHING renders
 * — no fallback, no disclaimer, no reserved hole. Silence is the honest state,
 * and the badge's own label already carries "not personal yet".
 *
 * Same per-title DNA fetch the score already makes — no new request.
 */
export function CardFit({
  mediaType,
  tmdbId,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
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

  const r = buildFitReasons({
    agree: dna?.fit?.agree ?? [],
    clash: dna?.fit?.clash ?? [],
    samples: dna?.sampleSize ?? 0,
  });

  // Personal, and genuinely positive — "nothing here matches your taste" is a
  // real finding but not a reason to like it, and the fallback is the
  // boilerplate this component exists to not print.
  if (!r.personalized || /nothing here matches/i.test(r.positive)) return null;

  return (
    <p
      data-testid="card-fit"
      className={`line-clamp-2 text-[13px] leading-snug text-emerald-200/90 ${className}`}
    >
      <span aria-hidden>🧬 </span>
      {r.positive}
    </p>
  );
}
