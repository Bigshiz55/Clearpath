'use client';

import { COURT_SIZES, type CourtSize } from '@/lib/court/pool';

/**
 * COURT SIZE PICKER — the host decides how much the room browses before it
 * decides. Standard is the default because a room of four wants enough variety
 * to feel chosen for, without turning the night into a scroll.
 *
 * The counts are not decoration: they come straight from `COURT_SIZES`, the
 * same specification `buildPool` uses, so the label can never drift from what
 * the engine actually builds.
 */

const ORDER: CourtSize[] = ['quick', 'standard', 'deep'];

export function CourtSizePicker({
  value,
  onChange,
  disabled = false,
  /** Set when the court is already running — changing size rebuilds the pool. */
  warnOnChange = false,
}: {
  value: CourtSize;
  onChange: (size: CourtSize) => void;
  disabled?: boolean;
  warnOnChange?: boolean;
}) {
  return (
    <div data-testid="court-size-picker">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">How many titles should we consider?</p>
      <div role="radiogroup" aria-label="Court size" className="grid gap-2 sm:grid-cols-3">
        {ORDER.map((key) => {
          const spec = COURT_SIZES[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              data-testid={`court-size-${key}`}
              onClick={() => onChange(key)}
              className={`min-h-[64px] rounded-xl border p-3 text-left transition disabled:opacity-40 ${
                selected
                  ? 'border-brand-400 bg-brand-500/25 ring-2 ring-brand-400/60'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-1.5 text-sm font-black text-white">
                  {/* A mark, not just a colour — selection must survive a dim screen. */}
                  <span aria-hidden className={selected ? 'text-brand-200' : 'text-transparent'}>✓</span>
                  {spec.label}
                </span>
                <span className="text-xs font-bold tabular-nums text-brand-200">{spec.total}</span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{spec.blurb}</span>
              <span className="mt-1 block text-[10px] text-slate-500">{spec.active} in play · {spec.total - spec.active} in reserve</span>
            </button>
          );
        })}
      </div>
      {warnOnChange && (
        <p data-testid="court-size-warning" className="mt-2 text-[11px] text-amber-200">
          Changing the size rebuilds the court. Votes already cast are cleared.
        </p>
      )}
    </div>
  );
}
