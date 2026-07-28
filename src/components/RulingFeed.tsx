'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { tmdbImage } from '@/lib/tmdb/image';
import { dealRulingBatch, type DealtPick } from '@/lib/actions/recommendations';
import {
  START,
  PREFETCH_PX,
  applyDeal,
  dealtKey,
  minScoreFor,
  tierNote,
  type DeckCursor,
} from '@/lib/reco/deck';

/**
 * THE RULING FEED — keep going until you stop, or hit the gavel.
 *
 * "It will stop usually at 12, then a couple kind of automatically randomly
 * update, then a few may show up again… literally not run out of movies or TV
 * shows to rule on until they've decided to stop."
 *
 * Four rules, and every one of them is a fix for something that was visibly
 * wrong (see `lib/reco/deck` for the reasoning):
 *
 *   1. APPEND ONLY. What is on screen never moves, never re-sorts, never
 *      disappears — whatever the user's taps do to their profile.
 *   2. EVERY KEY EVER DEALT GOES BACK TO THE SERVER, so nothing is dealt twice.
 *   3. THE NEXT BATCH IS FETCHED BEFORE YOU REACH THE BOTTOM, so the feed never
 *      visibly stops. The button below is the fallback for a failed prefetch.
 *   4. THE END IS SAID, ONCE IT IS TRUE — and only after several consecutive
 *      empty deals across the whole supply, never after one thin one.
 */
export function RulingFeed({ initial }: { initial: DealtPick[] }) {
  const [items, setItems] = useState<DealtPick[]>(initial);
  const [cursor, setCursor] = useState<DeckCursor | null>(START);
  const [emptyStreak, setEmptyStreak] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [spent, setSpent] = useState(false);

  // The sentinel sits a few cards above the bottom of the feed; seeing it is
  // what triggers the next deal.
  const sentinel = useRef<HTMLDivElement>(null);
  // Guards against a second deal being fired while one is in flight — the
  // observer fires repeatedly as the sentinel crosses.
  const inFlight = useRef(false);

  const deal = useCallback(async () => {
    if (inFlight.current || spent || !cursor) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const res = await dealRulingBatch({
        dealtKeys: items.map(dealtKey),
        tier: cursor.tier,
        page: cursor.page,
        minScore: minScoreFor(cursor.tier),
      });
      const next = applyDeal(items, res.items, cursor, emptyStreak, dealtKey);
      setItems(next.items);
      setCursor(next.cursor);
      setEmptyStreak(next.emptyStreak);
      setSpent(next.spent);
      if (next.note) setNote(next.note);
    } catch {
      // The feed is untouched and the button comes back. A failed request is
      // not evidence that the well is dry.
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [items, cursor, emptyStreak, spent]);

  // PREFETCH. An IntersectionObserver on a sentinel placed `PREFETCH_WITHIN`
  // cards from the end, so the next twelve are already under the last one by
  // the time it is on screen.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || spent) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void deal();
      },
      // Fires while the sentinel is still `PREFETCH_PX` BELOW the fold, which
      // is several cards' worth — by the time the last card is on screen the
      // next twelve are already under it.
      { rootMargin: `${PREFETCH_PX}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [deal, spent]);

  return (
    <>
      <div className="poster-grid" data-testid="ruling-feed">
        {items.map((r) => (
          <PosterCard
            key={dealtKey(r)}
            href={`/app/title/${r.mediaType}/${r.id}`}
            title={r.title}
            year={r.year}
            mediaType={r.mediaType}
            posterUrl={tmdbImage(r.posterPath, 'w342')}
            posterPath={r.posterPath}
            tmdbId={r.id}
            overlay={<SaveButton wide tmdbId={r.id} mediaType={r.mediaType} title={r.title} year={r.year} posterPath={r.posterPath} />}
          />
        ))}
      </div>

      {/* THE SENTINEL IS A SIBLING OF THE GRID, NOT A CELL IN IT.
          Interleaving it with the cards meant either a `display: contents`
          wrapper around every card — which has no box, so `.poster-grid > *`
          stopped applying and the Safari min-width guard silently switched off
          — or a 1px element taking a whole grid cell and punching a hole in the
          layout. Outside the grid with a tall `rootMargin` reaches the same
          place: the fetch starts several cards before the bottom. */}
      <div ref={sentinel} aria-hidden className="h-px w-full" data-testid="feed-sentinel" />

      <div className="mt-4 flex flex-col items-center gap-2" data-testid="feed-foot">
        {/* THE SEAM. When the supply widens the bar comes down with it, and a
            lowered bar nobody is told about is just a worse recommendation
            wearing the same heading. */}
        {note && !spent && (
          <p className="text-xs text-slate-400" data-testid="feed-tier-note">
            {note}
          </p>
        )}

        {busy && (
          <p className="text-sm text-slate-400" role="status" data-testid="feed-loading">
            Finding more for you…
          </p>
        )}

        {failed && (
          <p className="text-sm text-amber-200" role="status">
            That did not come back. Nothing was lost.
          </p>
        )}

        {/* The fallback, for a prefetch that failed or an observer that never
            fired (old Safari, reduced data mode). Hidden while a deal is in
            flight so it cannot be double-tapped. */}
        {!spent && !busy && (
          <button
            type="button"
            onClick={() => void deal()}
            className="btn-secondary w-full px-6 sm:w-auto"
            data-testid="feed-load-more"
          >
            {failed ? 'Try again' : 'Show me more'}
          </button>
        )}

        {spent && (
          <p className="max-w-md text-center text-xs text-slate-500" data-testid="feed-spent">
            That is everything we can put in front of you right now — {items.length} titles across your
            matches, your genres, and beyond. Rule a few more and the next set will be sharper.
          </p>
        )}
      </div>
    </>
  );
}

export { tierNote };
