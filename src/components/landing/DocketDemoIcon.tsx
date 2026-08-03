'use client';

import { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';

/**
 * THE DOCKET CIRCLE, ACTUALLY DEMONSTRATED.
 *
 * A static gray circle didn't show what tapping it does. This toggles
 * between WCheck's own two real states — the same classes, not a redrawn
 * approximation — so a first-time visitor sees the select happen instead of
 * being told about it in a caption: rest (a glass ring on dark), then
 * selected (brand pink fill, a brighter ring, the tick badge), and back.
 *
 * Respects prefers-reduced-motion: settles on the selected state once and
 * stops, rather than looping — the "what does selecting it look like"
 * question still gets answered without motion nobody asked for.
 */
export function DocketDemoIcon() {
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setSelected(true);
      return;
    }
    const t = setInterval(() => setSelected((s) => !s), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      aria-hidden
      className={`grid h-12 w-12 flex-none place-items-center rounded-full font-semibold transition duration-300 ${
        selected
          ? 'bg-[#ff1493] text-white ring-2 ring-pink-100/90 shadow-[0_2px_14px_-2px_rgba(255,20,147,0.85)]'
          : 'bg-white/10 text-white/90 ring-1 ring-white/45'
      }`}
    >
      <span className="relative leading-none">
        <Gavel className="h-5 w-5" strokeWidth={2.25} />
        {selected && (
          <svg
            viewBox="0 0 24 24"
            className="absolute -right-2.5 -top-2 h-3.5 w-3.5 rounded-full bg-white p-[1px] text-[#ff1493]"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
        )}
      </span>
    </div>
  );
}
