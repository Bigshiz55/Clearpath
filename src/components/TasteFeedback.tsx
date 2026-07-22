'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent, type FeedbackType } from '@/lib/actions/passFeedback';
import { reasonChipsFor, type TitleMetaLite } from '@/lib/feedback/reasons';
import type { MediaType } from '@/lib/types';

interface BarChoice { label: string; type: FeedbackType; codes: string[] }
interface Popover { left: number; top: number; lead?: string; choices: BarChoice[] }

const POP_W = 268;

/**
 * Pass control. Tapping it removes the title INSTANTLY (never a blocking modal)
 * and floats a small "Update your DNA?" popover RIGHT AT THE CARD with optional
 * one-tap, title-aware chips. Ignore it and the UI keeps moving; tap a chip and
 * it supersedes the pass with the right signal. A strong-match title adds a
 * "we're paying attention" lead (intelligent sampling).
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hiddenCard = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pop, setPop] = useState<Popover | null>(null);

  const ctx = { source, position, matchScore, sessionId };
  const base = { tmdbId, mediaType, title, year, posterPath };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function closePop() {
    if (timer.current) clearTimeout(timer.current);
    setPop(null);
  }

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

  function barChoices(meta: TitleMetaLite | null): BarChoice[] {
    const out: BarChoice[] = [{ label: 'Not tonight', type: 'not_right_now', codes: [] }];
    for (const r of reasonChipsFor(meta, 'not_for_me').filter((c) => c.code !== 'other').slice(0, 3)) {
      out.push({ label: r.label, type: 'not_for_me', codes: [r.code] });
    }
    out.push({ label: 'Seen it', type: 'seen', codes: [] });
    return out.slice(0, 5);
  }

  async function refine(type: FeedbackType, codes: string[]) {
    closePop();
    void recordAnalyticsEvent('pass_reason_chip_selected', { tmdbId, choice: type, reasons: codes });
    await submitPassFeedback({ ...base, feedbackType: type, reasonCodes: codes, rating: null, ...ctx });
  }

  async function undo() {
    closePop();
    void recordAnalyticsEvent('pass_undone', { tmdbId });
    restoreCard();
    await undoPassFeedback({ tmdbId, mediaType });
  }

  async function onPass(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Anchor the popover to the card BEFORE it fades out of the layout.
    const rect = triggerRef.current?.getBoundingClientRect();
    let left = 12;
    let top = 12;
    if (rect) {
      left = Math.max(8, Math.min(rect.right - POP_W, window.innerWidth - POP_W - 8));
      top = rect.bottom + 8;
      if (top + 170 > window.innerHeight) top = Math.max(8, rect.top - 176);
    }

    // 1) Accept the decision instantly.
    removeCard();
    void recordAnalyticsEvent('pass_completed', { tmdbId, mediaType, choice: 'removed_without_reason', ...ctx });
    void submitPassFeedback({ ...base, feedbackType: 'removed_without_reason', reasonCodes: [], rating: null, ...ctx });

    // 2) Then float the optional, title-aware "why" right where the card was.
    const meta = await fetchMeta();
    const highMatch = typeof matchScore === 'number' && matchScore >= 80;
    setPop({ left, top, lead: highMatch ? 'This was a strong match for you.' : undefined, choices: barChoices(meta) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPop(null), 7000);
  }

  return (
    <>
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

      {pop &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[120] animate-fade-up"
            style={{ left: pop.left, top: pop.top, width: POP_W }}
            role="dialog"
            aria-label="Update your DNA"
          >
            <div className="rounded-2xl border border-brand-400/50 bg-ink-850/97 p-3 shadow-2xl shadow-black/50 ring-1 ring-brand-500/20 backdrop-blur">
              <div className="text-sm font-black tracking-tight" style={{ color: '#ff2e9a' }}>
                🧬 Update your DNA?
              </div>
              {pop.lead && <div className="mt-0.5 text-[11px] font-semibold text-brand-200">{pop.lead}</div>}
              <div className="mt-0.5 text-xs text-slate-300">Passed. What made it miss?</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pop.choices.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void refine(c.type, c.codes)}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                  >
                    {c.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void undo()}
                  className="rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/10"
                >
                  Undo
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
