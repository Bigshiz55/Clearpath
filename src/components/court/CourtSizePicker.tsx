'use client';

import { COURT_SIZES, type CourtSize } from '@/lib/court/pool';
import { roomSizeView } from '@/lib/court/roomSettings';

/**
 * COURT SIZE — one setting, two faces.
 *
 * The host gets a control. Everyone else gets the same information as a
 * read-only fact, because a member deciding how much of their evening to invest
 * deserves to know the room will weigh 8 titles rather than 16 — but the value
 * belongs to the room, and a second editable copy on a guest's phone is exactly
 * how two devices end up disagreeing.
 *
 * Counts come from `COURT_SIZES`, the same specification `buildPool` uses, so
 * the label can never drift from what actually gets built.
 */

const ORDER: CourtSize[] = ['quick', 'standard', 'deep'];

export function CourtSizePicker({
  value,
  onChange,
  isHost,
  hostName,
  locked = false,
  busy = false,
}: {
  value: CourtSize;
  onChange: (size: CourtSize) => void;
  /** Only the room's creator may change this. */
  isHost: boolean;
  hostName: string | null;
  /** True once candidate generation has begun. */
  locked?: boolean;
  busy?: boolean;
}) {
  const view = roomSizeView({ size: value, isHost, locked, hostName });

  // Read-only: joining members, and the host once the court is built.
  if (!view.editable) {
    return (
      <div
        data-testid="court-size-readonly"
        data-size={value}
        className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Room setting</p>
        <p data-testid="court-size-headline" className="mt-1 text-sm font-black text-white">{view.headline}</p>
        <p data-testid="court-size-detail" className="mt-0.5 text-[11px] text-slate-400">{view.detail}</p>
        <p className="mt-1 text-[11px] text-slate-500">{view.lockedReason}</p>
      </div>
    );
  }

  return (
    <div data-testid="court-size-picker">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        How many titles should we consider? <span className="text-brand-300">You choose for the room</span>
      </p>
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
              disabled={busy}
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
      <p className="mt-2 text-[11px] text-slate-500">Everyone in the room sees this. It locks once we build the court.</p>
    </div>
  );
}
