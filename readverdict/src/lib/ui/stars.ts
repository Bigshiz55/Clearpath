// Pure star-rating decomposition. Given a 0–5 value, returns how many stars are
// full, half, or empty — rounded to the nearest half. Total is always 5.

export interface StarBreakdown {
  full: number;
  half: 0 | 1;
  empty: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const MAX_STARS = 5;

export function starBreakdown(value: number): StarBreakdown {
  const v = Number.isNaN(value) ? 0 : clamp(value, 0, MAX_STARS);
  const rounded = Math.round(v * 2) / 2; // nearest half
  const full = Math.floor(rounded);
  const half: 0 | 1 = rounded - full === 0.5 ? 1 : 0;
  const empty = MAX_STARS - full - half;
  return { full, half, empty };
}
