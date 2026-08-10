'use client';

/**
 * THE VERD1CT DNA WHEEL.
 *
 * Two jobs at once: it is the picture of what we know about you, and — during
 * the radial rounds — it IS the game board. The question sits in the hub and the
 * six answers live in the wedges around it, so one glance covers the whole
 * decision and the thumb never leaves the circle. Original geometry and
 * WatchVerd1ct's own palette; nothing here borrows another game's trade dress.
 *
 * A BUTTON HAS TO LOOK LIKE A BUTTON. When the wheel is a control, each wedge
 * is painted in its full accent, separated from its neighbours by a real gap,
 * and lettered in whichever ink actually contrasts with that accent (computed,
 * not guessed — see `inkFor`). Six equally bold, unmistakably separate targets.
 *
 * WHICH IS WHY CONFIDENCE MOVED OFF THE FILL. The rule that matters is that
 * affinity and confidence never share a channel: "we are certain you dislike
 * comedy" and "we know nothing about comedy" are opposite states, and one fill
 * level renders them identically. Dimming an unknown wedge honoured that rule
 * but made half the buttons unreadable, so the two signals now sit somewhere
 * legibility does not pay for them:
 *
 *   OUTER ARC   = confidence. A meter around the rim, filling as we learn.
 *   INNER BAND  = affinity. Whether you like it, drawn only once there is
 *                 enough confidence for the claim to mean anything.
 *   FILL        = identity. Which button this is. Nothing else.
 *
 * When the wheel is only a PICTURE (the opening screen, the reveal) there are
 * no buttons to keep legible, so the fill goes back to carrying confidence
 * across its full range — that is the one place the extra dynamic range is free.
 *
 * ACCESSIBILITY IS NOT AN AFTERTHOUGHT, and putting the answers inside the
 * circle is exactly where a radial control normally loses it. It does not here.
 * Each wedge is a real <button> carrying its own text, in reading order and
 * keyboard-reachable; the sector is the hit area, not the words, so every target
 * is many times the 44px minimum even on a small phone. The focus ring is drawn
 * on the label rather than the button, because an outline on the button would be
 * clipped away by the sector shape. Colour never carries meaning alone —
 * position, label, the affinity band and the selected state all say the same
 * thing. Reduced-motion users get the same wheel without the transitions.
 */

import { useId, type ReactNode } from 'react';
import type { FamilyReading } from '@/lib/dnagame/families';

export interface WheelSlot {
  familyId: string;
  label: string;
  /** Present during a radial round; absent when the wheel is just a picture. */
  onSelect?: () => void;
  selected?: boolean;
  /** Rejection rounds tap to condemn — that must not look like choosing. */
  negative?: boolean;
}

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

/**
 * Percent-of-box radii.
 *
 * THE HUB IS DELIBERATELY SMALL. Every unit it gives back goes straight into the
 * ring, and the ring is where the game is played — a generous hub squeezed the
 * six buttons into a narrow band and made them feel cramped. The question still
 * has to fit inside it, so the hub's own type scales with it (see `VerdictRush`).
 */
const INNER = 18.5;
/** The painted wedge — the button face. Deep enough to hold three lines. */
const PAINT_IN = 20.5;
const PAINT_OUT = 46;
/**
 * The confidence meter, outside the button face so it cannot dim the label, and
 * standing clear of it rather than sitting against its edge.
 */
const METER_IN = 48.5;
const METER_OUT = 50.5;

/** Degrees trimmed from each side of a wedge. This is the cut between buttons. */
const GAP_DEG = 3.2;

/**
 * The HIT area runs from just inside the paint out past the rim, and takes the
 * wedge's angular span. It is bounded by the same gap the eye sees: a tap must
 * never land on a button that is not underneath the thumb, and — because the
 * label is a child of the button — this clip is also what guarantees a label
 * can never spill outside its own colour.
 */
const HIT_INNER = 19.5;
const HIT_OUTER = 51;

