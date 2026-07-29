'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * THE ONE SCORE BADGE. The guide previously printed the same number three
 * ways — "Your 93" in a channel header, a bare "93" on a schedule row, a
 * different pill on the highlight cards — and three renderings of one claim
 * read as three different claims. This is the single component now; `size`
 * changes geometry only, never meaning.
 *
 * TWO HONEST MODES, visually distinct so one is never mistaken for the other:
 *
 *   personalized — "Your 93", pink, the deterministic engine run against THIS
 *   user's own rules. Only rendered once the user has rated enough titles for
 *   "your" to be a true word (`DNA_PERSONAL_MIN` — the same floor every other
 *   personal claim in the app uses).
 *
 *   baseline — "93 fit", neutral slate. The same engine with starter rules; an
 *   honest community/quality number that has not learned this user yet. The
 *   tooltip and popover say exactly that.
 *
 * WHY, ON TAP. A score you can't interrogate is an assertion; the popover
 * shows the engine's own working (base quality + the adjustments that moved
 * this title), passed in from the server — never recomputed or invented here.
 */
export function ScoreBadge({
  score,
  personalized,
  why = null,
  size = 'md',
}: {
  score: number;
  /** True only when the score used this user's own learned rules. */
  personalized: boolean;
  /** The engine's one-line working, when the server sent it. */
  why?: string | null;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const label = personalized ? `Your ${score}` : `${score} fit`;
  const meaning = personalized
    ? 'Scored by the VERD1CT engine against your own taste rules.'
    : 'A baseline fit score — we haven’t learned your taste yet. Rate 10 titles to make this yours.';
  const tone = personalized
    ? 'border-[#ff1493]/50 bg-[#ff1493]/15 text-pink-100'
    : 'border-white/20 bg-white/[0.07] text-slate-300';
  const pad = size === 'sm' ? 'px-1 text-[10px]' : 'px-1.5 py-0.5 text-[11px]';

  return (
    <span ref={ref} className="relative inline-flex" data-testid="score-badge">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${label} — what drove this score`}
        title={meaning}
        className={`rounded-md border font-black tabular-nums transition hover:brightness-125 ${tone} ${pad}`}
      >
        {label}
      </button>
      {open && (
        <span
          role="tooltip"
          data-testid="score-why"
          className="absolute left-0 top-[calc(100%+0.375rem)] z-30 w-56 rounded-xl border border-white/15 bg-ink-950 p-2.5 text-left shadow-[0_12px_36px_-8px_rgba(0,0,0,0.9)]"
        >
          <span className="block text-[11px] font-bold text-white">{label}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{meaning}</span>
          {why && <span className="mt-1.5 block border-t border-white/10 pt-1.5 text-[11px] leading-snug text-slate-300">{why}</span>}
        </span>
      )}
    </span>
  );
}
