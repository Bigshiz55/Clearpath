/**
 * WHAT THE BUTTONS ON A REAL CARD MEAN.
 *
 * Every result card in the app carries a FOR / AGAINST / SAVE row and, above
 * it all, the gold "Enter the Courtroom" gavel that starts the whole
 * process. A first-time visitor has never seen those controls before this
 * page sends them to one — so this shows the SAME icons and colors CardVerdict
 * and SaveButton actually render (see their own files), not a redrawn or
 * simplified version, with one honest line each for what tapping it does.
 *
 * These are illustrative, not functional — there is no title behind them on
 * a marketing page, so they render as inert shapes (no <button>, no
 * onClick) rather than dead controls that look clickable and do nothing.
 */
const ITEMS: {
  key: string;
  label: string;
  caption: string;
  tone: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'for',
    label: 'For',
    caption: "You're in — it counts toward your taste.",
    tone: 'border-emerald-400/70 bg-emerald-500/25 text-emerald-100',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m14 13-7.4 7.4a2.12 2.12 0 0 1-3-3L11 10" />
        <path d="m16 16 6-6" />
        <path d="m8 8 6-6" />
        <path d="m9 7 8 8" />
        <path d="m21 11-8-8" />
      </svg>
    ),
  },
  {
    key: 'against',
    label: 'Against',
    caption: 'Pass on it — that counts too.',
    tone: 'border-red-400/70 bg-red-500/25 text-red-100',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 -scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m14 13-7.4 7.4a2.12 2.12 0 0 1-3-3L11 10" />
        <path d="m16 16 6-6" />
        <path d="m8 8 6-6" />
        <path d="m9 7 8 8" />
        <path d="m21 11-8-8" />
      </svg>
    ),
  },
  {
    key: 'save',
    label: 'Save',
    caption: 'Hold it for later — no ruling yet.',
    tone: 'border-2 border-[#ff1493]/70 bg-[#ff1493]/30 text-pink-50',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'gavel',
    label: 'The gavel',
    caption: 'Hit it for your Verd1ct.',
    tone: 'border-gold-400/60 bg-gold-500/20 text-amber-100',
    icon: (
      <span className="text-lg leading-none" aria-hidden>
        ⚖️
      </span>
    ),
  },
];

export function HowYouRule() {
  return (
    <section className="border-t border-white/10" data-testid="how-you-rule">
      <div className="container-page py-14 sm:py-20">
        <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-500">How you rule on a title</h2>
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4" data-testid="how-you-rule-items">
          {ITEMS.map((item) => (
            <div key={item.key} className="flex flex-col items-center text-center" data-testid={`rule-item-${item.key}`}>
              <div aria-hidden className={`grid h-12 w-12 flex-none place-items-center rounded-xl border font-semibold ${item.tone}`}>
                {item.icon}
              </div>
              <div className="mt-2.5 text-sm font-black uppercase tracking-wide text-white">{item.label}</div>
              <p className="mt-1 text-xs text-slate-400">{item.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