/** Where a wedge's label sits — centred in the meat of the sector. */
const LABEL_R = 32.5;
/**
 * Label box width, as a percentage of the wheel.
 *
 * This is the number the whole layout is pinned to. A horizontal box inside a
 * 54-degree sector is bounded by its CORNERS, not by the arc, and the four
 * diagonal wedges are far tighter than the top and bottom ones — at this radius
 * a 22% box is the widest whose corners all clear both the hub and the rim. The
 * same width is used on all six so the six buttons look like a set.
 */
const LABEL_W = 22;

/**
 * Wedge `i` is CENTRED at twelve o'clock, two o'clock and so on, rather than
 * starting there. Centred wedges put the six labels on the points of a hexagon,
 * which is what makes them readable; a wedge that merely starts at twelve leaves
 * the top label straddling the vertical.
 */
function angles(index: number, count: number): { start: number; end: number; mid: number } {
  const step = TAU / count;
  const mid = index * step - Math.PI / 2;
  return { start: mid - step / 2, end: mid + step / 2, mid };
}

const px = (r: number, a: number) => 50 + r * Math.cos(a);
const py = (r: number, a: number) => 50 + r * Math.sin(a);

/** An annular sector between two angles. Empty string when it would be a hairline. */
function arcPath(start: number, end: number, inner: number, outer: number): string {
  if (end - start < 0.002) return '';
  const p = (r: number, a: number) => `${px(r, a).toFixed(3)} ${py(r, a).toFixed(3)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${p(inner, start)}`,
    `L ${p(outer, start)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${p(outer, end)}`,
    `L ${p(inner, end)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${p(inner, start)}`,
    'Z',
  ].join(' ');
}

/**
 * Which ink is readable on this accent, by WCAG relative luminance rather than
 * by eye. White on amber and near-black on purple are both roughly 2:1 — unusable
 * — and there is no single ink that works on all six, so it is computed per
 * wedge and the labels stay high-contrast whatever the palette does later.
 */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

const INK_DARK = '#0a0f1e';
const INK_LIGHT = '#ffffff';

export function inkFor(hex: string): string {
  return luminance(hex) > 0.35 ? INK_DARK : INK_LIGHT;
}

/**
 * How big a label can be set without breaking a word in half.
 *
 * The box is a fixed width (see `LABEL_W`) so the six buttons match, which means
 * the LONGEST WORD is what decides the type size — a word that cannot fit gets
 * hyphen-broken across two lines, and "frighten-ing" in the middle of a wedge is
 * worse than a slightly smaller wedge. Most of the bank is short and lands on
 * the largest step; only a handful of long compounds ever drop.
 */
export function labelSize(label: string): string {
  const longest = label.split(/\s+/).reduce((n, w) => Math.max(n, w.length), 0);
  const total = label.length;
  // Two ways to run out of room, and both have to be checked. A long WORD
  // overflows the box sideways; a long LABEL stacks into more lines, and a
  // taller box pushes its own corners out of the sector — which is how
  // "gunfights" ended up sliced down the middle on the amber wedge.
  //
  // The unit is `cqw` — a percentage of the WHEEL's own width — because the box
  // is a percentage of the wheel too. A breakpoint-based size cannot hold: the
  // desktop wheel is about a tenth wider than the phone's, so any `sm:` step
  // that reads as a real increase outgrows the box it has to fit inside, which
  // is precisely how "documentary" came to be 92px of word in an 87px box.
  // Measured against the bank's longest words, bold and tracking-tight: a
  // character is ~0.61em, so 11 of them have to stay inside the 22cqw box.
  if (longest >= 11 || total >= 23) return '3.15cqw';
  if (longest >= 9 || total >= 17) return '3.45cqw';
  return '4.1cqw';
}

/**
 * A wedge as a positioned, sector-shaped button.
 *
 * The element is sized to the sector's own bounding box rather than to the whole
 * wheel, then `clip-path` carves the sector out of it. Both halves matter: the
 * clip is what makes the tap area the actual wedge (so neighbouring wedges never
 * steal each other's taps), and the tight box is what makes the element's centre
 * land INSIDE its own sector — which is what a pointer-driven click, a browser's
 * own hit testing, and every automated tap all assume.
 *
 * `clip-path` has no arcs, so the curves are sampled; eight steps is well past
 * the point where the eye can see the flats at this size.
 */
