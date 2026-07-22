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
  width: number;
  lead?: string;
  choices: BarChoice[];
  score: number | null;
  bump: { from: number | null; to: number | null } | null;
}

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
 * Pass control. Tapping fades the title out (never a blocking modal) and floats
 * a compact, SOLID "Update your DNA?" popover within the passed card's own slot
 * (its space is held open so the popover never drifts onto a neighbor), showing
 * your live Taste-DNA score so each optional reason visibly nudges it up.
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
  const fadedCard = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pop, setPop] = useState<Popover | null>(null);

  const ctx = { source, position, matchScore, sessionId };
  const base = { tmdbId, mediaType, title, year, posterPath };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Fade the card but KEEP its space while the popover is open, so the popover
  // stays over its own slot instead of the neighbour that would slide in.
  function fadeCard() {
    const card = triggerRef.current?.closest('.card');
    if (card instanceof HTMLElement) {
      fadedCard.current = card;
      card.style.transition = 'opacity .25s ease';
      card.style.opacity = '0';
      card.style.pointerEvents = 'none';
    }
  }
  function finalizeRemove() {
    if (onFlagged) { onFlagged(); fadedCard.current = null; return; }
    const card = fadedCard.current;
    if (card) { card.style.display = 'none'; fadedCard.current = null; }
  }
  function restoreCard() {
    const card = fadedCard.current;
    if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; fadedCard.current = null; }
  }

  function dismiss(remove: boolean) {
    if (timer.current) clearTimeout(timer.current);
    if (remove) finalizeRemove();
    setPop(null);
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
    for (const r of reasonChipsFor(meta, 'not_for_me').filter((c) => c.code !== 'other').slice(0, 2)) {
      out.push({ label: r.label, type: 'not_for_me', codes: [r.code] });
    }
    out.push({ label: 'Seen it', type: 'seen', codes: [] });
    return out;
  }

  async function refine(type: FeedbackType, codes: string[]) {
    if (timer.current) clearTimeout(timer.current);
    const from = pop?.score ?? null;
    void recordAnalyticsEvent('pass_reason_chip_selected', { tmdbId, choice: type, reasons: codes }).catch(() => {});
    // A server-action failure must never crash the page — swallow it here.
    try {
      await submitPassFeedback({ ...base, feedbackType: type, reasonCodes: codes, rating: null, ...ctx });
    } catch {
      /* keep the UI moving */
    }
    finalizeRemove();
    const to = await fetchScore();
    setPop((p) => (p ? { ...p, bump: { from, to } } : p));
    timer.current = setTimeout(() => setPop(null), 1800);
  }

  async function undo() {
    if (timer.current) clearTimeout(timer.current);
    void recordAnalyticsEvent('pass_undone', { tmdbId }).catch(() => {});
    restoreCard();
    setPop(null);
    try {
      await undoPassFeedback({ tmdbId, mediaType });
    } catch {
      /* best-effort */
    }
  }

  async function onPass(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Sit within the card's own footprint (its space is held open below).
    const card = triggerRef.current?.closest('.card') as HTMLElement | null;
    const rect = (card ?? triggerRef.current)?.getBoundingClientRect();
    let left = 12;
    let top = 12;
    let width = 260;
    if (rect) {
      width = Math.round(Math.min(300, Math.max(216, rect.width - 8)));
      left = Math.round(Math.max(8, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 8)));
      top = Math.round(Math.max(8, Math.min(rect.top + 8, window.innerHeight - 250)));
    }

    fadeCard();
    void recordAnalyticsEvent('pass_completed', { tmdbId, mediaType, choice: 'removed_without_reason', ...ctx }).catch(() => {});
    void submitPassFeedback({ ...base, feedbackType: 'removed_without_reason', reasonCodes: [], rating: null, ...ctx }).catch(() => {});

    const [meta, score] = await Promise.all([fetchMeta(), fetchScore()]);
    const highMatch = typeof matchScore === 'number' && matchScore >= 80;
    setPop({ left, top, width, lead: highMatch ? 'This was a strong match for you.' : undefined, choices: barChoices(meta), score, bump: null });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => dismiss(true), 8000);
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
          <div className="fixed z-[120] animate-fade-up" style={{ left: pop.left, top: pop.top, width: pop.width }} role="dialog" aria-label="Update your DNA">
            {/* Fully opaque so the poster never bleeds through. */}
            <div className="rounded-xl border-2 border-brand-400/70 bg-ink-900 p-3 shadow-2xl shadow-black/70 ring-1 ring-brand-500/30">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-black tracking-tight" style={{ color: '#ff2e9a' }}>🧬 Update your DNA?</div>
                {pop.score != null && !pop.bump && (
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{pop.score}</span>
                )}
              </div>

              {pop.bump ? (
                <div className="flex flex-col items-center py-2 text-center">
                  <div className="flex items-baseline gap-1.5 text-white">
                    <span className="text-base font-black tabular-nums text-slate-400">{pop.bump.from ?? '—'}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-2xl font-black tabular-nums" style={{ color: '#ff2e9a' }}>{pop.bump.to ?? '—'}</span>
                    {up && <span className="text-emerald-300">↑</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-emerald-200">{up ? 'DNA got sharper 🧬' : 'Logged — thanks 🧬'}</div>
                </div>
              ) : (
                <>
                  {pop.lead && <div className="mt-0.5 text-[11px] font-semibold text-brand-200">{pop.lead}</div>}
                  <div className="mt-0.5 text-[11px] text-slate-400">Passed. What made it miss?</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pop.choices.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => void refine(c.type, c.codes)}
                        className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/12"
                      >
                        {c.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void undo()}
                      className="rounded-full border border-white/25 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-white/10"
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
