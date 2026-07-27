'use client';

import { useRef, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { addToWatchlist, removeWatchlistItem } from '@/lib/actions/watchlist';
import { useToast } from '@/components/Toast';

interface Props {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  initialSaved?: boolean;
  initialItemId?: string | null;
  /** 'overlay' = compact icon for poster corners; 'inline' = icon + label. */
  variant?: 'overlay' | 'inline';
  /** Overlay variant only: grow to fill its flex track instead of a fixed square. */
  wide?: boolean;
  /** Fires after a successful add — lets a list make room / advance. */
  onSaved?: () => void;
}

export function SaveButton({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
  initialSaved = false,
  initialItemId = null,
  variant = 'overlay',
  wide = false,
  onSaved,
}: Props) {
  const toast = useToast();
  const [saved, setSaved] = useState(initialSaved);
  const [itemId, setItemId] = useState<string | null>(initialItemId);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // THE CARD STAYS. Saving used to fade the placard out and `display: none` it,
  // which collapsed its cell and pushed every card after it up a slot — the
  // grid rearranged itself while you were still reading it.
  //
  // Nothing was gained by removing it, either: the button already shows a
  // filled bookmark and the word "Saved", and tapping it again takes the title
  // back off the list. That is the undo, and it only exists while the card is
  // still on screen. Handled titles are filtered out of the picks server-side,
  // so it is gone on the next load without the grid jumping on this one.

  async function toggle(e: React.MouseEvent) {
    // These buttons usually sit inside a card <Link>; don't navigate on click.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (saved && itemId) {
        const res = await removeWatchlistItem(itemId);
        if (res.ok) {
          setSaved(false);
          setItemId(null);
          toast.show('Removed from your list.', 'info');
        } else {
          toast.show(res.error ?? 'Could not remove.', 'error');
        }
      } else {
        const res = await addToWatchlist({ tmdbId, mediaType, title, year, posterPath, status: 'strict' });
        if (res.ok) {
          const data = res.data as { itemId: string } | undefined;
          setItemId(data?.itemId ?? null);
          setSaved(true);
          toast.show('Added to your list.', 'success');
          onSaved?.();
        } else {
          toast.show(res.error ?? 'Sign in to save to your list.', 'error');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const icon = saved ? (
    <svg viewBox="0 0 24 24" className="wv-act-icon h-3.5 w-3.5 flex-none" fill="currentColor" aria-hidden>
      <path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4-7 4V4.5A1.5 1.5 0 0 1 6.5 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="wv-act-icon h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );

  if (variant === 'inline') {
    return (
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={saved ? 'Saved — remove from your list' : 'Save'}
        className={`items-center gap-1.5 rounded-lg border font-semibold transition ${
          wide ? 'flex w-full justify-center px-3 py-3 text-sm' : 'inline-flex px-2.5 py-1.5 text-xs'
        } ${
          saved
            ? 'border-brand-400/50 bg-brand-500/25 text-white'
            : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
        }`}
      >
        {icon}
        {saved ? 'Saved' : 'Save'}
      </button>
    );
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? 'Saved — remove from your list' : 'Save'}
      title={saved ? 'Saved — tap to remove' : 'Save'}
      className={`wv-act flex min-w-0 items-center justify-center gap-0.5 rounded-lg border font-semibold text-white transition ${wide ? 'w-full flex-1' : 'w-11'} ${
        saved
          ? 'border-pink-200/70 bg-gradient-to-b from-[#ff62b6] to-[#ff1493]'
          : 'border-2 border-[#ff1493]/70 bg-[#ff1493]/30 text-pink-50 hover:bg-[#ff1493]/45 hover:text-white'
      }`}
    >
      {icon}
      {wide && <span className="wv-act-label whitespace-nowrap font-black uppercase tracking-wide">{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
