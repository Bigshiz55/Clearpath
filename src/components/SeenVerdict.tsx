'use client';

import { useRef, useState } from 'react';
import { submitPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

/** Glasses — the "you've seen this one" mark. Stroked, inherits currentColor. */
function Glasses({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="15" r="4" />
      <circle cx="18" cy="15" r="4" />
      <path d="M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2" />
      <path d="M21.5 13 19 7c-.7-1.3-1.5-2-3-2" />
    </svg>
  );
}
function ArrowUp({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V6M6 12l6-6 6 6" />
    </svg>
  );
}
function ArrowDown({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v13M6 12l6 6 6-6" />
    </svg>
  );
}

/**
 * The two "I've seen this" verdicts. They sit in the card's top button row (same
 * size as Save / Pass) so nothing covers the poster: glasses = "seen it," the
 * arrow says which way — up ("liked it") or down ("didn't like it"). Both remove
 * the card; up feeds the DNA a genuine positive rating, down a genuine negative,
 * so an already-watched title still teaches taste instead of cluttering the grid.
 */
export function SeenVerdict({
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
  const firstRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [done, setDone] = useState(false);

  function fadeCard() {
    if (onFlagged) { onFlagged(); return; }
    const card = firstRef.current?.closest('.card') as HTMLElement | null;
    if (card) {
      card.style.transition = 'opacity .3s ease, transform .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      window.setTimeout(() => { card.style.display = 'none'; }, 300);
    }
  }

  function verdict(kind: 'liked' | 'disliked') {
    if (busy.current) return;
    busy.current = true;
    setDone(true);
    const ctx = { source, position, matchScore, sessionId };
    const base = { tmdbId, mediaType, title, year, posterPath };
    void recordAnalyticsEvent('seen_verdict', { tmdbId, mediaType, kind, ...ctx }).catch(() => {});
    // liked → seen + a real positive rating (DNA up). disliked → they watched it
    // and it missed (didnt_like carries its own strong negative rating).
    void submitPassFeedback(
      kind === 'liked'
        ? { ...base, feedbackType: 'seen', reasonCodes: [], rating: 8, ...ctx }
        : { ...base, feedbackType: 'didnt_like', reasonCodes: [], rating: null, ...ctx },
    ).catch(() => {});
    toast.show(kind === 'liked' ? '⚡ Seen it — liked. DNA boosted ↑' : 'Got it — seen it, not for you.', kind === 'liked' ? 'success' : 'info');
    window.setTimeout(fadeCard, 260);
  }

  return (
    <>
      <button
        ref={firstRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); verdict('liked'); }}
        disabled={done}
        aria-label="Seen it — liked it"
        title="Seen it — liked it"
        className="relative grid h-9 w-full flex-1 place-items-center rounded-md border border-emerald-400/50 bg-emerald-500/15 text-emerald-100 transition hover:bg-emerald-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60"
      >
        <Glasses className="h-5 w-5" />
        <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white ring-1 ring-ink-900">
          <ArrowUp className="h-2.5 w-2.5" />
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); verdict('disliked'); }}
        disabled={done}
        aria-label="Seen it — did not like it"
        title="Seen it — did not like it"
        className="relative grid h-9 w-full flex-1 place-items-center rounded-md border border-red-400/50 bg-red-500/15 text-red-100 transition hover:bg-red-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-60"
      >
        <Glasses className="h-5 w-5" />
        <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-white ring-1 ring-ink-900">
          <ArrowDown className="h-2.5 w-2.5" />
        </span>
      </button>
    </>
  );
}
