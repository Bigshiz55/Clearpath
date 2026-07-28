'use client';

import { useEffect, useState } from 'react';
import { loadDna, type DnaClientResult } from '@/lib/dnaClient';
import { buildFitReasons, type FitReasons } from '@/lib/verdict/fitReasons';
import type { MediaType } from '@/lib/types';

/**
 * "WHY IT FITS YOU" — two short lines, both earned.
 *
 * A score tells you what the app concluded; this tells you what it thinks it
 * knows about you. One sentence for, one against, and neither is ever invented:
 * both come out of `matchHighlights`, which compares this title's cached
 * content fingerprint against the axes the user has demonstrably rated highly.
 *
 * It reads from the SAME per-title DNA fetch the score already makes, so a card
 * gains this line without gaining a request.
 *
 * When there is nothing truthful to say — a profile too thin to speak, or a
 * title we have not fingerprinted — it says THAT, and names what would fix it.
 * A generic sentence dressed as personalisation is worse than an honest one:
 * it teaches people that the personalisation is decoration.
 */
/** Two clamped lines each, plus the gap: 13px at leading-snug is ~17.9px a
 *  line, so 4 lines + 4px ≈ 76px. Held whether or not a caution exists — a
 *  small gap on the titles with no clash is a cost paid once at layout; a grid
 *  that moves is a cost paid on every tap. */
/* A FIXED height, not a minimum. `min-h` is a floor: line-height rounding put
   the rendered block 2px over it and the card grew anyway, which is the whole
   defect. Both lines are clamped to two, so 80px can hold the maximum the
   component can produce, and `overflow-hidden` makes that a guarantee rather
   than an estimate. */
const RESERVE = 'h-20 overflow-hidden';

export function CardWhyItFits({
  mediaType,
  tmdbId,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  className?: string;
}) {
  const [dna, setDna] = useState<DnaClientResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadDna(mediaType, tmdbId).then((d) => {
      if (!active) return;
      setDna(d);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  // THE SPACE IS CLAIMED FROM THE FIRST FRAME, and the words fill into it.
  //
  // Rendering nothing until the fetch returns is what a "no claim about the
  // user" placeholder looks like, and it is also a 76px reflow on every card in
  // the grid a few hundred milliseconds after paint — the exact defect
  // `card-ruling.spec` was written to catch, which is how this was found. The
  // reservation is empty and says nothing; only the height is asserted early.
  if (!loaded) return <div aria-hidden className={`${RESERVE} ${className}`} />;

  const reasons: FitReasons = buildFitReasons({
    agree: dna?.fit?.agree ?? [],
    clash: dna?.fit?.clash ?? [],
    samples: dna?.sampleSize ?? 0,
  });

  return (
    <div
      className={`${RESERVE} space-y-1 ${className}`}
      data-testid="why-it-fits"
      data-personalized={reasons.personalized}
    >
      <p className="line-clamp-2 text-[13px] leading-snug text-slate-300">
        <span className="font-bold text-emerald-300">{reasons.positiveLabel}</span>{' '}
        <span data-testid="fit-positive">{reasons.positive}</span>
      </p>
      {reasons.caution && (
        <p className="line-clamp-2 text-[13px] leading-snug text-slate-400">
          <span className="font-bold text-red-300/90">{reasons.cautionLabel}</span>{' '}
          <span data-testid="fit-caution">{reasons.caution}</span>
        </p>
      )}
    </div>
  );
}
