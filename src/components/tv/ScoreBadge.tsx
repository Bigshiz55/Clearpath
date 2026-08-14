'use client';

import { useEffect, useRef, useState } from 'react';
import { Verd1ctBadge } from '@/components/Verd1ctBadge';

/**
 * THE GUIDE'S SCORE IS THE CANONICAL SCORE, DRAWN BY THE CANONICAL COMPONENT.
 *
 * This used to render its own "Your 93" / "93 fit" text pill — the same
 * Watch Verd1ct number every card shows, wearing a third costume. The number
 * itself comes from the SAME deterministic engine as every card
 * (`scoreGuideAirings` — see the tv page), so the rendering now REUSES
 * `Verd1ctBadge`, the one official score mark, at guide scale (`tv={false}`
 * — the screen without the antennas, so a dense channel row keeps its
 * height). No score math changes here; the number passes through untouched.
 *
 * What this wrapper adds — and all it adds — is the guide's interrogation
 * layer: the tap-for-why popover carrying the engine's own one-line working,
 * and the honesty split between "scored against YOUR taste" and "baseline —
 * we haven't learned you yet" (gated by the same DNA_PERSONAL_MIN floor as
 * every personal claim). The accessible name states what the number IS:
 * a Watch Verd1ct score.
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

  const meaning = personalized
    ? 'Your Watch Verd1ct score — the VERD1CT engine run against your own taste rules.'
    : 'A baseline Watch Verd1ct score — we haven’t learned your taste yet. Rate 10 titles to make this yours.';
  const px = size === 'sm' ? 20 : 28;

  return (
    <span ref={ref} className="relative inline-flex" data-testid="score-badge">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Watch Verd1ct score ${score}${personalized ? ', scored for your taste' : ', baseline'} — what drove this score`}
        title={meaning}
        className="inline-flex items-center transition hover:brightness-125"
      >
        <Verd1ctBadge score={score} px={px} tv={false} title={meaning} />
      </button>
      {open && (
        <span
          role="tooltip"
          data-testid="score-why"
          className="absolute left-0 top-[calc(100%+0.375rem)] z-30 w-56 rounded-xl border border-white/15 bg-ink-950 p-2.5 text-left shadow-[0_12px_36px_-8px_rgba(0,0,0,0.9)]"
        >
          <span className="block text-[11px] font-bold text-white">
            {personalized ? `Your Watch Verd1ct: ${score}` : `Watch Verd1ct: ${score} (baseline)`}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{meaning}</span>
          {why && <span className="mt-1.5 block border-t border-white/10 pt-1.5 text-[11px] leading-snug text-slate-300">{why}</span>}
        </span>
      )}
    </span>
  );
}
