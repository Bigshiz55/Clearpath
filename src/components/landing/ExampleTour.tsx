/**
 * THE PRODUCT TOUR AROUND THE EXAMPLE CARD — LANDING ONLY, AND OUTSIDE THE CARD.
 *
 * A first-time visitor now sees the real recommendation card, which is the
 * point — but a real card assumes you already know what a Verd1ct score is,
 * what Match means, and that "Why this Verd1ct?" opens the evidence. This layer
 * names the six things that matter.
 *
 * ── WHY IT NEVER TOUCHES THE CARD ─────────────────────────────────────────
 * Not one line of `PosterCard` changed to support this, and nothing here is
 * drawn ON the card. On a laptop the callouts live in the page's own gutters,
 * on either side of the card's column, with a leader rule reaching toward it.
 * That is a layout choice with a hard guarantee behind it: a callout in a
 * different grid column CANNOT cover a button, a link or a provider tile, so
 * the tour cannot make the product less usable in the act of explaining it.
 * (The visual suite asserts the boxes never intersect.)
 *
 * ── AND WHY THE PHONE GETS SOMETHING ELSE ─────────────────────────────────
 * A 390px screen has no gutters. Six leader lines around a full-width card
 * would be a web of string over the thing it is describing. The phone gets the
 * same six concepts as a compact numbered legend directly under the card, each
 * one naming the label that is literally printed on the card above it
 * ("Where to watch", "Why this Verd1ct?"), which is the association a leader
 * line would have drawn.
 *
 * ── THE ONE THING IT MUST NOT DO ──────────────────────────────────────────
 * Claim a Match exists. An anonymous visitor has no Taste DNA, so stop ② says
 * where the number comes from and when it appears — it does not point at a
 * number, because there isn't one yet.
 */

export interface TourStop {
  /** 1-based, and the same number in both presentations. */
  n: number;
  /** The concept, in the words the card itself uses where it has words. */
  label: string;
  /** One sentence. Editorial, not a tooltip. */
  body: string;
  /** Which gutter it sits in on a laptop. */
  side: 'left' | 'right';
  /** Distance from the top of the card to the region it points at, in px.
   *  Every box on the card is a fixed height from `sm` — the media frame is an
   *  aspect-ratio, and the title, reason and provider row are pinned (see
   *  `.wv-card-title`, `.wv-reason`, `.wv-provider-row` in globals.css) — so
   *  these stay put whatever a title's content does.
   *  MEASURED, NOT GUESSED: `node scripts/tourOffsets.mjs` prints the rendered
   *  offsets of every region on this exact card. Re-run it after any card
   *  layout change and move these to match, rather than nudging until the
   *  overlap test goes quiet. */
  top: number;
}

/**
 * SIX, AND NO MORE. Every additional callout costs the card its focus, and the
 * card is the thing being demonstrated. These are the six a first-time reader
 * cannot infer: two numbers, two evidence panels, availability, and the way in.
 */
export const TOUR_STOPS: TourStop[] = [
  {
    n: 1,
    label: 'Preview it',
    // RE-AIMED BY THE CARD REDESIGN. This stop used to point at `More`, the
    // synopsis expander — which the browse card no longer carries (the full
    // synopsis moved to More Info, because a card carrying the whole report was
    // 763px tall and could not fit on screen). Pointing a tour at a control
    // that is not there is worse than one stop fewer, so it now names the
    // affordance that IS on the artwork and that a first-time reader genuinely
    // cannot infer: the trailer plays inside the poster frame, in place.
    body: 'Play the trailer right here — it runs inside the poster, so the recommendation never leaves your screen.',
    side: 'left',
    top: 150,
  },
  {
    n: 2,
    label: 'WatchVerd1ct Score',
    body: 'Our quality judgment for this title — one 0–100 number blended from every rating source we actually hold.',
    side: 'left',
    top: 300,
  },
  {
    n: 3,
    label: 'Your Match',
    body: 'Your personal fit. It replaces the number above once WatchVerd1ct has learned your Taste DNA — we never invent one for a visitor we do not know yet.',
    side: 'right',
    top: 296,
  },
  {
    n: 4,
    label: 'Where to Watch',
    body: 'Subscription, rental and purchase options, drawn as each service’s own brand mark.',
    side: 'right',
    top: 418,
  },
  {
    n: 5,
    label: 'Why this Verd1ct?',
    body: 'The evidence behind the call: what matched, which of your requirements were checked, and how confident that makes us.',
    side: 'left',
    top: 452,
  },
  {
    n: 6,
    label: 'Things to Know',
    body: 'The trade-offs, in that same panel — a long runtime, availability we could not verify.',
    side: 'right',
    top: 516,
  },
];

