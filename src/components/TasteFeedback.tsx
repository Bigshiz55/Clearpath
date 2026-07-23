'use client';

import { useRef, useState } from 'react';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

/**
 * 👎 "Not for me." The negative half of the card's yes/no groove: one tap records
 * a genuine negative (DNA down) and clears the card, with an Undo in the toast
 * for a mis-tap. No "why" popover — that gets captured a lighter way elsewhere.
 * Same props as before so every call site keeps working.
 */
export function TasteFeedback({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
  onFlagged,
  compact = false,
  wide = false,
  source = null,
  position = null,
  matchScore = null,
  sessionId = null,
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  onFlagged?: () => void;
  compact?: boolean;
  wide?: boolean;
  source?: string | null;
  position?: number | null;
  matchScore?: number | null;
  sessionId?: string | null;
}) {
  const toast = useToast();
  const ref = useRef<HTMLButtonElement>(null);
  const cardEl = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const [done, setDone] = useState(false);

  const ctx = { source, position, matchScore, sessionId };
  const base = { tmdbId, mediaType, title, year, posterPath };

  function fadeCard() {
    if (onFlagged) { onFlagged(); return; }
    const card = ref.current?.closest('.card') as HTMLElement | null;
    cardEl.current = card;
    if (card) {
      card.style.transition = 'opacity .3s ease, transform .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      window.setTimeout(() => { card.style.display = 'none'; }, 300);
    }
  }

  function undo() {
    const c = cardEl.current;
    if (c) { c.style.display = ''; c.style.opacity = '1'; c.style.transform = 'none'; }
    busy.current = false;
    setDone(false);
    void recordAnalyticsEvent('pass_undone', { tmdbId }).catch(() => {});
    void undoPassFeedback({ tmdbId, mediaType }).catch(() => {});
  }

  function nope(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy.current) return;
    busy.current = true;
    setDone(true);
    void recordAnalyticsEvent('dislike_thumb', { tmdbId, mediaType, ...ctx }).catch(() => {});
    // not_for_me with no reason applies a moderate title-level negative (rating 3).
    void submitPassFeedback({ ...base, feedbackType: 'not_for_me', reasonCodes: [], rating: null, ...ctx }).catch(() => {});
    toast.show('Got it — less like this ↓', 'info', { label: 'Undo', onClick: undo });
    window.setTimeout(fadeCard, 260);
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={nope}
      disabled={done}
      aria-label="Not for me"
      title="Not for me"
      className={
        compact
          ? `flex h-9 min-w-0 items-center justify-center gap-0.5 rounded-md border border-red-400/50 bg-red-500/15 text-red-200 transition hover:bg-red-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-60 ${wide ? 'w-full flex-1' : 'w-9'}`
          : `items-center gap-1 rounded-lg border border-red-400/50 bg-black/60 font-bold text-red-100 backdrop-blur transition hover:bg-red-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-60 ${wide ? 'flex w-full justify-center px-3 py-3 text-sm' : 'inline-flex px-2 py-1 text-[11px]'}`
      }
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none -scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m14 13-7.4 7.4a2.12 2.12 0 0 1-3-3L11 10" />
        <path d="m16 16 6-6" />
        <path d="m8 8 6-6" />
        <path d="m9 7 8 8" />
        <path d="m21 11-8-8" />
      </svg>
      {compact ? wide && <span className="text-[10px] font-black uppercase tracking-wide">Pass</span> : ' Not for me'}
    </button>
  );
}
