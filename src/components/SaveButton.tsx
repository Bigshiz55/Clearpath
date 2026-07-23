'use client';

import { useRef, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { addToWatchlist, removeWatchlistItem } from '@/lib/actions/watchlist';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n/I18nProvider';

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
  /** In recommendation feeds: once saved (handled), fade the card out of view. */
  removeOnSave?: boolean;
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
  removeOnSave = false,
}: Props) {
  const toast = useToast();
  const t = useT();
  const [saved, setSaved] = useState(initialSaved);
  const [itemId, setItemId] = useState<string | null>(initialItemId);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Saved in a recommendation feed = handled → fade the card out (brief beat so
  // the bookmark-fill registers first). It won't be re-recommended on reload.
  function hideCard() {
    const card = btnRef.current?.closest('.card');
    if (!(card instanceof HTMLElement)) return;
    window.setTimeout(() => {
      card.style.transition = 'opacity .3s ease, transform .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      window.setTimeout(() => { card.style.display = 'none'; }, 300);
    }, 450);
  }

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
          toast.show(t('toasts.removedFromList'), 'info');
        } else {
          toast.show(res.error ?? t('toasts.couldNotRemove'), 'error');
        }
      } else {
        const res = await addToWatchlist({ tmdbId, mediaType, title, year, posterPath, status: 'strict' });
        if (res.ok) {
          const data = res.data as { itemId: string } | undefined;
          setItemId(data?.itemId ?? null);
          setSaved(true);
          toast.show(t('toasts.savedToList'), 'success');
          onSaved?.();
          if (removeOnSave) hideCard();
        } else {
          toast.show(res.error ?? t('toasts.signInToSave'), 'error');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const icon = saved ? (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none" fill="currentColor" aria-hidden>
      <path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4-7 4V4.5A1.5 1.5 0 0 1 6.5 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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
        aria-label={saved ? t('card.savedHint') : t('card.saveHint')}
        className={`items-center gap-1.5 rounded-lg border font-semibold transition ${
          wide ? 'flex w-full justify-center px-3 py-3 text-sm' : 'inline-flex px-2.5 py-1.5 text-xs'
        } ${
          saved
            ? 'border-brand-400/50 bg-brand-500/25 text-white'
            : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
        }`}
      >
        {icon}
        {saved ? t('card.saved') : t('card.save')}
      </button>
    );
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? t('card.savedHint') : t('card.saveHint')}
      title={saved ? t('card.savedHint') : t('card.saveHint')}
      className={`flex min-w-0 items-center justify-center gap-0.5 rounded-md border text-white transition ${wide ? 'h-11 min-h-[44px] w-full flex-1 flex-col' : 'h-9 w-9'} ${
        saved
          ? 'border-brand-300 bg-brand-500'
          : 'border-brand-400/60 bg-brand-500/35 hover:bg-brand-500/60'
      }`}
    >
      {icon}
      {wide && <span className="text-[9px] font-black uppercase tracking-wide">{saved ? t('card.saved') : t('card.save')}</span>}
    </button>
  );
}
