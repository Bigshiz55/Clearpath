'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { Verd1ctBadge, Verd1ctBadgePlaceholder } from './Verd1ctBadge';
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
  const v = score != null ? scoreVerdict(score) : null;

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
        {(() => {
          const px = compact ? 38 : 42;
          if (score != null) return <Verd1ctBadge score={score} px={px} />;
          // The canonical missing state, at the badge's REAL height (antennas
          // and feet included) so the card never grows when a score lands.
          return <Verd1ctBadgePlaceholder px={px} />;
        })()}
        {/* THE LABEL GOES ABOVE THE CALL, NOT UNDER IT.
            "STREAM IT" on its own is an instruction, and it sat directly above
            "Availability not currently confirmed" — a card telling you to go
            stream something while admitting it does not know whether you can.
            The call is a TASTE verdict: it comes from `scoreVerdict(score)`,
            which takes a number and nothing else and has never had an
            availability input. Reading the label first ("YOUR VERD1CT") makes
            that explicit, and the WHERE TO WATCH block immediately below
            answers the separate question of fact. */}
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase leading-tight tracking-wide text-pink-200/80">
            {personal ? (<>Your VERD<span style={{ color: '#ff1493' }}>1</span>CT</>) : 'WatchVerd1ct'}
            {personal && dna!.sampleSize > 0 && dna!.confidence < 0.5 ? ' · learning' : ''}
          </div>
          {v && (
            <span
              className={`mt-0.5 inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-black tracking-tight ${v.visual.badge}`}
              data-testid="verdict-call"
              /* Screen readers get the distinction spelled out: without this,
                 "STREAM IT" is announced as a bare imperative indistinguishable
                 from the availability row beneath it. */
              aria-label={`Your recommendation verdict is ${v.call}. Current viewing availability is not confirmed by this panel — see Where to watch.`}
            >
              {v.call}
            </span>
          )}
        </div>

        {/* The source ratings that feed the score. */}
        <CardRatings mediaType={mediaType} tmdbId={tmdbId} title={title} year={year} hideCall className="wv-score-ratings" />
      </div>
    </div>
  );
}
