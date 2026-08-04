'use client';

import { useEffect, useState } from 'react';
import { loadDna, type DnaClientResult } from '@/lib/dnaClient';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';
import {
  buildWhyReasons,
  primaryReasons,
  additionalReasons,
  type Reason,
  type WhyInput,
} from '@/lib/reasons/whyThisTitle';

/**
 * WHY THIS TITLE IS HERE — the first of the card's two questions.
 *
 * Reuses the DNA and facts fetches the card already makes (`loadDna`,
 * `loadTileFacts`), so this costs no extra request. Every reason comes from
 * `buildWhyReasons`, which produces nothing it cannot substantiate — so an
 * anonymous visitor with no rated history sees the factual reasons only, and a
 * title with nothing to say renders nothing rather than boilerplate.
 *
 * One or two reasons show; the rest sit behind "Why?". A card is a summary,
 * and a stack of six justifications reads as an argument for a title the user
 * has not asked about yet.
 *
 * `context` is for reasons only the surface knows — On TV knows about
 * tonight's airing, a Pack knows what is trending in it. They are merged, then
 * ranked by the same pure function as everything else.
 */
export function WhyThisTitle({
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
  const [reasons, setReasons] = useState<Reason[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([loadDna(mediaType, tmdbId), loadTileFacts(mediaType, tmdbId)]).then(
      ([dna, facts]: [DnaClientResult | null, Awaited<ReturnType<typeof loadTileFacts>>]) => {
        if (!active) return;
        setReasons(
          buildWhyReasons({
            // `agree` is already ordered strongest-first by the DNA engine.
            tasteAgreements: (dna?.fit?.agree ?? []).map((a) => a.label),
            // `episodeRuntimeMinutes` FIRST. A series carries its per-episode
            // length there and leaves `runtimeMinutes` null — CSI: NY and
            // Harrow both do — so reading only the latter silently dropped the
            // "43-minute episodes" reason on exactly the cards it was for.
            genres: [...(facts.facts?.genres ?? [])],
            ratedCount: dna?.sampleSize ?? 0,
            seasons: facts.facts?.seasons ?? null,
            episodeMinutes: facts.facts?.episodeRuntimeMinutes ?? facts.facts?.runtimeMinutes ?? null,
            ...context,
          }),
        );
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, tmdbId, JSON.stringify(context ?? {})]);

  if (!reasons || reasons.length === 0) return null;

  const shown = primaryReasons(reasons);
  const rest = additionalReasons(reasons);

  return (
    <section className={`space-y-1 ${className}`} data-testid="why-this-title" aria-label="Why this title is here">
      <h4 className="text-[11px] font-black uppercase tracking-wide text-slate-300">Why it fits</h4>
      <ul className="flex flex-wrap gap-1">
        {shown.map((r) => (
          <li
            key={r.kind}
            data-testid="why-reason"
            className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-100/90"
          >
            {r.text}
          </li>
        ))}
        {rest.length > 0 && !open && (
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              data-testid="why-expand"
              className="rounded-md border border-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
              aria-expanded={false}
            >
              Why?
            </button>
          </li>
        )}
        {open &&
          rest.map((r) => (
            <li
              key={r.kind}
              data-testid="why-reason"
              className="rounded-md border border-white/12 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300"
            >
              {r.text}
            </li>
          ))}
      </ul>
    </section>
  );
}
