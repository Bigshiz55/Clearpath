interface ScoreRingProps {
  score: number;
  label?: string;
  sublabel?: string;
  size?: number;
  accent?: 'brand' | 'gold' | 'auto';
}

function colorForScore(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 65) return '#a3e635';
  if (score >= 50) return '#facc15';
  if (score >= 35) return '#fb923c';
  return '#f87171';
}

export function ScoreRing({ score, label, sublabel, size = 116, accent = 'auto' }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const color =
    accent === 'brand' ? '#4f86ff' : accent === 'gold' ? '#e6ad33' : colorForScore(clamped);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 700ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-white">{clamped}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">/ 100</span>
        </div>
      </div>
      {label && <div className="mt-2 text-sm font-semibold text-white">{label}</div>}
      {sublabel && <div className="text-xs text-slate-400">{sublabel}</div>}
    </div>
  );
}
