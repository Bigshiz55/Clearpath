'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { WatchVerd1ctScore } from './WatchVerd1ctScore';
import { CardRatings } from './CardRatings';

/**
 * The one pink "algorithm" box on every card. It folds the user's DNA together
 * with every rating (RT, audience, IMDb) into a single 0–100 score and a plain
 * "will you like it?" answer, with the source ratings shown prominently beneath.
 */
export function AlgorithmScore({
  mediaType,
  tmdbId,
  title,
  year,
  objectiveScore = null,
  compact = false,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year?: number | null;
  objectiveScore?: number | null;
  /** Row cards are height-constrained: smaller badge, tighter box, one line. */
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
  const score = personal ? dna!.score : dna?.score ?? objectiveScore;

  return (
    <div
      /* A DARK PANEL WITH A PINK EDGE — not a pink block.
         It was a tinted pink fill holding a pink label, a coloured call badge
         and three rating chips, laid out as two stacked rows with air between
         them: the largest, loudest area on the card, and most of it empty. The
         fill is now the card's own near-black, so the ONLY bright things left
         are the score and the call — which are the two things this panel
         exists to say. Pink survives as the edge and the label, which is
         enough for it to read as the brand's own verdict. */
      className={`wv-score rounded-xl bg-ink-950/70 ring-1 ring-[#ff1493]/40 shadow-[0_0_14px_-6px_rgba(255,20,147,0.55)] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'} ${className}`}
      data-testid="verdict-panel"
      title="Your VERD1CT — your taste blended with every rating into one 0–100 estimate of how much YOU will like it. It says nothing about where the title is available; see Where to watch below. The blue TV means it’s from WatchVerd1ct."
    >
      {/* ONE ROW WHEN THE PANEL CAN HOLD ONE.
          Score, call and the ratings that produced it belong on a single line;
          they were stacked at every width, which cost a whole row of height to
          say three things that fit side by side on all but the narrowest
          cards. Below ~310px of panel the ratings wrap underneath (see
          `.wv-score-ratings` in globals.css) rather than being squeezed. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* THE ONE MARK — see WatchVerd1ctScore.
            This used to compose the badge, the label and the call inline. That
            inline copy was the reference identity the drawer and the strip had
            drifted away from, so leaving it here would let them drift again
            from the other direction. The card now renders the SAME component
            as everything else; `callTestId` keeps the selector this surface
            already had. `reserveWhenEmpty` holds the mark's true height before
            a score lands, so the grid does not grow underneath a thumb. */}
        <WatchVerd1ctScore
          score={score ?? null}
          personal={personal}
          px={compact ? 38 : 42}
          reserveWhenEmpty
          callTestId="verdict-call"
        />
        {personal && dna!.sampleSize > 0 && dna!.confidence < 0.5 && (
          <span className="text-[10px] font-black uppercase tracking-wide text-pink-200/60">· learning</span>
        )}

        {/* The source ratings that feed the score. */}
        <CardRatings mediaType={mediaType} tmdbId={tmdbId} title={title} year={year} hideCall className="wv-score-ratings" />
      </div>
    </div>
  );
}
