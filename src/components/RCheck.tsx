'use client';

/**
 * THE R — "I have seen this, and I am thinking of watching it again".
 *
 * The W's counterpart, and the two are mutually exclusive by construction: a
 * title cannot simultaneously be something you have not seen and something you
 * want to see again, so tapping the R takes it off the W docket and vice versa.
 * Without that, a title could sit on both and produce two contradictory rulings
 * from the same tap.
 *
 * Same size, same shape, same corner as the W — it reads as one gesture family.
 * It sits BELOW the W when both are shown, never beside it, because two 44px
 * targets side by side in a poster corner is a mis-tap waiting to happen.
 */
import { useSyncExternalStore, useState } from 'react';
import {
  addToRDocketStore,
  docketKey,
  getRDocket,
  getRDocketServerSnapshot,
  removeFromRDocketStore,
  subscribeRDocket,
} from '@/lib/reverdictStore';
import { removeFromDocketStore } from '@/lib/docketStore';
import type { MediaType } from '@/lib/types';

export function RCheck({
  tmdbId,
  mediaType,
  title,
  year = null,
  posterUrl = null,
  className = '',
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  className?: string;
}) {
  const docket = useSyncExternalStore(subscribeRDocket, getRDocket, getRDocketServerSnapshot);
  const [refused, setRefused] = useState<string | null>(null);
  const key = docketKey(mediaType as 'movie' | 'tv', tmdbId);
  const on = docket.some((e) => e.key === key);

  function toggle(e: React.MouseEvent) {
    // These sit inside card links; a tap here is never a navigation.
    e.preventDefault();
    e.stopPropagation();
    setRefused(null);
    if (on) {
      removeFromRDocketStore(key);
      return;
    }
    const res = addToRDocketStore({
      key,
      tmdbId,
      mediaType: mediaType as 'movie' | 'tv',
      title,
      year,
      posterUrl,
    });
    if (res.ok) {
      // One title, one question. It cannot be up for a first watch as well.
      removeFromDocketStore(key);
    } else {
      setRefused(res.message);
      window.setTimeout(() => setRefused(null), 3500);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        data-testid={`r-check-${tmdbId}`}
        aria-label={
          on
            ? `${title} — up for a rewatch, tap to take it off`
            : `${title} — I have seen it, consider it for a rewatch`
        }
        title={on ? 'Up for a rewatch' : 'Seen it — consider watching it again'}
        className={[
          'absolute right-1.5 top-[3.5rem] z-10 grid h-11 w-11 place-items-center rounded-full border-2 text-base font-black transition',
          on
            ? 'border-amber-200 bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-[0_4px_14px_-2px_rgba(245,158,11,0.8)]'
            : 'border-white/40 bg-black/55 text-white/80 hover:border-amber-400 hover:text-white',
          className,
        ].join(' ')}
      >
        R
      </button>
      {refused && (
        <span
          role="status"
          data-testid="r-check-refused"
          className="absolute inset-x-1 top-[6.5rem] z-10 rounded-lg bg-black/90 px-2 py-1.5 text-[11px] font-semibold leading-tight text-amber-200"
        >
          {refused}
        </span>
      )}
    </>
  );
}
