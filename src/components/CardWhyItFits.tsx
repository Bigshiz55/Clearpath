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
/**
 * A FIXED height, sized for the block's own worst case at the card's FULL
 * width (~334px on a 390px phone, ~54 characters a line at 13px).
 *
 * Per block: a 15px label line, then a sentence clamped to two lines
 * (2 × 17.9 = 36). Two blocks plus the gap ≈ 110px. Fixed rather than a
 * minimum, because `min-h` is only a floor and line-height rounding put the
 * rendered block 2px over it — which grew the card and moved every card below
 * it the moment the data landed.
 */
const RESERVE = 'h-28 overflow-hidden';

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
      {/* THE LABEL GETS ITS OWN LINE. Inline, it ran into the sentence and the
          two read as one long run of text that then got cut — you could not
          tell where the heading stopped and the reason started. On its own line
          it costs 15px and buys a scannable block. */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-wide text-emerald-300">
          {reasons.positiveLabel}
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-slate-300" data-testid="fit-positive">
          {reasons.positive}
        </p>
      </div>
      {reasons.caution && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-red-300/90">
            {reasons.cautionLabel}
          </div>
          <p className="line-clamp-2 text-[13px] leading-snug text-slate-400" data-testid="fit-caution">
            {reasons.caution}
          </p>
        </div>
      )}
    </div>
  );
}
