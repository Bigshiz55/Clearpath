'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { reasonChipsFor, passHeadingFor, universalCategoriesFor, type TitleMetaLite } from '@/lib/feedback/reasons';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

interface Chip { code: string; label: string }
interface Popover {
  left: number;
  top: number;
  width: number;
  heading: string;
  chips: Chip[];
}

/**
 * Pass control. Tapping records the decision and floats a compact "why it missed"
 * box ON TOP of the card. Pick ONE primary reason and it applies instantly — the
 * box closes and the card leaves the grid the moment you tap, with a quick DNA
 * toast. Ignore it and it fades on its own; Undo puts the card back.
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
  const cardRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pop, setPop] = useState<Popover | null>(null);

  const ctx = { source, position, matchScore, sessionId };
  const base = { tmdbId, mediaType, title, year, posterPath };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function removeCardWithFade() {
    if (onFlagged) { onFlagged(); cardRef.current = null; return; }
    const c = cardRef.current;
    if (c) {
      c.style.transition = 'opacity .3s ease, transform .3s ease';
      c.style.opacity = '0';
      c.style.transform = 'scale(0.96)';
      window.setTimeout(() => { c.style.display = 'none'; }, 300);
      cardRef.current = null;
    }
  }

  function close(remove: boolean) {
    if (timer.current) clearTimeout(timer.current);
    if (remove) removeCardWithFade();
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

  // Pick a primary reason → apply it and clear the card immediately.
  function apply(codes: string[]) {
    void recordAnalyticsEvent('pass_reason_chip_selected', { tmdbId, choice: 'not_for_me', reasons: codes, categories: universalCategoriesFor(codes) }).catch(() => {});
    void submitPassFeedback({ ...base, feedbackType: 'not_for_me', reasonCodes: codes, rating: null, ...ctx }).catch(() => {});
    toast.show('⚡ DNA boosted — less like this.', 'success');
    close(true);
  }

  async function undo() {
    if (timer.current) clearTimeout(timer.current);
    cardRef.current = null;
    setPop(null);
    void recordAnalyticsEvent('pass_undone', { tmdbId }).catch(() => {});
    try {
      await undoPassFeedback({ tmdbId, mediaType });
    } catch {
      /* best-effort */
    }
  }

  async function onPass(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const card = triggerRef.current?.closest('.card') as HTMLElement | null;
    cardRef.current = card;
    const rect = (card ?? triggerRef.current)?.getBoundingClientRect();
    let left = 12;
    let top = 12;
    let width = 288;
    if (rect) {
      width = Math.round(Math.min(320, Math.max(240, rect.width - 8)));
      left = Math.round(Math.max(8, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 8)));
      top = Math.round(Math.max(8, Math.min(rect.top + 8, window.innerHeight - 300)));
    }

    // Record the bare pass (fully caught so a failed action can never crash).
    void recordAnalyticsEvent('pass_completed', { tmdbId, mediaType, choice: 'removed_without_reason', ...ctx }).catch(() => {});
    void submitPassFeedback({ ...base, feedbackType: 'removed_without_reason', reasonCodes: [], rating: null, ...ctx }).catch(() => {});

    const meta = await fetchMeta();
    // Six reasons, spread ACROSS categories — no four flavors of "too long".
    const raw = reasonChipsFor(meta, 'not_for_me', 14).filter((c) => c.code !== 'other');
    const seenCat = new Set<string>();
    const chips: Chip[] = [];
    for (const c of raw) {
      if (chips.length >= 6) break;
      if (seenCat.has(c.category)) continue;
      seenCat.add(c.category);
      chips.push({ code: c.code, label: c.label });
    }
    for (const c of raw) { // top up if a title has few distinct categories
      if (chips.length >= 6) break;
      if (!chips.some((x) => x.code === c.code)) chips.push({ code: c.code, label: c.label });
    }
    setPop({ left, top, width, heading: passHeadingFor(meta), chips });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => close(true), 4500);
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
            ? `grid h-9 place-items-center rounded-md border border-red-400/50 bg-red-500/15 text-red-200 transition hover:bg-red-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${wide ? 'w-full flex-1' : 'w-9'}`
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
          <div className="fixed z-[120] animate-fade-up" style={{ left: pop.left, top: pop.top, width: pop.width }} role="dialog" aria-label="Why it missed">
            <div className="rounded-xl border-2 border-brand-400/70 bg-ink-900 p-3 shadow-2xl shadow-black/70 ring-1 ring-brand-500/30">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Removed
                </div>
                <button type="button" onClick={() => close(true)} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
                </button>
              </div>

              {/* One tap = done. Pick the main reason and the card leaves instantly. */}
              <div className="mt-1 text-[11px] text-slate-400">Pick the main reason it missed <span className="text-slate-500">(or ignore)</span></div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {pop.chips.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => apply([c.code])}
                    className="flex min-h-[44px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-2 text-center text-xs font-semibold leading-tight text-slate-200 transition hover:border-brand-300 hover:bg-brand-500/25 hover:text-white"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-center">
                <button type="button" onClick={() => void undo()} className="text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-white hover:underline">Undo</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
