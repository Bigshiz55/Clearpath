'use client';

/**
 * THE CONFIDENCE DIAL.
 *
 * A single, calm SVG ring that fills as the interview learns you, 0 → the 95%
 * completion bar. It renders its value directly into the markup (the fill is a
 * CSS-transitioned stroke, not a JS animation loop), so it is correct on first
 * paint — no flash of an empty ring — and provable in a static render test.
 */
import { COMPLETION_CONFIDENCE } from '@/lib/voice/interview';

const SIZE = 132;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export function ConfidenceMeter({ value, label = 'Confidence' }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(clamped * 100);
  const barPct = Math.round(COMPLETION_CONFIDENCE * 100);
  const ready = clamped >= COMPLETION_CONFIDENCE;
  const dash = C * (1 - clamped);

  return (
    <div
      className="flex flex-col items-center"
      data-testid="confidence-meter"
      role="img"
      aria-label={`${label}: ${pct} percent of ${barPct} percent needed`}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={ready ? '#22c55e' : '#4f86ff'}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={dash}
            style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1), stroke 400ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black tabular-nums text-white" data-testid="confidence-value">
            {pct}
            <span className="text-lg text-slate-400">%</span>
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${ready ? 'text-emerald-300' : 'text-slate-400'}`}>
            {ready ? 'Ready' : label}
          </span>
        </div>
      </div>
    </div>
  );
}
