'use client';

/**
 * ONE SIDE OF A SHOWDOWN.
 *
 * A real poster, from the same TMDB path every other surface in the app uses.
 * When a title genuinely has no artwork it is dropped from the pool upstream
 * rather than rendered as an empty box — but a CDN can still fail at request
 * time, so the typographic treatment below is a real fallback and carries the
 * title and year, keeping the tile answerable with no image at all.
 *
 * The whole tile is the button. A poster with a separate "choose" control asks
 * for two decisions where the game only has one.
 */

import { useState } from 'react';
import { tmdbImage } from '@/lib/tmdb/image';
import type { ShowdownTitle } from '@/lib/showdown/matchup';

const ACCENTS = ['#38bdf8', '#f59e0b', '#a855f7', '#22c55e', '#ec4899', '#14b8a6'] as const;

/** Deterministic per title, so the same film always looks the same. */
function accentFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length]!;
}

export function PosterTile({
  title,
  side,
  onPick,
  disabled,
}: {
  title: ShowdownTitle;
  side: 'left' | 'right';
  onPick: () => void;
  disabled?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : tmdbImage(title.posterPath, 'w500');
  const accent = accentFor(title.key);

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      data-testid={`showdown-pick-${side}`}
      data-title-key={title.key}
      data-has-art={url ? 'true' : 'false'}
      aria-label={`Choose ${title.title}${title.year ? ` (${title.year})` : ''}`}
      className="group relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden rounded-2xl ring-1 ring-white/10 transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(155deg, ${accent}45, rgba(8,11,20,0.97) 70%)` }}
        />
      )}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{ background: 'linear-gradient(to top, rgba(4,7,15,0.95), transparent)' }}
      />
      <span className="relative block p-3 text-left">
        <span className="block text-balance text-sm font-black leading-tight text-white sm:text-lg">
          {title.title}
        </span>
        {title.year && <span className="mt-0.5 block text-xs font-semibold text-slate-300">{title.year}</span>}
      </span>
    </button>
  );
}
