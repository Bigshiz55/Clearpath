import { dialGeometry } from '@/lib/ui/dial';
import type { VerdictTier } from '@/lib/verdict/tiers';

// Hex per tier, matching the tailwind `verdict.*` tokens.
const tierHex: Record<VerdictTier, string> = {
  'Must Read': '#3fb27f',
  'Strong Yes': '#79c06a',
  'Worth a Look': '#c6b24a',
  Maybe: '#d59440',
  'Probably Pass': '#c96f63',
};

/** Circular 0–100 score dial, coloured by verdict tier. Pure SVG, no client JS. */
export function ScoreDial({
  score,
  tier,
  size = 132,
}: {
  score: number;
  tier: VerdictTier;
  size?: number;
}) {
  const g = dialGeometry(score, size, 10);
  const hex = tierHex[tier];
  const shown = Math.max(0, Math.min(100, Math.round(Number.isNaN(score) ? 0 : score)));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`ReadVerdict score ${shown} of 100 — ${tier}`}
    >
      <circle cx={size / 2} cy={size / 2} r={g.radius} fill="none" stroke="#22242f" strokeWidth={g.stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={g.radius}
        fill="none"
        stroke={hex}
        strokeWidth={g.stroke}
        strokeLinecap="round"
        strokeDasharray={`${g.dash} ${g.gap}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fbfaf6"
        style={{ fontSize: size * 0.3, fontWeight: 700 }}
      >
        {shown}
      </text>
      <text
        x="50%"
        y="66%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#a6a292"
        style={{ fontSize: size * 0.1, fontWeight: 600, letterSpacing: '0.08em' }}
      >
        / 100
      </text>
    </svg>
  );
}
