'use client';

/**
 * THE W — "put this in front of the judge".
 *
 * A fourth verb, and deliberately not a rename of any of the three that exist:
 *
 *   Save        → a watchlist. Someday.
 *   Not for me  → teaches your DNA. Never.
 *   For         → a reaction. I like this.
 *   W           → I am CONSIDERING this, right now, against the others.
 *
 * It lives on the poster rather than in the action row for two reasons: the row
 * is already three buttons wide and a fourth breaks at 320px, and the W has to
 * sit in the same place on every surface — grid, wall, guide, search — or it
 * stops reading as one consistent gesture.
 */
import { useSyncExternalStore, useState } from 'react';
import {
  addToDocketStore,
  docketKey,
  getDocket,
  getDocketServerSnapshot,
  removeFromDocketStore,
  subscribeDocket,
} from '@/lib/docketStore';
import type { MediaType } from '@/lib/types';

export function WCheck({
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
  const docket = useSyncExternalStore(subscribeDocket, getDocket, getDocketServerSnapshot);
  const [refused, setRefused] = useState<string | null>(null);
  const key = docketKey(mediaType as 'movie' | 'tv', tmdbId);
  const on = docket.some((e) => e.key === key);

  function toggle(e: React.MouseEvent) {
    // These sit inside card links; a tap here is never a navigation.
    e.preventDefault();
    e.stopPropagation();
    setRefused(null);
    if (on) {
      removeFromDocketStore(key);
      return;
    }
    const res = addToDocketStore({
      key,
      tmdbId,
      mediaType: mediaType as 'movie' | 'tv',
      title,
      year,
      posterUrl,
    });
    if (!res.ok) {
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
        data-testid={`w-check-${tmdbId}`}
        aria-label={on ? `${title} — on the docket, tap to take it off` : `${title} — put it on the docket`}
        title={on ? 'On the docket for tonight' : 'Consider this tonight'}
        className={[
          'absolute right-1.5 top-1.5 z-10 grid h-11 w-11 place-items-center rounded-full border-2 text-base font-black transition',
          on
            ? 'border-pink-200 bg-gradient-to-b from-[#ff62b6] to-[#ff1493] text-white shadow-[0_4px_14px_-2px_rgba(255,20,147,0.8)]'
            : 'border-white/40 bg-black/55 text-white/80 backdrop-blur hover:border-[#ff1493] hover:text-white',
          className,
        ].join(' ')}
      >
        W
      </button>
      {refused && (
        <span
          role="status"
          data-testid="w-check-refused"
          className="absolute inset-x-1 top-14 z-10 rounded-lg bg-black/90 px-2 py-1.5 text-[11px] font-semibold leading-tight text-amber-200"
        >
          {refused}
        </span>
      )}
    </>
  );
}
