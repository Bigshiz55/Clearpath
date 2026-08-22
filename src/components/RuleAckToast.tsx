'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * THE HONEST ACKNOWLEDGEMENT — what a For/Against ruling actually taught, said
 * plainly, right on the card.
 *
 * This replaces the old DNA burst: motion with no meaning ("VERD1CT DNA", a red
 * arrow), plus a hard-coded magenta that broke the one-accent system. Now a
 * quiet pill states the real consequence ("Got it — more like this" /
 * "Noted — fewer like this") in one line the user can read and trust.
 *
 * Short-lived on purpose: it fires on every ruling, so it gets out of the way
 * fast rather than holding the next tap hostage. Purely a confirmation — the
 * live-region copy is carried by the card's own status node.
 */
export function RuleAckToast({
  cx,
  cy,
  line,
  kind,
  onDone,
}: {
  cx: number;
  cy: number;
  line: string;
  kind: 'up' | 'down';
  onDone: () => void;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), 1500);
    return () => clearTimeout(t);
  }, []);

  if (typeof document === 'undefined') return null;
  const up = kind === 'up';
  // Restrained, on-system: a positive ruling glows faintly emerald, a pass is a
  // calm neutral. No magenta, no "DNA" branding, no numbers.
  const dot = up ? 'bg-emerald-400' : 'bg-slate-400';

  return createPortal(
    <div
      className="pointer-events-none fixed z-[130]"
      style={{ left: cx, top: cy, transform: 'translate(-50%,-50%)' }}
    >
      <div className="motion-safe:animate-fade-up flex items-center gap-2 rounded-full border border-white/12 bg-ink-900/95 px-4 py-2 text-sm font-semibold text-white shadow-2xl shadow-black/70 ring-1 ring-white/10 backdrop-blur">
        <span className={`h-2 w-2 flex-none rounded-full ${dot}`} aria-hidden />
        <span className="whitespace-nowrap">{line}</span>
      </div>
    </div>,
    document.body,
  );
}
