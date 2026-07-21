/**
 * A slim, glowing tagline strip for the very top of the site — the three
 * promises, with a slow sheen so it catches the eye without taking over the
 * screen.
 */
export function PromiseBar({ rounded = false }: { rounded?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-600 shadow-[0_1px_16px_-2px_rgba(255,20,147,0.5)] ${
        rounded ? 'rounded-2xl border border-white/15' : 'border-b border-white/15'
      }`}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-4 py-2 text-center text-[12px] font-bold tracking-tight text-white/90 sm:text-[13px]">
        {/* Lead promise — bigger, bolder, highlighted so it reads first. */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[15px] font-black tracking-tight text-white shadow-sm ring-1 ring-white/25 sm:text-base">
          <span aria-hidden className="text-base sm:text-lg">🎯</span> Better recommendations
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>💸</span> Stop overpaying for streaming
        </span>
        <span aria-hidden className="text-white/40">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>🔔</span> No trial traps — we&rsquo;ll remind you before any charge
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
