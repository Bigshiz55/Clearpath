/**
 * Deterministic, seedable PRNG so any run can be reproduced exactly from its
 * seed (Phase 3 requirement). mulberry32 — small, fast, good enough for test
 * generation. Never uses Math.random.
 */
export interface Rng {
  next(): number; // [0,1)
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  bool(p?: number): boolean;
  /** Fisher–Yates shuffle (copy). */
  shuffle<T>(arr: readonly T[]): T[];
  /** Pick k distinct items. */
  sample<T>(arr: readonly T[], k: number): T[];
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
    bool: (p = 0.5) => next() < p,
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    sample: (arr, k) => rng.shuffle(arr).slice(0, Math.min(k, arr.length)),
  };
  return rng;
}
