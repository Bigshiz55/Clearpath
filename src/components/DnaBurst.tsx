'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The "your DNA is recalculating" moment — a panel that pops in the CENTER of the
 * card the instant you rule on it (👍/👎), with the helix and your live Taste-DNA
 * score counting up to its new value. Replaces the quiet bottom-of-screen toast
 * so the payoff happens right on the title. Purely presentational; the number it
 * lands on is the real DNA score fetched by the caller (null → just "calculating").
 */
export function DnaBurst({
  cx,
  cy,
  kind,
  target,
  onDone,
}: {
  cx: number;
  cy: number;
  kind: 'up' | 'down';
  target: number | null;
  onDone: () => void;
}) {
  const [display, setDisplay] = useState<number | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  // Safety: never hang if the score never arrives.
  useEffect(() => {
    const t = setTimeout(finish, 2300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count up to the real new score, then hold a beat and finish.
  useEffect(() => {
    if (target == null) return;
    let raf = 0;
    let hold: ReturnType<typeof setTimeout>;
    const dur = 820;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else hold = setTimeout(finish, 480);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(hold); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (typeof document === 'undefined') return null;
  const up = kind === 'up';
  const color = up ? '#34d399' : '#fb7185';

  return createPortal(
    <div className="pointer-events-none fixed z-[130]" style={{ left: cx, top: cy, transform: 'translate(-50%,-50%)' }}>
      <div className="animate-fade-up flex flex-col items-center gap-0.5 rounded-2xl border-2 border-brand-400/70 bg-ink-900/95 px-5 py-4 shadow-2xl shadow-black/70 ring-1 ring-brand-500/40 backdrop-blur">
        <span className="animate-pulse text-3xl leading-none" aria-hidden>🧬</span>
        <span className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-pink-100/80">Your DNA</span>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black tabular-nums" style={{ color }}>{display == null ? '…' : display.toFixed(1)}</span>
          <span className="text-lg font-black" style={{ color }}>{up ? '↑' : '↓'}</span>
        </div>
        <span className="text-[11px] font-black" style={{ color }}>
          {display == null ? 'Calculating…' : up ? '⚡ Boosted — more like this' : 'Noted — less like this'}
        </span>
      </div>
    </div>,
    document.body,
  );
}
