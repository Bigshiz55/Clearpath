'use client';

import { useRef, useState } from 'react';
import { submitPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
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
 * The two "I've seen this" verdicts that ride on TOP of the poster: the glasses
 * say "seen it," and the arrow says which way — up ("liked it") or down ("didn't
 * like it"). Both remove the card; up feeds the DNA a genuine positive rating,
 * down a genuine negative — so an already-watched title still teaches taste
 * instead of just cluttering the picks. Hover shows the plain-English label.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [done, setDone] = useState<null | 'liked' | 'disliked'>(null);

  function fadeCard() {
    if (onFlagged) { onFlagged(); return; }
    const card = rootRef.current?.closest('.card') as HTMLElement | null;
    if (card) {
      card.style.transition = 'opacity .3s ease, transform .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      window.setTimeout(() => { card.style.display = 'none'; }, 300);
    }
  }

  async function verdict(kind: 'liked' | 'disliked') {
    if (busy.current || done) return;
    busy.current = true;
    setDone(kind);
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
    window.setTimeout(fadeCard, 850);
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute left-0 top-0 z-20 flex items-center gap-1.5 p-1.5">
      {done ? (
        <span
          className={`pointer-events-none inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black shadow-lg ${
            done === 'liked' ? 'bg-emerald-500/95 text-white' : 'bg-red-500/95 text-white'
          }`}
        >
          <Glasses className="h-3.5 w-3.5" />
          {done === 'liked' ? 'Seen it — liked' : 'Seen it — not for you'}
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void verdict('liked'); }}
            aria-label="Seen it — liked it"
            title="Seen it — liked it"
            className="pointer-events-auto relative grid h-9 w-9 place-items-center rounded-lg border border-emerald-400/50 bg-black/55 text-emerald-100 backdrop-blur transition hover:bg-emerald-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            <Glasses className="h-5 w-5" />
            <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-ink-900">
              <ArrowUp className="h-2.5 w-2.5" />
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void verdict('disliked'); }}
            aria-label="Seen it — did not like it"
            title="Seen it — did not like it"
            className="pointer-events-auto relative grid h-9 w-9 place-items-center rounded-lg border border-red-400/50 bg-black/55 text-red-100 backdrop-blur transition hover:bg-red-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            <Glasses className="h-5 w-5" />
            <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-white ring-2 ring-ink-900">
              <ArrowDown className="h-2.5 w-2.5" />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
