'use client';

/**
 * THE LIVE TASTE-DNA CONSTELLATION.
 *
 * All 36 taste axes laid out as a radar/constellation. Each axis is a point on
 * its own spoke; the point rides OUTWARD as the interview grows confident about
 * it, GROWS with certainty, and takes its colour from disposition — warm green
 * for what you love, rose for what you avoid, cool grey while still unknown. The
 * whole thing is derived from the interview state and rendered straight into
 * SVG (positions transition in CSS), so it is correct on first paint and updates
 * on every turn without an animation loop.
 */
import {
  TASTE_CATEGORIES,
  CATEGORY_META,
  type InterviewState,
  type TasteCategory,
  type Sentiment,
} from '@/lib/voice/interview';

export interface ConstellationNode {
  category: TasteCategory;
  label: string;
  confidence: number;
  /** -1..1: loved ↔ avoided. */
  disposition: number;
}

function sentimentValue(s: Sentiment): number {
  switch (s) {
    case 'love':
      return 1;
    case 'like':
      return 0.5;
    case 'dislike':
      return -0.5;
    case 'hate':
      return -1;
    default:
      return 0;
  }
}

/**
 * Derive the live nodes from the interview state: confidence straight from the
 * confidence model, disposition as an evidence-weighted mean of the sentiments
 * that touched each axis. Pure — the orchestrator recomputes it each turn.
 */
export function constellationNodes(state: InterviewState): ConstellationNode[] {
  const acc: Record<string, { wv: number; w: number }> = {};
  for (const claim of state.claims) {
    const w = Math.max(0, claim.strength);
    if (w <= 0) continue;
    const v = sentimentValue(claim.sentiment);
    for (const cat of claim.categories) {
      const b = (acc[cat] ??= { wv: 0, w: 0 });
      b.wv += v * w;
      b.w += w;
    }
  }
  return TASTE_CATEGORIES.map((category) => {
    const b = acc[category];
    return {
      category,
      label: CATEGORY_META[category].label,
      confidence: state.confidence[category].confidence,
      disposition: b && b.w > 0 ? Math.max(-1, Math.min(1, b.wv / b.w)) : 0,
    };
  });
}

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const INNER = 26;
const OUTER = SIZE / 2 - 22;

function colorFor(disposition: number, confidence: number): string {
  if (confidence < 0.05) return 'rgba(148,163,184,0.35)';
  if (disposition > 0.15) return '#34d399'; // emerald — a love
  if (disposition < -0.15) return '#fb7185'; // rose — an avoid
  return '#7aa8ff'; // brand — known but neutral
}

export function DnaConstellation({ nodes }: { nodes: ConstellationNode[] }) {
  const n = nodes.length || 1;
  return (
    <div className="mx-auto w-full max-w-[320px]" data-testid="dna-constellation">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" role="img" aria-label="Your taste DNA, forming across 36 axes">
        {/* concentric guide rings */}
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} cx={CX} cy={CY} r={INNER + f * (OUTER - INNER)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ))}
        {nodes.map((node, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const r = INNER + node.confidence * (OUTER - INNER);
          const x = CX + Math.cos(angle) * r;
          const y = CY + Math.sin(angle) * r;
          const ex = CX + Math.cos(angle) * OUTER;
          const ey = CY + Math.sin(angle) * OUTER;
          const fill = colorFor(node.disposition, node.confidence);
          const dot = 1.5 + node.confidence * 5.5;
          const lit = node.confidence >= 0.35;
          return (
            <g key={node.category}>
              <line x1={CX} y1={CY} x2={ex} y2={ey} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
              <circle
                cx={x}
                cy={y}
                r={dot}
                fill={fill}
                opacity={0.25 + node.confidence * 0.75}
                style={{ transition: 'cx 600ms ease, cy 600ms ease, r 600ms ease, opacity 600ms ease, fill 400ms ease' }}
              />
              {lit ? (
                <text
                  x={CX + Math.cos(angle) * (OUTER + 8)}
                  y={CY + Math.sin(angle) * (OUTER + 8)}
                  fontSize="7"
                  fill="rgba(226,232,240,0.85)"
                  textAnchor={Math.cos(angle) > 0.2 ? 'start' : Math.cos(angle) < -0.2 ? 'end' : 'middle'}
                  dominantBaseline="middle"
                >
                  {node.label}
                </text>
              ) : null}
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={3} fill="rgba(255,255,255,0.35)" />
      </svg>
    </div>
  );
}
