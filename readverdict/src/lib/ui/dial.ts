// Pure geometry for the circular score dial. Kept separate from the component
// so the math is unit-tested and the SVG stays declarative.

export interface DialGeometry {
  /** SVG viewport size (square). */
  size: number;
  /** Stroke width of the ring. */
  stroke: number;
  /** Ring radius. */
  radius: number;
  /** Full circumference. */
  circumference: number;
  /** Length of the filled arc for the given score. */
  dash: number;
  /** Remaining (unfilled) arc length. */
  gap: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Compute the dial geometry for a 0–100 score. Out-of-range and NaN scores are
 * clamped so the arc never exceeds the ring or goes negative.
 */
export function dialGeometry(score: number, size = 132, stroke = 10): DialGeometry {
  const s = Number.isNaN(score) ? 0 : clamp(score, 0, 100);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (circumference * s) / 100;
  return {
    size,
    stroke,
    radius,
    circumference,
    dash,
    gap: circumference - dash,
  };
}