function wedgeGeometry(index: number, count: number) {
  const { start, end, mid } = angles(index, count);
  const gap = GAP_DEG * RAD;
  const a0 = start + gap;
  const a1 = end - gap;
  const steps = 8;
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  for (let s = 0; s <= steps; s++) {
    const a = a0 + ((a1 - a0) * s) / steps;
    outer.push([px(HIT_OUTER, a), py(HIT_OUTER, a)]);
    inner.push([px(HIT_INNER, a), py(HIT_INNER, a)]);
  }
  const all = [...outer, ...inner];
  const minX = Math.min(...all.map(([x]) => x));
  const maxX = Math.max(...all.map(([x]) => x));
  const minY = Math.min(...all.map(([, y]) => y));
  const maxY = Math.max(...all.map(([, y]) => y));
  const w = maxX - minX;
  const h = maxY - minY;
  /** Wheel coordinates → this element's own 0–100% box. */
  const local = (x: number, y: number) => [((x - minX) / w) * 100, ((y - minY) / h) * 100] as const;
  const ring = [...outer, ...[...inner].reverse()]
    .map(([x, y]) => {
      const [lx, ly] = local(x, y);
      return `${lx.toFixed(2)}% ${ly.toFixed(2)}%`;
    })
    .join(', ');

  const [labelX, labelY] = local(px(LABEL_R, mid), py(LABEL_R, mid));

  return {
    box: { left: `${minX}%`, top: `${minY}%`, width: `${w}%`, height: `${h}%` },
    clipPath: `polygon(${ring})`,
    label: { left: `${labelX}%`, top: `${labelY}%`, width: `${(LABEL_W / w) * 100}%` },
  };
}

