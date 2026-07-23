'use client';

import { useRef, useState } from 'react';
import { submitPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { DnaBurst } from '@/components/DnaBurst';
import type { MediaType } from '@/lib/types';

async function fetchDnaScore(): Promise<number | null> {
  try {
    const r = await fetch('/api/dna-score', { cache: 'no-store' });
    const d = await r.json();
    return typeof d.score === 'number' ? d.score : null;
  } catch {
    return null;
  }
}

/**
 * 👍 "More like this." A single positive verdict in the card's action row. On tap
 * it feeds the Taste-DNA a genuine positive rating and pops the DNA-recalculating
 * burst right in the center of the card, then clears it.
 */
export function LikeButton({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
  onFlagged,
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
  source?: string | null;
  position?: number | null;
  matchScore?: number | null;
  sessionId?: string | null;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState<{ cx: number; cy: number } | null>(null);
  const [score, setScore] = useState<number | null>(null);

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

  function like(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy.current) return;
    busy.current = true;
    setDone(true);
    const ctx = { source, position, matchScore, sessionId };
    const base = { tmdbId, mediaType, title, year, posterPath };
    const rect = (ref.current?.closest('.card') as HTMLElement | null)?.getBoundingClientRect();
    if (rect) setBurst({ cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    else window.setTimeout(fadeCard, 300);
    void recordAnalyticsEvent('like_thumb', { tmdbId, mediaType, ...ctx }).catch(() => {});
    // A real positive rating (marks watched) so the DNA moves up right away.
    void submitPassFeedback({ ...base, feedbackType: 'seen', reasonCodes: [], rating: 8, ...ctx }).catch(() => {});
    void fetchDnaScore().then((s) => setScore(s));
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={like}
        disabled={done}
        aria-label="For it — more like this"
        title="For it — more like this"
        className="flex h-9 w-full min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-emerald-400/50 bg-emerald-500/15 text-emerald-100 transition hover:bg-emerald-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m14 13-7.4 7.4a2.12 2.12 0 0 1-3-3L11 10" />
          <path d="m16 16 6-6" />
          <path d="m8 8 6-6" />
          <path d="m9 7 8 8" />
          <path d="m21 11-8-8" />
        </svg>
        <span className="text-[10px] font-black uppercase tracking-wide">For</span>
      </button>
      {burst && <DnaBurst cx={burst.cx} cy={burst.cy} kind="up" target={score} onDone={() => { fadeCard(); setBurst(null); }} />}
    </>
  );
}
