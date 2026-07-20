'use client';

import { useState } from 'react';
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
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4-7 4V4.5A1.5 1.5 0 0 1 6.5 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={saved ? 'Remove from list' : 'Add to list'}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
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
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? 'Remove from list' : 'Add to list'}
      title={saved ? 'Remove from your list' : 'Add to your list'}
      className={`grid h-7 place-items-center rounded-md border text-white transition ${wide ? 'w-full flex-1' : 'w-7'} ${
        saved
          ? 'border-brand-300 bg-brand-500'
          : 'border-brand-400/60 bg-brand-500/35 hover:bg-brand-500/60'
      }`}
    >
      {icon}
    </button>
  );
}
