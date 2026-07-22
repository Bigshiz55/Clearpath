'use client';

import { useRef, useState } from 'react';
import { submitPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

/**
 * 👍 "More like this." A single positive verdict that sits in the card's action
 * row (same size as Pass / Save): it feeds the Taste-DNA a genuine positive
 * rating and clears the card. Direction is all the DNA needs — a thumbs-up here
 * counts the same whether you've seen it or just know it's your kind of thing.
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
  const toast = useToast();
  const ref = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [done, setDone] = useState(false);

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
    void recordAnalyticsEvent('like_thumb', { tmdbId, mediaType, ...ctx }).catch(() => {});
    // A real positive rating (marks watched) so the DNA moves up right away.
    void submitPassFeedback({ ...base, feedbackType: 'seen', reasonCodes: [], rating: 8, ...ctx }).catch(() => {});
    toast.show('⚡ DNA boosted — more like this ↑', 'success');
    window.setTimeout(fadeCard, 260);
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={like}
      disabled={done}
      aria-label="I like this — more like it"
      title="I like this — more like it"
      className="grid h-9 w-full flex-1 place-items-center rounded-md border border-emerald-400/50 bg-emerald-500/15 text-emerald-100 transition hover:bg-emerald-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </svg>
    </button>
  );
}
