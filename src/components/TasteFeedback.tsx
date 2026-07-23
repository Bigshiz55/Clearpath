'use client';

import { useRef, useState } from 'react';
import { submitPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { DnaBurst } from '@/components/DnaBurst';
import { useT } from '@/i18n/I18nProvider';
import type { MediaType } from '@/lib/types';

/**
 * 👎 "Not for me." The negative half of the card's yes/no groove: one tap records
 * a genuine negative and pops the DNA-recalculating burst in the center of the
 * card, then clears it. Same props as before so every call site keeps working.
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
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState<{ cx: number; cy: number } | null>(null);

  const ctx = { source, position, matchScore, sessionId };
  const base = { tmdbId, mediaType, title, year, posterPath };

  function fadeCard() {
    if (onFlagged) { onFlagged(); return; }
    const card = ref.current?.closest('.card') as HTMLElement | null;
    if (card) {
      card.style.transition = 'opacity .3s ease, transform .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      window.setTimeout(() => { card.style.display = 'none'; }, 300);
    }
  }

  function nope(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy.current) return;
    busy.current = true;
    setDone(true);
    const rect = (ref.current?.closest('.card') as HTMLElement | null)?.getBoundingClientRect();
    if (rect) setBurst({ cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    else window.setTimeout(fadeCard, 300);
    void recordAnalyticsEvent('dislike_thumb', { tmdbId, mediaType, ...ctx }).catch(() => {});
    // not_for_me with no reason applies a moderate title-level negative (rating 3).
    void submitPassFeedback({ ...base, feedbackType: 'not_for_me', reasonCodes: [], rating: null, ...ctx }).catch(() => {});
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={nope}
        disabled={done}
        aria-label={t('card.passHint')}
        title={t('card.passHint')}
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
        {compact ? wide && <span className="text-[10px] font-black uppercase tracking-wide">{t('card.pass')}</span> : ` ${t('card.passHint')}`}
      </button>
      {burst && <DnaBurst cx={burst.cx} cy={burst.cy} kind="down" onDone={() => { fadeCard(); setBurst(null); }} />}
    </>
  );
}
