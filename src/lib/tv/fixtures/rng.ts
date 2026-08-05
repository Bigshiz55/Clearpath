/**
 * DETERMINISM, FROM ONE SEED.
 *
 * The fixture corpus has to be byte-identical every time it is generated, on
 * every machine, forever. Not "close enough" — identical, because a test that
 * asserts "50,000 titles including one with a colliding alias at index 41,203"
 * is worthless if the corpus shifts underneath it.
 *
 * `Math.random()` cannot do that. Neither can anything that touches wall-clock
 * time, and the whole fixture layer is forbidden from both (there is a test
 * that reads the source and enforces it).
 *
 * What is here instead: SplitMix64, chosen because it is
 *   - tiny and exactly specified, so any reimplementation agrees;
 *   - splittable — `derive('offers')` produces an independent stream, so
 *     adding episode generation cannot shift the offer stream by one draw and
 *     silently change 500,000 downstream rows; and
 *   - fast enough that a million draws is not a coffee break.
 *
 * The splittability is the part that matters in practice. A single shared
 * stream makes the corpus fragile in a way that only shows up as a mystifying
 * diff three commits later.
 */

const MASK = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;

export class Rng {
  private state: bigint;

  constructor(seed: bigint | number | string) {
    this.state = typeof seed === 'bigint' ? seed & MASK : Rng.hash(String(seed));
  }

  /** FNV-1a over the string, so a human-readable seed is usable directly. */
  static hash(text: string): bigint {
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < text.length; i++) {
      h ^= BigInt(text.charCodeAt(i));
      h = (h * 0x100000001b3n) & MASK;
    }
    return h;
  }

  /**
   * A NAMED, INDEPENDENT SUB-STREAM. `derive('episodes')` always yields the
   * same stream for a given parent seed, and consuming it never perturbs the
   * parent or any sibling.
   */
  derive(label: string): Rng {
    return new Rng((this.state ^ Rng.hash(label)) & MASK);
  }

  /** Raw 64-bit draw (SplitMix64). */
  next(): bigint {
    this.state = (this.state + GOLDEN) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return (z ^ (z >> 31n)) & MASK;
  }

  /** [0, 1). 53 bits of mantissa, the most a double can carry honestly. */
  float(): number {
    return Number(this.next() >> 11n) / 2 ** 53;
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max ${max} < min ${min}`);
    const span = BigInt(max - min + 1);
    return min + Number(this.next() % span);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)]!;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /**
   * Weighted pick. Weights need not sum to 1; they are normalised. Used for
   * things like offer-type mix, where a realistic corpus is mostly
   * subscription with a long tail of rentals rather than a uniform spread.
   */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.float() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  /** Fisher–Yates, in place, deterministic. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
