import type { VerdictTier } from '@/lib/types';
import { tierHex } from './verdictStyle';

/** A circular 0–100 score dial coloured by verdict tier. Pure SVG, no client JS. */
export function ScoreDial({
  score,
  tier,
  size = 132,
}: {
  score: number;
  tier: VerdictTier;
  size?: number;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = c * pct;
  const hex = tierHex(tier);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`ReadVerdict score ${score} of 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#332b1f"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={hex}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fbf7ef"
        style={{ fontSize: size * 0.3, fontWeight: 700 }}
      >
        {score}
      </text>
      <text
        x="50%"
        y="66%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#6b5c44"
        style={{ fontSize: size * 0.1, fontWeight: 600, letterSpacing: '0.08em' }}
      >
        / 100
      </text>
    </svg>
  );
}
