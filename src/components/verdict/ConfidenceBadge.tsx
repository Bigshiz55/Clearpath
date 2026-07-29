'use client';

import { useState } from 'react';
import type { ConfidenceView } from '@/lib/verdict/confidence';

const TONE: Record<ConfidenceView['label'], string> = {
  high: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-100',
  medium: 'border-amber-400/40 bg-amber-500/12 text-amber-100',
  early: 'border-sky-400/40 bg-sky-500/12 text-sky-100',
};

/** A filled / half / hollow meter. NOT colour alone — a colour-blind viewer
 *  reads the same three states from the shape and from the words. */
function Meter({ label }: { label: ConfidenceView['label'] }) {
  const filled = label === 'high' ? 3 : label === 'medium' ? 2 : 1;
  return (
    <span aria-hidden className="flex flex-none items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i < filled ? 'bg-current' : 'bg-current/25'}`}
          style={{ height: `${5 + i * 3}px` }}
        />
      ))}
    </span>
  );
}

/**
 * HOW SURE ARE WE — shown next to the score, never instead of it.
 *
 * A match percentage says how well a title fits; this says how much evidence
 * that number stands on. They are different claims, and collapsing them into
 * one number is how a recommender manufactures precision it has not earned.
 *
 * Tapping it explains itself in plain language: the reasons come from
 * `verdictConfidence`, which reads the real evidence (rating sources,
 * availability, how many titles this user has rated, whether the title sits
 * outside their usual range, and whether everyone in a group is known).
 */
/** The height the badge always occupies, reserved from first paint. */
export const CONFIDENCE_BADGE_H = 18;
/** The compact chip's exact width, so a card can reserve its space from first
 *  paint and the panel never re-flows when the DNA lands. */
export const CONFIDENCE_CHIP_W = 62;

/** Short form for the card chip — the meter carries the rest, and the
 *  accessible name always carries the full claim. */
const SHORT: Record<ConfidenceView['label'], string> = { high: 'High', medium: 'Medium', early: 'Early' };

export function ConfidenceBadge({
  view,
  className = '',
  size = 'sm',
  compact = false,
}: {
  view: ConfidenceView;
  className?: string;
  size?: 'sm' | 'md';
  /** Card chip: one short word beside the meter, so it sits on the label's
   *  own line instead of costing the score panel a whole extra row. The full
   *  wording and the reasons are one tap away, unchanged. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="confidence-badge"
        data-level={view.label}
        /* The accessible name always carries the FULL claim, even when the
           visible chip is one word — a screen reader must not hear "High". */
        aria-label={`${view.text}. Tap for why.`}
        title="How sure we are — tap for why"
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 font-bold transition ${TONE[view.label]} ${
          compact ? 'flex-none justify-center gap-1 px-1 text-[9px] leading-none' : 'min-h-[28px] gap-1.5 px-2 text-[11px]'
        } ${size === 'md' && !compact ? 'text-[13px]' : ''}`}
        style={compact ? { height: CONFIDENCE_BADGE_H, width: CONFIDENCE_CHIP_W } : undefined}
      >
        <Meter label={view.label} />
        {compact ? SHORT[view.label] : view.text}
        <span aria-hidden className="opacity-60">{open ? '▾' : 'ⓘ'}</span>
      </button>

      {open && (
        <span
          role="status"
          data-testid="confidence-why"
          className="absolute left-0 top-full z-30 mt-1.5 w-[min(20rem,80vw)] rounded-xl border border-white/15 bg-ink-950 p-3 text-left shadow-[0_12px_36px_-8px_rgba(0,0,0,0.9)]"
        >
          <span className="block text-[11px] font-black uppercase tracking-wide text-slate-400">
            Why {view.text.toLowerCase()}
          </span>
          <ul className="mt-1.5 space-y-1">
            {view.because.map((b) => (
              <li key={b} className="text-[12px] leading-snug text-slate-300">
                • {b}
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}
