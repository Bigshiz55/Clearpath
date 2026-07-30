'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * COVERAGE HONESTY, AT CAPTION WEIGHT. Without a full-grid provider the guide
 * reads a premiere feed — first-run episodes on a handful of national
 * networks — and saying so is the difference between a thin list and a thin
 * list pretending to be the national schedule.
 *
 * It used to say so as a full-width amber banner, which cost ~120px of the
 * first screen every visit to restate the same fact. The fact belongs at
 * caption weight: one muted sentence beside the heading, with the full
 * explanation one tap away behind "Why?".
 */
export function CoverageNote() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center gap-1.5 text-xs text-slate-500" data-testid="schedule-coverage-notice">
      <Info size={16} className="flex-none" aria-hidden />
      <span>Partial listings — first-run national networks only.</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="coverage-why"
        className="font-semibold text-slate-400 underline decoration-dotted underline-offset-2 hover:text-white"
      >
        Why?
      </button>
      {open && (
        <span
          role="tooltip"
          data-testid="coverage-why-pop"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-72 rounded-xl border border-white/15 bg-ink-950 p-3 text-left text-xs leading-relaxed text-slate-300 shadow-[0_12px_36px_-8px_rgba(0,0,0,0.9)]"
        >
          This deployment has no full-schedule provider configured, so we can only show first-run
          episodes on a small number of national networks. Reruns, movies, daytime, sports and local
          channels are missing — this is <em>not</em> the complete TV schedule. We show what we can
          confirm and never invent a listing.
        </span>
      )}
    </span>
  );
}
