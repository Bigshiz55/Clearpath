'use client';

/**
 * ONE RESULT, ONE OBVIOUS TARGET.
 *
 * ── THE DEFECT THIS REPLACES ──────────────────────────────────────────────
 * Autocomplete rendered the full `PosterCard`. That card is a beautiful thing
 * on a grid and the wrong thing in a dropdown: it is visually ONE card but it
 * is not one navigable result. Only the artwork and the heading were wrapped
 * in a link — the score, the facts, the synopsis, "Why it fits" and "Where to
 * watch" were all dead. So the user saw a large rich card for "CSI: NY", tapped
 * the middle of it, and nothing happened. The explicit blue Search button
 * worked, which made it look like a fluke rather than a broken card.
 *
 * ── WHY NOT JUST WRAP THE CARD IN A LINK ──────────────────────────────────
 * Because it contains Save, W, For, Against and availability buttons, and a
 * button inside an anchor is invalid HTML with genuinely undefined activation
 * behaviour — every one of those controls would become a coin toss between
 * acting and navigating. The fix is a different shape, not a bigger hit area:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ <Link>  poster + everything you read  </Link>│  ← one target, no buttons
 *   ├──────────────────────────────────────────────┤
 *   │ [Save] [W] [For] [Against]                   │  ← siblings, never nested
 *   └──────────────────────────────────────────────┘
 *
 * Everything inside the link is text and images. Every control is outside it.
 * There is no region that looks pressable and is not, and nothing that has to
 * guess what a tap meant.
 *
 * It reads its facts from `loadTileFacts`, the SAME shared per-title request
 * the grid cards use — so a dropdown of results costs one request per title,
 * not one per component, and the provider names it shows come from the same
 * data the full title page will show a moment later.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Poster } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { CardVerdict } from '@/components/CardVerdict';
import { Verd1ctBadge } from '@/components/Verd1ctBadge';
import { WCheck } from '@/components/WCheck';
import { loadTileFacts } from '@/lib/tileFacts';
import { buildCardFacts } from '@/lib/verdict/cardFacts';
import { optionsFromCardAvailability, resolveWatchPresentation } from '@/lib/availability/watchPresentation';
import { optionsFromTileProviders, mergeProviderOptions, providerSummary } from '@/lib/availability/providerOptions';
import type { MediaType } from '@/lib/types';

export interface SearchResultItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  posterPath: string | null;
}

export function titleHrefFor(r: { mediaType: MediaType; id: number }): string {
  return `/app/title/${r.mediaType}/${r.id}`;
}

export function SearchResultRow({
  result,
  onNavigate,
}: {
  result: SearchResultItem;
  /**
   * Runs BEFORE the browser leaves. The sheet closes itself here — see
   * SearchBar's `leaveForResult`. Without it the modal overlay stayed mounted
   * over the destination and the screen went black.
   */
  onNavigate?: () => void;
}) {
  const { id, mediaType, title, year, posterUrl, posterPath } = result;
  const [facts, setFacts] = useState<{
    line: string | null;
    overview: string | null;
    score: number | null;
    where: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    loadTileFacts(mediaType, id).then((f) => {
      if (!active) return;
      // The SAME merge the full card uses, so the preview and the title page
      // cannot disagree about which platforms carry this.
      const merged = mergeProviderOptions(
        optionsFromCardAvailability(f.availability),
        optionsFromTileProviders(f.providers),
      );
      const summary = providerSummary(merged.options);
      const presentation = resolveWatchPresentation({ options: merged.options, checked: merged.checked });
      setFacts({
        line: (() => {
          if (!f.facts) return null;
          const built = buildCardFacts(f.facts);
          if (built.empty) return null;
          return [...built.primary, ...built.genres].join(' · ');
        })(),
        overview: f.overview,
        score: f.ratings?.standardScore ?? null,
        // Falls back to the resolver's own honest wording rather than a
        // hand-written string, so there is still exactly one vocabulary.
        where: summary ?? (presentation.status === 'unknown' ? 'Not yet confirmed' : 'None found'),
      });
    });
    return () => {
      active = false;
    };
  }, [mediaType, id]);

  const href = titleHrefFor(result);

  return (
    <li className="wv-tile overflow-hidden rounded-2xl bg-ink-950/85" data-testid={`search-result-${id}`}>
      {/* THE NAVIGABLE AREA. One anchor, no interactive descendants, so a tap
          anywhere on the poster or any of the text opens the title — and a
          keyboard user reaches the whole result with one Tab stop and opens it
          with Enter. */}
      <Link
        href={href}
        onClick={onNavigate}
        data-testid={`search-result-open-${id}`}
        className="flex gap-3 p-3 transition hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <span className="block h-[6.75rem] w-[4.5rem] flex-none overflow-hidden rounded-lg bg-ink-800">
          <Poster posterUrl={posterUrl} title={title} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[15px] font-semibold leading-snug text-white">{title}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400">
                <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  {mediaType === 'movie' ? 'Movie' : 'TV'}
                </span>
                <span>{year ?? '—'}</span>
              </span>
            </span>
            {/* The number wears the one visual identity every other surface
                uses — a bare digit pair in a pill read as "some score", which
                is exactly the ambiguity the badge exists to remove. Still the
                objective Standard Score (this row is not personalized); the
                interactive "why this score" affordance belongs on the full
                page. */}
            {facts?.score != null && (
              <span data-testid={`search-result-score-${id}`} className="flex-none">
                <Verd1ctBadge score={facts.score} px={30} tv={false} title="" />
              </span>
            )}
          </span>

          {facts?.line && <span className="mt-1 block truncate text-[11px] text-slate-400">{facts.line}</span>}

          {facts?.overview && (
            <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-slate-400">{facts.overview}</span>
          )}

          {/* WHERE TO WATCH, AS A SUMMARY. Names only, no call to action — the
              actions live outside this link. The words come from the shared
              resolver, so this can never claim more than the full page does. */}
          {facts && (
            <span className="mt-1.5 block text-[11px] text-slate-300" data-testid={`search-result-where-${id}`}>
              <span className="font-bold uppercase tracking-wide text-slate-500">Where </span>
              {facts.where}
            </span>
          )}

          <span className="mt-2 inline-flex items-center text-[12px] font-bold text-brand-200">
            Open full verdict →
          </span>
        </span>
      </Link>

      {/* THE ACTIONS. Siblings of the link and never inside it, so pressing one
          acts and never navigates. Each is the same control used everywhere
          else in the product — this row introduces no new behaviour, only a
          place to put them that is not inside an anchor. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2">
        <CardVerdict tmdbId={id} mediaType={mediaType} title={title} year={year} posterPath={posterPath} />
        <SaveButton tmdbId={id} mediaType={mediaType} title={title} year={year} posterPath={posterPath} />
        <WCheck
          tmdbId={id}
          mediaType={mediaType}
          title={title}
          year={year}
          posterUrl={posterUrl}
          placement="inline"
        />
      </div>
    </li>
  );
}
