'use client';

/**
 * ONE SIDE OF A MATCHUP.
 *
 * The tile IS the button — the whole poster is the target, because asking
 * someone to hit a small control beneath the artwork is what makes a game feel
 * like a form. Everything else here exists so that stays true when the artwork
 * is missing, slow, or broken.
 *
 * THE FALLBACK IS A DESIGNED STATE, NOT AN ERROR. Most of the catalogue may
 * have no verified path yet, and any path can 404 on the day. So the
 * typographic treatment is what renders by default and what an `onError`
 * collapses back to — the layout, the tap target and the legibility are
 * identical either way, and nobody ever sees a broken-image glyph.
 */

import { useState } from 'react';
import type { DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { posterFor } from '@/lib/showdown/poster';

/** Deterministic accent per title, so a fallback tile still looks composed. */
const ACCENTS = ['#38bdf8', '#f59e0b', '#a855f7', '#22c55e', '#ec4899', '#14b8a6'] as const;
function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length]!;
}

export function PosterTile({
  title,
  onPick,
  picked,
  dimmed,
  hotkey,
  disabled,
}: {
  title: DiagnosticTitle;
  onPick: () => void;
  picked: boolean;
  dimmed: boolean;
  /** Shown on pointer-capable screens only; the real control is the tile. */
  hotkey: string;
  disabled: boolean;
}) {
  const art = posterFor(title.id, 'w500');
  const [failed, setFailed] = useState(false);
  const showArt = art.url !== null && !failed;
  const accent = accentFor(title.id);

  return (
    <button
      type="button"
      data-testid={`showdown-pick-${title.id}`}
      data-title-id={title.id}
      data-has-art={showArt ? 'true' : 'false'}
      aria-label={`Choose ${title.title}, ${title.year}`}
      aria-pressed={picked}
      onClick={onPick}
      disabled={disabled}
      className={[
        'group relative flex min-h-[44px] w-full flex-col overflow-hidden rounded-2xl',
        'bg-ink-900 text-left ring-1 ring-white/10',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
        'motion-safe:transition-all motion-safe:duration-150',
        picked ? 'ring-2 ring-white scale-[0.98]' : '',
        dimmed ? 'opacity-40' : '',
      ].join(' ')}
      style={{ aspectRatio: '2 / 3' }}
    >
      {showArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art.url!}
          alt={`Poster for ${title.title}`}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(160deg, ${accent}38, rgba(9,12,22,0.96) 62%)` }}
        />
      )}

      {/* A scrim under the caption so the name is legible on any artwork. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{ background: 'linear-gradient(to top, rgba(4,7,15,0.94), transparent)' }}
      />

      <span className="relative mt-auto w-full p-3">
        <span className="block text-balance text-[1.05rem] font-black leading-[1.1] tracking-tight text-white sm:text-xl">
          {title.title}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-slate-400">{title.year}</span>
      </span>

      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-2 hidden rounded-md bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-300 sm:block"
      >
        {hotkey}
      </span>
    </button>
  );
}
