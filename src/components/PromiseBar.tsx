import { PinkRibbon } from '@/components/PinkRibbon';

/**
 * A slim, glowing tagline strip for the very top of the site — the three
 * promises, with a slow sheen so it catches the eye without taking over the
 * screen. The ribbon marks "Meaningful impact" (the charity pledge).
 */
export function PromiseBar() {
  return (
    <div className="relative overflow-hidden border-b border-white/15 bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-600 shadow-[0_1px_16px_-2px_rgba(255,20,147,0.5)]">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 py-2 text-center text-[12.5px] font-extrabold tracking-tight text-white sm:text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>🎯</span> Better recommendations
        </span>
        <span aria-hidden className="text-white/45">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>🤝</span> Honest subscriptions
        </span>
        <span aria-hidden className="text-white/45">·</span>
        <span className="inline-flex items-center gap-1.5">
          <PinkRibbon className="h-3.5 w-3.5 text-white" /> Meaningful impact
        </span>
      </div>
      {/* moving sheen */}
      <span
        aria-hidden
        className="wv-promise-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-gradient-to-r from-transparent via-white/30 to-transparent"
      />
    </div>
  );
}
