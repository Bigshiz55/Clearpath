'use client';

import { useRef } from 'react';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent, type FeedbackType } from '@/lib/actions/passFeedback';
import { reasonChipsFor, type TitleMetaLite } from '@/lib/feedback/reasons';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

interface BarChoice { label: string; type: FeedbackType; codes: string[] }

/**
 * Pass control. Tapping it removes the title INSTANTLY (never a blocking modal),
 * captures the decision, and then floats a small optional "what made it miss?"
 * bar with contextual one-tap chips. Users who just want it gone are never
 * interrupted; those willing to say why get a quick, title-aware option — and
 * with a strong-match title we add a light "we're paying attention" lead.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hiddenCard = useRef<HTMLElement | null>(null);

  const ctx = { source, position, matchScore, sessionId };
  const base = { tmdbId, mediaType, title, year, posterPath };

  function removeCard() {
    if (onFlagged) { onFlagged(); return; }
    const card = triggerRef.current?.closest('.card');
    if (card instanceof HTMLElement) {
      hiddenCard.current = card;
      card.style.transition = 'opacity .3s ease, transform .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      window.setTimeout(() => { if (hiddenCard.current === card) card.style.display = 'none'; }, 300);
    }
  }
  function restoreCard() {
    const card = hiddenCard.current;
    if (card) {
      card.style.display = '';
      card.style.opacity = '1';
      card.style.transform = 'none';
      hiddenCard.current = null;
    }
  }

  async function fetchMeta(): Promise<TitleMetaLite | null> {
    try {
      const r = await fetch(`/api/title-meta?type=${mediaType}&id=${tmdbId}`);
      const d = await r.json();
      return (d.meta as TitleMetaLite) ?? null;
    } catch {
      return null;
    }
  }

  /** Contextual one-tap options: "Not tonight" + up to 3 title-aware reasons + "Seen it". */
  function barChoices(meta: TitleMetaLite | null): BarChoice[] {
    const out: BarChoice[] = [{ label: 'Not tonight', type: 'not_right_now', codes: [] }];
    for (const r of reasonChipsFor(meta, 'not_for_me').filter((c) => c.code !== 'other').slice(0, 3)) {
      out.push({ label: r.label, type: 'not_for_me', codes: [r.code] });
    }
    out.push({ label: 'Seen it', type: 'seen', codes: [] });
    return out.slice(0, 5);
  }

  async function refine(type: FeedbackType, codes: string[]) {
    void recordAnalyticsEvent('pass_reason_chip_selected', { tmdbId, choice: type, reasons: codes });
    await submitPassFeedback({ ...base, feedbackType: type, reasonCodes: codes, rating: null, ...ctx });
  }

  async function undo() {
    void recordAnalyticsEvent('pass_undone', { tmdbId });
    restoreCard();
    await undoPassFeedback({ tmdbId, mediaType });
  }

  async function onPass(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // 1) Accept the decision instantly.
    removeCard();
    void recordAnalyticsEvent('pass_completed', { tmdbId, mediaType, choice: 'removed_without_reason', ...ctx });
    void submitPassFeedback({ ...base, feedbackType: 'removed_without_reason', reasonCodes: [], rating: null, ...ctx });
    // 2) Then make the "why" effortless and optional.
    const meta = await fetchMeta();
    const highMatch = typeof matchScore === 'number' && matchScore >= 80;
    toast.bar({
      lead: highMatch ? 'This scored a strong match for you — what made it miss?' : undefined,
      message: 'Passed. What made it miss?',
      chips: [
        ...barChoices(meta).map((c) => ({ label: c.label, onClick: () => void refine(c.type, c.codes) })),
        { label: 'Undo', tone: 'undo' as const, onClick: () => void undo() },
      ],
    });
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onPass}
      aria-label="Pass on this title"
      title="Pass on this title"
      className={
        compact
          ? `grid h-7 place-items-center rounded-md border border-red-400/50 bg-red-500/15 text-red-200 transition hover:bg-red-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${wide ? 'w-full flex-1' : 'w-7'}`
          : `items-center gap-1 rounded-lg border border-red-400/50 bg-black/60 font-bold text-red-100 backdrop-blur transition hover:bg-red-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${wide ? 'flex w-full justify-center px-3 py-3 text-sm' : 'inline-flex px-2 py-1 text-[11px]'}`
      }
    >
      <span aria-hidden className="grid place-items-center">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
      {!compact && ' Pass'}
    </button>
  );
}
