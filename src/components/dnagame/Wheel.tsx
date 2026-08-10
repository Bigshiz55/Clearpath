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
 * THE ONE THING IT MUST NOT DO is conflate affinity with confidence. "We are
 * certain you dislike comedy" and "we know nothing about comedy" are opposite
 * states, and a single fill level renders them identically. So they get
 * different visual channels:
 *
 *   FILL / OPACITY  = confidence. How much of this wedge we have learned.
 *   INNER BAR       = affinity. Whether you like it, drawn only once there is
 *                     enough confidence for the claim to mean anything.
 *
 * ACCESSIBILITY IS NOT AN AFTERTHOUGHT, and putting the answers inside the
 * circle is exactly where a radial control normally loses it. It does not here.
 * Each wedge is a real <button> carrying its own text, in reading order and
 * keyboard-reachable; the sector is the hit area, not the words, so every target
 * is many times the 44px minimum even on a small phone. The focus ring is drawn
 * on the label rather than the button, because an outline on the button would be
 * clipped away by the sector shape. Colour never carries meaning alone —
 * position, label, the affinity bar and the selected state all say the same
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

/** Percent-of-box radii for the PAINTED wedge. The hub holds a question, so it is generous. */
const INNER = 25;
const OUTER = 50;

/**
 * The HIT area is deliberately wider than the paint: it reaches past the rim and
 * a little under the hub, so a thumb landing near an edge still counts, and so
 * a label near the outer corner of its sector is not clipped in half.
 */
const HIT_INNER = 21;
const HIT_OUTER = 52;

/** Where a wedge's label sits — centred in the meat of the sector. */
const LABEL_R = 35;
/** Label box width, as a percentage of the wheel. Sized to fit the narrowest sector. */
const LABEL_W = 28;

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

function wedgePath(index: number, count: number, inner: number, outer: number): string {
  const { start, end } = angles(index, count);
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
  const steps = 8;
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  for (let s = 0; s <= steps; s++) {
    const a = start + ((end - start) * s) / steps;
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
  const [dotX, dotY] = local(px(OUTER - 3.5, mid), py(OUTER - 3.5, mid));

  return {
    box: { left: `${minX}%`, top: `${minY}%`, width: `${w}%`, height: `${h}%` },
    clipPath: `polygon(${ring})`,
    label: { left: `${labelX}%`, top: `${labelY}%`, width: `${(LABEL_W / w) * 100}%` },
    dot: { left: `${dotX}%`, top: `${dotY}%` },
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

  return (
    <div
      data-testid="rush-wheel"
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
          // Confidence drives how solid the wedge is; a barely-known family is
          // a faint outline, a settled one is filled. Selection overrides it for
          // one beat — and an elimination DIMS rather than lights up, because
          // tapping to condemn must never look like tapping to choose.
          const solidity = 0.12 + r.confidence * 0.78;
          const affinityR = INNER + 2 + (r.affinity / 100) * 14;
          return (
            <g key={r.id}>
              <path
                d={wedgePath(i, count, INNER, OUTER)}
                fill={r.accent}
                opacity={slot?.selected ? (condemned ? 0.18 : 1) : solidity}
                stroke={slot?.selected ? (condemned ? '#fb7185' : '#fff') : 'rgba(255,255,255,0.18)'}
                strokeWidth={slot?.selected ? 1.4 : 0.5}
                className="motion-safe:transition-all motion-safe:duration-200"
              />
              {/* Affinity, drawn only when the claim is worth making. */}
              {r.confidence > 0.15 && !slot?.selected && (
                <path
                  d={wedgePath(i, count, INNER, affinityR)}
                  fill="#fff"
                  opacity={0.22}
                  className="motion-safe:transition-all motion-safe:duration-300"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/*
        THE ANSWERS, IN THE CIRCLE. Each button is clipped to its own sector, so
        the tap target is the whole wedge rather than the words inside it. The
        button paints nothing itself — the SVG above already renders selection —
        which is what lets the hit area run past the rim without the highlight
        spilling outside the circle.
      */}
      {slots.length > 0 && (
        <ul className="absolute inset-0 list-none">
          {slots.map((slot, i) => {
            const reading = readings.find((r) => r.id === slot.familyId);
            const geo = wedgeGeometry(i, slots.length);
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
                    className={[
                      'absolute flex items-center justify-center rounded-lg px-1 py-1 text-center',
                      'text-[0.72rem] font-bold leading-[1.15] tracking-tight sm:text-sm',
                      'motion-safe:transition-colors motion-safe:duration-150',
                      'group-focus-visible:ring-2 group-focus-visible:ring-white',
                      'group-active:bg-white/25',
                      slot.selected
                        ? slot.negative
                          ? 'text-rose-200 line-through decoration-rose-300 decoration-2'
                          : 'text-slate-950'
                        : 'text-white',
                    ].join(' ')}
                    style={{
                      ...geo.label,
                      transform: 'translate(-50%, -50%)',
                      textShadow: slot.selected && !slot.negative ? 'none' : '0 1px 3px rgba(2,6,23,0.9)',
                    }}
                  >
                    {slot.label}
                  </span>
                  {/* Colour never carries meaning alone — but it still helps. */}
                  <span
                    aria-hidden
                    className="absolute h-1.5 w-1.5 rounded-full"
                    style={{
                      ...geo.dot,
                      transform: 'translate(-50%, -50%)',
                      background: reading?.accent ?? '#fff',
                    }}
                  />
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
        className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#0b1020] text-center shadow-[0_0_28px_10px_rgba(11,16,32,0.95)]"
        style={{ width: `${INNER * 2}%`, height: `${INNER * 2}%` }}
      >
        <div className="flex w-full flex-col items-center justify-center px-2">
          {center ?? (
            <>
              <span className="text-xl font-black tabular-nums text-white sm:text-2xl">
                {Math.round(known * 100)}%
              </span>
              <span className="text-[0.55rem] font-bold uppercase tracking-widest text-slate-400">
                Known
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
