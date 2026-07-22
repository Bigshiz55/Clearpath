'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent, type FeedbackType } from '@/lib/actions/passFeedback';
import { reasonChipsFor, type TitleMetaLite } from '@/lib/feedback/reasons';
import type { MediaType } from '@/lib/types';

interface BarChoice { label: string; type: FeedbackType; codes: string[] }
interface Popover {
  left: number;
  top: number;
  lead?: string;
  choices: BarChoice[];
  score: number | null; // current Taste-DNA strength
  bump: { from: number | null; to: number | null } | null; // shown after a tap
}

const POP_W = 300;

async function fetchScore(): Promise<number | null> {
  try {
    const r = await fetch('/api/dna-score', { cache: 'no-store' });
    const d = await r.json();
    return typeof d.score === 'number' ? d.score : null;
  } catch {
    return null;
  }
}

/**
 * Pass control. Tapping removes the title INSTANTLY (never a blocking modal) and
 * floats a bold "Update your DNA?" popover OFF TO THE SIDE of the card, showing
 * your live Taste-DNA score so each tap visibly nudges it up. Contextual one-tap
 * chips are optional; ignore them and the UI just keeps moving.
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
    if (timer.current) clearTimeout(timer.current);
    const from = pop?.score ?? null;
    void recordAnalyticsEvent('pass_reason_chip_selected', { tmdbId, choice: type, reasons: codes });
    await submitPassFeedback({ ...base, feedbackType: type, reasonCodes: codes, rating: null, ...ctx });
    const to = await fetchScore();
    setPop((p) => (p ? { ...p, bump: { from, to } } : p));
    timer.current = setTimeout(() => setPop(null), 1900);
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

    // Anchor OFF TO THE SIDE of the card (right, or flip left near the edge).
    const card = triggerRef.current?.closest('.card') as HTMLElement | null;
    const rect = (card ?? triggerRef.current)?.getBoundingClientRect();
    let left = 12;
    let top = 12;
    if (rect) {
      left = rect.right + 10;
      if (left + POP_W > window.innerWidth - 8) left = rect.left - POP_W - 10; // flip to the left
      left = Math.max(8, Math.min(left, window.innerWidth - POP_W - 8));
      top = Math.max(8, Math.min(rect.top + 6, window.innerHeight - 210));
    }

    // 1) Accept the decision instantly.
    removeCard();
    void recordAnalyticsEvent('pass_completed', { tmdbId, mediaType, choice: 'removed_without_reason', ...ctx });
    void submitPassFeedback({ ...base, feedbackType: 'removed_without_reason', reasonCodes: [], rating: null, ...ctx });

    // 2) Float the optional, title-aware "why" beside the card, with the DNA score.
    const [meta, score] = await Promise.all([fetchMeta(), fetchScore()]);
    const highMatch = typeof matchScore === 'number' && matchScore >= 80;
    setPop({ left, top, lead: highMatch ? 'This was a strong match for you.' : undefined, choices: barChoices(meta), score, bump: null });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPop(null), 8000);
  }

  const up = pop?.bump && pop.bump.to != null && pop.bump.from != null && pop.bump.to > pop.bump.from;

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
            <div className="rounded-2xl border-2 border-brand-400/60 bg-ink-850/98 p-3.5 shadow-2xl shadow-black/60 ring-2 ring-brand-500/25 backdrop-blur">
              {/* Header + live DNA score */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-black tracking-tight" style={{ color: '#ff2e9a' }}>🧬 Update your DNA?</div>
                {pop.score != null && !pop.bump && (
                  <span className="rounded-lg bg-white/10 px-2 py-0.5 text-xs font-black tabular-nums text-white">{pop.score}</span>
                )}
              </div>

              {pop.bump ? (
                <div className="mt-2 flex flex-col items-center py-2 text-center">
                  <div className="flex items-baseline gap-2 text-white">
                    <span className="text-lg font-black tabular-nums text-slate-400">{pop.bump.from ?? '—'}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-3xl font-black tabular-nums" style={{ color: '#ff2e9a' }}>{pop.bump.to ?? '—'}</span>
                    {up && <span className="text-emerald-300">↑</span>}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-emerald-200">{up ? 'Your DNA got sharper 🧬' : 'Logged — thanks 🧬'}</div>
                </div>
              ) : (
                <>
                  {pop.lead && <div className="mt-0.5 text-[11px] font-semibold text-brand-200">{pop.lead}</div>}
                  <div className="mt-0.5 text-xs text-slate-300">Passed. What made it miss?</div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {pop.choices.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => void refine(c.type, c.codes)}
                        className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                      >
                        {c.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void undo()}
                      className="rounded-full border border-white/25 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
                    >
                      Undo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
