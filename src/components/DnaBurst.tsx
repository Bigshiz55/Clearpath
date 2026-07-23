'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * The "VERD1CT DNA updating" moment — a panel that pops in the CENTER of the card
 * the instant you rule on it (👍/👎): a twisting DNA helix with a pulsing halo and
 * an "updating" line (green ↑ for a For, red ↓ for a Pass). Replaces the quiet
 * bottom-of-screen toast so the payoff lands right on the title. Purely visual —
 * no numbers. Auto-dismisses via onDone.
 */
export function DnaBurst({
  cx,
  cy,
  kind,
  onDone,
}: {
  cx: number;
  cy: number;
  kind: 'up' | 'down';
  onDone: () => void;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), 1150);
    return () => clearTimeout(t);
  }, []);

  if (typeof document === 'undefined') return null;
  const up = kind === 'up';
  const color = up ? '#34d399' : '#fb7185';

  return createPortal(
    <div className="pointer-events-none fixed z-[130]" style={{ left: cx, top: cy, transform: 'translate(-50%,-50%)' }}>
      <div className="animate-fade-up flex flex-col items-center gap-1 rounded-2xl border-2 border-brand-400/70 bg-ink-900/95 px-6 py-5 shadow-2xl shadow-black/70 ring-1 ring-brand-500/40 backdrop-blur">
        <span className="relative grid h-10 w-10 place-items-center" aria-hidden>
          {/* pulsing glow halo behind the helix */}
          <span
            className="wv-dna-halo absolute left-1/2 top-1/2 h-10 w-10 rounded-full blur-md"
            style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
          />
          <span className="wv-dna-twist relative text-4xl leading-none">🧬</span>
        </span>
        <span className="mt-1 text-[11px] font-black uppercase tracking-[0.14em] text-pink-100/90">
          VERD<span style={{ color: '#ff1493' }}>1</span>CT DNA
        </span>
        <span className="text-[11px] font-black uppercase tracking-wide" style={{ color }}>
          Updating {up ? '↑' : '↓'}
        </span>
      </div>
    </div>,
    document.body,
  );
}
