'use client';

import { useEffect, useState } from 'react';
import { loadDna, type DnaClientResult } from '@/lib/dnaClient';
import { personalizationStatus, PERSONALIZATION_LABEL } from '@/lib/verdict/fitReasons';
import type { MediaType } from '@/lib/types';

/**
 * PERSONALIZATION STATUS — one section, one sentence, always earned.
 *
 * This was two labelled blocks: "What we can say" and "Why it is not personal
 * yet". Two headings and two sentences to describe one state, in a shape that
 * read as two separate findings and framed the state as a deficiency twice
 * over. One heading now, and the sentence leads with what the recommendation
 * IS based on before naming what would sharpen it.
 *
 * Nothing here is invented. When there is a profile, the sentence names the
 * axes the user demonstrably rates highly (`matchHighlights`, from the cached
 * content fingerprint); when there is not, it says so and names the fix. A
 * generic sentence dressed as personalisation is worse than an honest one.
 *
 * It reads from the SAME per-title DNA fetch the score already makes, so a
 * card gains this line without gaining a request.
 */
/**
 * A FIXED height, sized for the worst case of BOTH branches at the narrowest
 * column the card ever gets (a 252px grid cell at 1440).
 *
 * Four body lines plus a label: the honest fallback runs to three lines there,
 * and a personalised status is a two-line sentence plus a two-line caveat.
 * Fixed rather than a minimum, because `min-h` is only a floor and line-height
 * rounding put the rendered block over it — which grew the card and moved
 * every card below it the moment the data landed.
 */
const RESERVE = 'h-[5.25rem] overflow-hidden';

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
  // user" placeholder looks like, and it is also a reflow on every card in the
  // grid a few hundred milliseconds after paint — the exact defect
  // `card-ruling.spec` was written to catch. The reservation is empty and says
  // nothing; only the height is asserted early.
  if (!loaded) return <div aria-hidden className={`${RESERVE} ${className}`} />;

  const status = personalizationStatus({
    agree: dna?.fit?.agree ?? [],
    clash: dna?.fit?.clash ?? [],
    samples: dna?.sampleSize ?? 0,
  });

  return (
    <div
      className={`${RESERVE} ${className}`}
      data-testid="why-it-fits"
      data-personalized={status.personalized}
    >
      <div className="text-[10px] font-black uppercase leading-tight tracking-wide text-slate-400">
        {PERSONALIZATION_LABEL}
      </div>
      {/* FOUR lines, not three. At 320px the card foot is ~264px, which is ~44
          characters a line, and the honest fallback is 143 — it was losing its
          last clause exactly where the app has least room to be unclear. Four
          is also the personalised worst case (a two-line sentence plus a
          two-line caveat), so both branches fit the same reservation. */}
      <p className="line-clamp-4 text-[12px] leading-snug text-slate-300" data-testid="fit-positive">
        {status.sentence}
      </p>
      {status.note && (
        <p className="line-clamp-2 text-[12px] leading-snug text-slate-500" data-testid="fit-caution">
          {status.note}
        </p>
      )}
    </div>
  );
}
