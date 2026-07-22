'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent, type FeedbackType } from '@/lib/actions/passFeedback';
import { reasonChipsFor, passHeadingFor, universalCategoriesFor, type TitleMetaLite } from '@/lib/feedback/reasons';
import type { MediaType } from '@/lib/types';

interface Chip { code: string; label: string }
interface Popover {
  left: number;
  top: number;
  width: number;
  lead?: string;
  heading: string;
  chips: Chip[];
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

const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}%`);

/**
 * Pass control. Tapping records the decision and floats a SOLID "Update your
 * DNA?" popover ON TOP of the card (which stays put while you answer). It auto-
 * picks the top ~8 title-specific reasons in a 2-column box; tap any to
 * multi-select (they turn pink), then Apply. The live Taste-DNA score is shown
 * to two decimals so each boost is visible.
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

  // Apply a resolution: supersede the bare pass with a typed feedback + reasons.
  async function apply(type: FeedbackType, codes: string[]) {
    if (timer.current) clearTimeout(timer.current);
    const from = pop?.score ?? null;
    void recordAnalyticsEvent('pass_reason_chip_selected', { tmdbId, choice: type, reasons: codes, categories: universalCategoriesFor(codes) }).catch(() => {});
    try {
      await submitPassFeedback({ ...base, feedbackType: type, reasonCodes: codes, rating: null, ...ctx });
    } catch {
      /* keep moving */
    }
    const to = await fetchScore();
    setPop((p) => (p ? { ...p, bump: { from, to } } : p));
    timer.current = setTimeout(() => close(true), 1900);
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
      top = Math.round(Math.max(8, Math.min(rect.top + 8, window.innerHeight - 330)));
    }

    // Record the decision (fully caught so a failed action can never crash).
    void recordAnalyticsEvent('pass_completed', { tmdbId, mediaType, choice: 'removed_without_reason', ...ctx }).catch(() => {});
    void submitPassFeedback({ ...base, feedbackType: 'removed_without_reason', reasonCodes: [], rating: null, ...ctx }).catch(() => {});

    const [meta, score] = await Promise.all([fetchMeta(), fetchScore()]);
    // Six reasons, spread ACROSS categories — no four flavors of "too long".
    // Reasons ranked most-relevant-to-THIS-title first (reasonChipsFor gates by
    // genre/runtime/age), then spread across categories so the 6 aren't repeats.
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
    setPop({ left, top, width, lead: undefined, heading: passHeadingFor(meta), chips, score, bump: null });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => close(true), 7000);
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
          <div className="fixed z-[120] animate-fade-up" style={{ left: pop.left, top: pop.top, width: pop.width }} role="dialog" aria-label="Update your DNA">
            <div className="rounded-xl border-2 border-brand-400/70 bg-ink-900 p-3 shadow-2xl shadow-black/70 ring-1 ring-brand-500/30">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Removed
                </div>
                {!pop.bump && (
                  <button type="button" onClick={() => close(true)} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
                  </button>
                )}
              </div>

              {pop.bump ? (
                <div className="flex flex-col items-center py-3 text-center">
                  <div className="flex items-baseline gap-1.5 text-white">
                    <span className="text-sm font-black tabular-nums text-slate-400">{pct(pop.bump.from)}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-xl font-black tabular-nums" style={{ color: '#ff2e9a' }}>{pct(pop.bump.to)}</span>
                    {up && <span className="text-emerald-300">↑</span>}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black text-emerald-200">⚡ DNA Boosted</div>
                </div>
              ) : (
                <>
                  {/* Reasons shown right away (one tap, no extra step) but fully
                      ignorable — do nothing and it fades. Tap one to apply it. */}
                  <div className="mt-1 text-[11px] text-slate-400">What made it miss? <span className="text-slate-500">Tap one (optional)</span></div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {pop.chips.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => void apply('not_for_me', [c.code])}
                        className="flex min-h-[44px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-2 text-center text-xs font-semibold leading-tight text-slate-200 transition hover:border-brand-300 hover:bg-brand-500/25 hover:text-white"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-center">
                    <button type="button" onClick={() => void undo()} className="text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-white hover:underline">Undo</button>
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
