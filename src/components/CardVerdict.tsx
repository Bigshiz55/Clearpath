'use client';

import { useRef, useState } from 'react';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { DnaBurst } from '@/components/DnaBurst';
import { nextRuling, isUndo, rulingFeedback, rulingAria, ruledMessage, RULING_LABEL, type Ruling } from '@/lib/verdict/cardRuling';
import type { MediaType } from '@/lib/types';

/**
 * FOR / AGAINST — the card's verdict pair, ruled IN PLACE.
 *
 * These were two independent buttons that each faded the whole card out and
 * `display: none`'d it. Two consequences, one cause:
 *
 *   • The grid resequenced. Removing a cell collapses the hole, so every card
 *     after it jumped up a slot while you were still looking at them.
 *   • There was no undo, because there was nothing left to undo with.
 *
 * Now one component owns the ruling for a card, so the two buttons can agree on
 * what it is, the card keeps its slot, and the decision is reversible: tap the
 * active side again, or use Undo. The state machine is in `verdict/cardRuling`.
 *
 * The card still will not reappear on the next load — the server filters
 * handled titles out of the picks — which is the right split. Within a session
 * a ruling is a decision you can revisit; between sessions it is something you
 * told the recommender.
 */
export function CardVerdict({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
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
  source?: string | null;
  position?: number | null;
  matchScore?: number | null;
  sessionId?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ruling, setRuling] = useState<Ruling | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState<{ cx: number; cy: number; kind: 'up' | 'down' } | null>(null);

  const ctx = { source, position, matchScore, sessionId };
  const base = { tmdbId, mediaType, title, year, posterPath };

  async function tap(side: Ruling) {
    if (busy) return;
    const next = nextRuling(ruling, side);
    const undoing = isUndo(ruling, side);
    setBusy(true);
    // Optimistic: the card must respond on the tap, not after a round trip.
    setRuling(next);

    if (!undoing && next) {
      const rect = ref.current?.closest('.card')?.getBoundingClientRect();
      if (rect) setBurst({ cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, kind: next === 'for' ? 'up' : 'down' });
    }

    try {
      if (undoing) {
        await undoPassFeedback({ tmdbId, mediaType });
        void recordAnalyticsEvent('verdict_undo', { tmdbId, mediaType, ...ctx }).catch(() => {});
      } else if (next) {
        const { feedbackType, rating, event } = rulingFeedback(next);
        void recordAnalyticsEvent(event, { tmdbId, mediaType, ...ctx }).catch(() => {});
        await submitPassFeedback({ ...base, feedbackType, reasonCodes: [], rating, ...ctx });
      }
    } catch {
      // The write failed, so the card must not keep claiming it succeeded.
      setRuling(ruling);
    } finally {
      setBusy(false);
    }
  }

  const status = ruledMessage(ruling);

  const button = (side: Ruling) => {
    const active = ruling === side;
    const tone =
      side === 'for'
        ? active
          ? 'border-emerald-300 bg-emerald-500/60 text-white'
          : 'border-emerald-400/70 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/40 hover:text-white'
        : active
          ? 'border-red-300 bg-red-500/60 text-white'
          : 'border-red-400/70 bg-red-500/25 text-red-100 hover:bg-red-500/40 hover:text-white';
    return (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void tap(side); }}
        aria-pressed={active}
        aria-label={rulingAria(side, ruling)}
        title={rulingAria(side, ruling)}
        data-testid={`card-verdict-${side}`}
        data-active={active ? 'true' : 'false'}
        disabled={busy}
        className={`flex min-h-[44px] w-full min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-70 ${tone}`}
      >
        {/* THE ICON IS THE UNDO AFFORDANCE, and swapping it costs no layout.
            A ruled card must not change size. A status line under the row was
            the obvious place to put "Undo", and it added 42px — which pushed
            every card below it down the page. That is the same "everything
            moved" complaint one step smaller, so the ruling is carried entirely
            by the fill and the glyph: a gavel while it is a choice, a return
            arrow once it is a decision you can take back. Same box, same word,
            same width, either way. */}
        {active ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 flex-none ${side === 'against' ? '-scale-x-100' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m14 13-7.4 7.4a2.12 2.12 0 0 1-3-3L11 10" />
            <path d="m16 16 6-6" />
            <path d="m8 8 6-6" />
            <path d="m9 7 8 8" />
            <path d="m21 11-8-8" />
          </svg>
        )}
        <span className="whitespace-nowrap text-[11px] font-black uppercase tracking-wide">{RULING_LABEL[side]}</span>
      </button>
    );
  };

  return (
    <div ref={ref} className="contents">
      {button('for')}
      {button('against')}
      {/* The ruling in words, for assistive tech only. Sighted users read it
          off the filled button; rendering it as a visible line would change the
          card's height, which is the whole thing being fixed here. The undo
          control is the ruled button itself — see rulingAria. */}
      <span className="sr-only" role="status" data-testid="card-verdict-status">{status ?? ''}</span>
      {burst && <DnaBurst cx={burst.cx} cy={burst.cy} kind={burst.kind} onDone={() => setBurst(null)} />}
    </div>
  );
}
