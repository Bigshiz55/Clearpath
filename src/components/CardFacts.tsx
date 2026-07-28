'use client';

import { useEffect, useState } from 'react';
import { buildCardFacts } from '@/lib/verdict/cardFacts';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';

/**
 * WHAT IT COSTS YOU, AND WHAT KIND OF THING IT IS.
 *
 * The column beside a poster held a title and then ~150px of black, on every
 * card, while runtime, certificate, genre and season count — all of which the
 * app already hydrates to compute the score — appeared nowhere on the card. The
 * empty space and the missing information were the same problem.
 *
 * Two short lines, from the SAME per-title fetch the ratings and synopsis
 * already make, so a card gains this without gaining a request. Every part is
 * printed only when TMDB actually gave us the field; the line shortens rather
 * than inventing, and when we hold nothing the block renders nothing.
 */
/**
 * Two lines, reserved from the first frame. A block that appears when data
 * lands is the same "everything moved under my thumb" defect as text arriving
 * into no space — see `card-ruling.spec`.
 */
const RESERVE = 'h-[38px] overflow-hidden';

export function CardFacts({
  mediaType,
  tmdbId,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  className?: string;
}) {
  const [facts, setFacts] = useState<ReturnType<typeof buildCardFacts> | null>(null);

  useEffect(() => {
    let active = true;
    loadTileFacts(mediaType, tmdbId).then((f) => {
      if (!active) return;
      setFacts(buildCardFacts({ mediaType, ...(f.facts ?? {}) }));
    });
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  if (!facts || facts.empty) return <div aria-hidden className={`${RESERVE} ${className}`} />;

  return (
    <div className={`${RESERVE} ${className}`} data-testid="card-facts">
      {facts.primary.length > 0 && (
        <div className="truncate text-[13px] font-semibold leading-[19px] text-slate-200" data-testid="card-facts-primary">
          {facts.primary.join(' · ')}
        </div>
      )}
      {facts.genres.length > 0 && (
        <div className="truncate text-[13px] leading-[19px] text-slate-400" data-testid="card-facts-genres">
          {facts.genres.join(' · ')}
        </div>
      )}
    </div>
  );
}
