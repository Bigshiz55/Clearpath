'use client';

import { useEffect, useState } from 'react';
import { loadDna, type DnaClientResult } from '@/lib/dnaClient';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';
import { buildWhyReasons, primaryReasons, type WhyInput } from '@/lib/reasons/whyThisTitle';

/**
 * ONE REASON. THE BROWSE CARD'S WHOLE ANSWER TO "WILL I LIKE IT?".
 *
 * The card used to carry the entire argument: a "Why it fits" heading, up to
 * two emerald reason chips, a "Why?" control that revealed two more, and a
 * separate one-sentence taste line underneath — four stacked blocks, ~120px,
 * on every card in the grid. A browse card is a summary. A stack of
 * justifications for a title nobody has asked about yet is an argument.
 *
 * So the card gets the STRONGEST reason, in one line, and More Info gets the
 * rest (`WhyThisTitle` still renders the full ranked set there). The reason
 * itself is unchanged — same pure `buildWhyReasons`, same ranking, same refusal
 * to produce anything it cannot substantiate — this only decides how much of it
 * a card is allowed to spend its height on.
 *
 * ── THE SPACE IS RESERVED EITHER WAY ──────────────────────────────────────
 * A title with a strong personal reason and a title with none must be the same
 * height, or a row of five cards is a row of two heights. `.wv-reason` pins the
 * region at exactly two lines; this renders words into it or leaves it empty.
 * Nothing here can push the provider row or the actions below it.
 *
 * Costs no request: `loadDna` and `loadTileFacts` are the same two fetches the
 * score and the facts line already make.
 */
export function CardReason({
  mediaType,
  tmdbId,
  context,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  context?: Pick<WhyInput, 'airingTonight' | 'trendingInPack' | 'newThisWeek' | 'householdNames'>;
  className?: string;
}) {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadDna(mediaType, tmdbId), loadTileFacts(mediaType, tmdbId)]).then(
      ([dna, facts]: [DnaClientResult | null, Awaited<ReturnType<typeof loadTileFacts>>]) => {
        if (!active) return;
        const all = buildWhyReasons({
          tasteAgreements: (dna?.fit?.agree ?? []).map((a) => a.label),
          genres: [...(facts.facts?.genres ?? [])],
          ratedCount: dna?.sampleSize ?? 0,
          seasons: facts.facts?.seasons ?? null,
          episodeMinutes: facts.facts?.episodeRuntimeMinutes ?? facts.facts?.runtimeMinutes ?? null,
          ...context,
        });
        setReason(primaryReasons(all, 1)[0]?.text ?? null);
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, tmdbId, JSON.stringify(context ?? {})]);

  // Nothing substantiable: hold the space, print no words. There is no
  // `card-reason` testid on the empty box — an empty region is not a reason and
  // must not be mistakable for one.
  if (!reason) return <div aria-hidden className={`wv-reason ${className}`} />;

  return (
    <p
      data-testid="card-reason"
      /* NOT emerald. Green is the FOR button and a live airing; a recommendation
         rationale is neither, and colouring every favourable thing green is how
         the palette stopped meaning anything. This is the brand's own light
         blue — the same accent as the Verd1ct badge's antennas. */
      className={`wv-reason text-[12.5px] leading-[1.4] text-brand-100/85 ${className}`}
    >
      <span aria-hidden className="mr-1 opacity-70">
        ✦
      </span>
      {reason}
    </p>
  );
}