/** The numbered mark. One shape, both presentations, so ③ means ③ everywhere. */
function Marker({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-5 w-5 flex-none place-items-center rounded-full border border-brand-400/60 bg-brand-500/20 text-[11px] font-black tabular-nums text-brand-100 ${className}`}
    >
      {n}
    </span>
  );
}

/** One gutter callout: the mark, the concept, the sentence, and a leader rule
 *  reaching toward the card. */
function Callout({ stop }: { stop: TourStop }) {
  const left = stop.side === 'left';
  const rule = (
    <span aria-hidden className={`flex flex-none items-center ${left ? 'flex-row' : 'flex-row-reverse'}`}>
      <span className="h-px w-10 bg-gradient-to-r from-transparent to-brand-400/50" />
      <span className="h-1.5 w-1.5 rounded-full bg-brand-400/80" />
    </span>
  );
  return (
    <li
      data-testid="tour-callout"
      data-stop={stop.n}
      className={`absolute flex w-[290px] items-start gap-2.5 ${left ? 'right-0 flex-row' : 'left-0 flex-row-reverse'}`}
      style={{ top: stop.top }}
    >
      <div className={`min-w-0 ${left ? 'text-right' : 'text-left'}`}>
        <div className={`flex items-center gap-1.5 ${left ? 'justify-end' : 'justify-start'}`}>
          <Marker n={stop.n} className={left ? 'order-2' : ''} />
          <span className="text-[13px] font-black uppercase tracking-[0.1em] text-slate-200">{stop.label}</span>
        </div>
        <p className="mt-1 text-[13px] leading-snug text-slate-400">{stop.body}</p>
      </div>
      {/* The rule sits between the text and the card, on the card-facing side. */}
      <span className={`mt-1.5 ${left ? '' : ''}`}>{rule}</span>
    </li>
  );
}

/** The laptop presentation: one gutter column of callouts. */
export function TourGutter({ side }: { side: 'left' | 'right' }) {
  const stops = TOUR_STOPS.filter((s) => s.side === side);
  return (
    // `min-h` keeps the column tall enough for absolutely-placed callouts; the
    // column is a grid sibling of the card, never an overlay on it.
    <ul className="relative hidden min-h-[700px] xl:block" aria-hidden data-testid={`tour-gutter-${side}`}>
      {stops.map((s) => (
        <Callout key={s.n} stop={s} />
      ))}
    </ul>
  );
}

/**
 * The phone/tablet presentation: the same six, as a legend under the card.
 * It is also what assistive tech reads on every width — the gutter callouts
 * are `aria-hidden` so the concepts are announced once, in order, here.
 */
export function TourLegend({ className = '' }: { className?: string }) {
  return (
    <section className={className} data-testid="tour-legend">
      <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">What you’re looking at</h3>
      <ul className="mt-2 space-y-1.5">
        {TOUR_STOPS.map((s) => (
          <li key={s.n} data-testid="tour-legend-item" className="flex items-start gap-2">
            <Marker n={s.n} className="mt-0.5" />
            <p className="min-w-0 text-[13px] leading-snug text-slate-400">
              <span className="font-bold text-slate-200">{s.label}</span> — {s.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
