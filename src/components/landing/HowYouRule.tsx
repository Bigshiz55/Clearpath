import { DocketDemoIcon } from './DocketDemoIcon';

/**
 * WHAT THE CONTROLS ON A REAL CARD MEAN.
 *
 * Every result card in the app carries a FOR / AGAINST / SAVE row and a
 * circle on the poster itself (the "docket" — see WCheck.tsx) for shortlisting
 * a title against the others you're weighing. A first-time visitor has never
 * seen any of them before this page sends them to one — so this shows the
 * SAME icons and colors CardVerdict, SaveButton, and WCheck actually render
 * (see their own files), not a redrawn or simplified version, with one
 * honest line each for what tapping it does.
 *
 * FOR / AGAINST / SAVE are illustrative, not functional — there is no title
 * behind them on a marketing page, so they render as inert shapes (no
 * <button>, no onClick). The docket circle is the one exception: it actually
 * demonstrates its own selected/unselected states (DocketDemoIcon) because a
 * static swatch didn't show what tapping it does — "highlighting like when
 * it's in a card" was the point.
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
];

export function HowYouRule() {
  return (
    <section className="border-t border-white/10" data-testid="how-you-rule">
      <div className="container-page py-14 sm:py-20">
        <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-500">How you rule on a title</h2>
        <CardControlsExplainer className="mx-auto mt-8 max-w-3xl" />
      </div>
    </section>
  );
}

/**
 * THE GRID ALONE — split out so the app's own /app/tour hub can embed the
 * exact same illustration inside its own topic card, instead of a second,
 * inevitably-drifting copy of the same four icons. See HowYouRule's doc
 * comment above for what this actually shows and why.
 */
export function CardControlsExplainer({ className = '' }: { className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-4 sm:grid-cols-4 ${className}`} data-testid="how-you-rule-items">
      {ITEMS.map((item) => (
        <div key={item.key} className="flex flex-col items-center text-center" data-testid={`rule-item-${item.key}`}>
          <div aria-hidden className={`grid h-12 w-12 flex-none place-items-center rounded-xl border font-semibold ${item.tone}`}>
            {item.icon}
          </div>
          <div className="mt-2.5 text-sm font-black uppercase tracking-wide text-white">{item.label}</div>
          <p className="mt-1 text-xs text-slate-400">{item.caption}</p>
        </div>
      ))}
      {/* THE DOCKET — round, like the real poster button, and demonstrated
          rather than described (see DocketDemoIcon's own doc comment). */}
      <div className="flex flex-col items-center text-center" data-testid="rule-item-docket">
        <DocketDemoIcon />
        <div className="mt-2.5 text-sm font-black uppercase tracking-wide text-white">The docket</div>
        <p className="mt-1 text-xs text-slate-400">The circle on every poster — tap to shortlist it, compared against the others you pick.</p>
      </div>
    </div>
  );
}