export function Wheel({
  readings,
  slots = [],
  known,
  compact,
  center,
}: {
  readings: FamilyReading[];
  slots?: WheelSlot[];
  /** 0..1 — drives the fallback centre readout. */
  known: number;
  compact?: boolean;
  /** What goes in the hub. The round's question, during play. */
  center?: ReactNode;
}) {
  const id = useId();
  const count = readings.length || 6;
  /** Buttons on screen — legibility outranks the extra dynamic range. */
  const playing = slots.length > 0;

  return (
    <div
      data-testid="rush-wheel"
      // Labels are sized in `cqw`, so the wheel has to be the query container:
      // type that scales with the wheel is the only kind that keeps fitting it.
      style={{ containerType: 'inline-size' }}
      className={`relative mx-auto aspect-square w-full ${
        compact ? 'max-w-[min(60vw,15rem)]' : 'max-w-[min(94vw,27rem)]'
      }`}
    >
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-labelledby={`${id}-title`}
        // The wedges above are the control; the picture must not eat their taps.
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <title id={`${id}-title`}>
          Your Verd1ct DNA wheel — {Math.round(known * 100)} percent known
        </title>
        {readings.map((r, i) => {
          const slot = slots.find((s) => s.familyId === r.id);
          const condemned = Boolean(slot?.selected && slot.negative);
          const { start, end } = angles(i, count);
          const gap = GAP_DEG * RAD;
          const a0 = start + gap;
          const a1 = end - gap;
          // A button face is a button face. Only the picture-mode wheel spends
          // its fill on confidence.
          const fill = playing ? 1 : 0.12 + r.confidence * 0.78;
          const affinityR = PAINT_IN + (r.affinity / 100) * 13;
          return (
            <g key={r.id}>
              <path
                d={arcPath(a0, a1, PAINT_IN, PAINT_OUT)}
                fill={r.accent}
                opacity={condemned ? 0.16 : fill}
                // A dark seam under the gap, so the cut between buttons is a
                // hard edge rather than two colours meeting.
                stroke="#070b16"
                strokeWidth={0.9}
                className="motion-safe:transition-all motion-safe:duration-200"
              />
              {/* Affinity, drawn only when the claim is worth making. */}
              {r.confidence > 0.15 && !slot?.selected && (
                <path
                  d={arcPath(a0, a1, PAINT_IN, affinityR)}
                  fill="#fff"
                  opacity={0.26}
                  className="motion-safe:transition-all motion-safe:duration-300"
                />
              )}
              {/* Selection: unmistakable, and never the same gesture as rejection. */}
              {slot?.selected && !slot.negative && (
                <path d={arcPath(a0, a1, PAINT_IN, PAINT_OUT)} fill="#fff" opacity={0.55} />
              )}
              {slot?.selected && (
                <path
                  d={arcPath(a0, a1, PAINT_IN, PAINT_OUT)}
                  fill="none"
                  stroke={slot.negative ? '#fb7185' : '#fff'}
                  strokeWidth={1.8}
                />
              )}
              {/* The confidence meter — its own channel, outside the button face. */}
              {playing && (
                <>
                  <path d={arcPath(a0, a1, METER_IN, METER_OUT)} fill="#fff" opacity={0.09} />
                  <path
                    d={arcPath(a0, a0 + (a1 - a0) * r.confidence, METER_IN, METER_OUT)}
                    fill={r.accent}
                    className="motion-safe:transition-all motion-safe:duration-300"
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/*
        THE ANSWERS, IN THE CIRCLE. Each button is clipped to its own sector, so
        the tap target is the whole wedge rather than the words inside it. The
        button paints nothing itself — the SVG above already renders the face and
        the selection — which is what lets the hit area run past the rim and
        across the gaps without the highlight spilling with it.
      */}
      {playing && (
        <ul className="absolute inset-0 list-none">
          {slots.map((slot, i) => {
            const reading = readings.find((r) => r.id === slot.familyId);
            const geo = wedgeGeometry(i, slots.length);
            const accent = reading?.accent ?? '#ffffff';
            // Selection whitens the face, so the ink has to follow it.
            const ink = slot.selected && !slot.negative ? INK_DARK : inkFor(accent);
            return (
              <li key={slot.familyId}>
                <button
                  type="button"
                  data-testid={`wheel-slot-${slot.familyId}`}
                  data-family={slot.familyId}
                  aria-pressed={slot.selected ?? false}
                  onClick={slot.onSelect}
                  style={{ ...geo.box, clipPath: geo.clipPath }}
                  className="group absolute bg-transparent focus:outline-none"
                >
                  <span
                    data-testid="wheel-label"
                    className={[
                      'absolute flex items-center justify-center rounded-lg text-center',
                      'font-black leading-[1.1] tracking-tight',
                      'motion-safe:transition-colors motion-safe:duration-150',
                      'group-focus-visible:ring-2 group-focus-visible:ring-white',
                      slot.negative && slot.selected ? 'line-through decoration-2' : '',
                    ].join(' ')}
                    style={{
                      ...geo.label,
                      transform: 'translate(-50%, -50%)',
                      fontSize: labelSize(slot.label),
                      color: slot.negative && slot.selected ? '#ffe4e6' : ink,
                      // Only light ink needs help; dark ink on a bright wedge is
                      // already past 7:1 and a shadow would only muddy it.
                      textShadow: ink === INK_LIGHT ? '0 1px 3px rgba(2,6,23,0.75)' : 'none',
                    }}
                  >
                    {slot.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        THE HUB — the question. Rendered last so it stacks above the wedges, and
        pointer-transparent so it can overlap the hit areas without stealing a tap
        that was aimed at a wedge.
      */}
      <div
        data-testid="rush-hub"
        className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#0b1020] text-center shadow-[0_0_28px_10px_rgba(11,16,32,0.95)]"
        style={{ width: `${INNER * 2}%`, height: `${INNER * 2}%` }}
      >
        <div className="flex w-full flex-col items-center justify-center px-[6%]">
          {center ?? (
            <>
              <span
                className="font-black tabular-nums text-white"
                style={{ fontSize: '7cqw', lineHeight: 1 }}
              >
                {Math.round(known * 100)}%
              </span>
              <span
                className="font-bold uppercase tracking-widest text-slate-400"
                style={{ fontSize: '2.2cqw' }}
              >
                Known
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
