'use client';

/**
 * THE VERD1CT DNA WHEEL.
 *
 * Two jobs at once: it is the picture of what we know about you, and — during
 * the radial rounds — it is the control you tap. Original geometry and
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
 * ACCESSIBILITY IS NOT AN AFTERTHOUGHT HERE. A radial control made of coloured
 * pie slices is close to the worst case for a screen reader and for anyone who
 * cannot distinguish the colours, so every wedge is a real <button> with a text
 * label, reachable by keyboard in reading order, and the colour never carries
 * meaning alone — position, label and the inner bar all say the same thing.
 * Reduced-motion users get the same wheel without the transitions.
 */

import { useId } from 'react';
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

function wedgePath(index: number, count: number, inner: number, outer: number): string {
  // Start at twelve o'clock so the first wedge reads as the top of a clock face.
  const start = (index / count) * TAU - Math.PI / 2;
  const end = ((index + 1) / count) * TAU - Math.PI / 2;
  const p = (r: number, a: number) => `${(50 + r * Math.cos(a)).toFixed(3)} ${(50 + r * Math.sin(a)).toFixed(3)}`;
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

export function Wheel({
  readings,
  slots = [],
  known,
  compact,
}: {
  readings: FamilyReading[];
  slots?: WheelSlot[];
  /** 0..1 — drives the centre readout. */
  known: number;
  compact?: boolean;
}) {
  const id = useId();
  const count = readings.length || 6;

  return (
    <div className="relative mx-auto w-full max-w-[min(78vw,22rem)]">
      <svg viewBox="0 0 100 100" role="img" aria-labelledby={`${id}-title`} className="w-full">
        <title id={`${id}-title`}>
          Your Verd1ct DNA wheel — {Math.round(known * 100)} percent known
        </title>
        {readings.map((r, i) => {
          const slot = slots.find((s) => s.familyId === r.id);
          // Confidence drives how solid the wedge is; a barely-known family is
          // a faint outline, a settled one is filled.
          const solidity = 0.12 + r.confidence * 0.78;
          const affinityR = 22 + (r.affinity / 100) * 16;
          return (
            <g key={r.id}>
              <path
                d={wedgePath(i, count, 20, 46)}
                fill={r.accent}
                opacity={slot?.selected ? 1 : solidity}
                stroke={slot?.selected ? '#fff' : 'rgba(255,255,255,0.18)'}
                strokeWidth={slot?.selected ? 1.4 : 0.5}
                className="motion-safe:transition-all motion-safe:duration-200"
              />
              {/* Affinity, drawn only when the claim is worth making. */}
              {r.confidence > 0.15 && (
                <path
                  d={wedgePath(i, count, 20, affinityR)}
                  fill="#fff"
                  opacity={0.22}
                  className="motion-safe:transition-all motion-safe:duration-300"
                />
              )}
            </g>
          );
        })}
        <circle cx="50" cy="50" r="19" fill="#0b1020" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6" />
        <text x="50" y="47" textAnchor="middle" className="fill-white" style={{ fontSize: 11, fontWeight: 700 }}>
          {Math.round(known * 100)}%
        </text>
        <text x="50" y="56" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 5 }}>
          KNOWN
        </text>
      </svg>

      {/*
        The tappable layer. Real buttons rather than SVG paths with click
        handlers: they are focusable, announce their label, and give a target
        far bigger than a thin wedge — a radial hit area is a poor thumb target
        on a phone, and preserving a perfect circle is not worth losing taps to.
      */}
      {slots.length > 0 && (
        <ul className={`mt-4 grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {slots.map((slot) => {
            const reading = readings.find((r) => r.id === slot.familyId);
            return (
              <li key={slot.familyId}>
                <button
                  type="button"
                  data-testid={`wheel-slot-${slot.familyId}`}
                  data-family={slot.familyId}
                  aria-pressed={slot.selected ?? false}
                  onClick={slot.onSelect}
                  className={[
                    'flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold',
                    'min-h-[3.25rem] motion-safe:transition-colors motion-safe:duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                    slot.selected
                      ? slot.negative
                        ? 'bg-rose-500/25 text-rose-100 ring-2 ring-rose-300'
                        : 'bg-white/90 text-slate-950'
                      : 'bg-white/10 text-white active:bg-white/25',
                  ].join(' ')}
                >
                  {/* Colour never carries meaning alone. */}
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: reading?.accent ?? '#fff' }}
                  />
                  <span className="leading-tight">{slot.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
