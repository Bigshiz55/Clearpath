/**
 * IS THIS AXIS WORTH KEEPING? — measured, not asserted.
 *
 * A taste vocabulary is a set of claims about what people differ on, and the
 * cheap failure is to keep every word anyone thought of. Forty-four axes sound
 * richer than fifteen; they are only richer if the system can actually TELL THEM
 * APART, and an axis nothing can distinguish from its neighbour is not extra
 * resolution — it is the same belief written twice, splitting the evidence that
 * should have accumulated in one place and halving the confidence in both.
 *
 * So the criterion here is SEPARABILITY, not correlation.
 *
 * Correlation says "these two tend to move together in this corpus". That is
 * suggestive and it is not decisive: `horrorTolerance` correlates hard with
 * `darkness` and `violence` precisely because horror films are dark and violent,
 * and yet the distinction is real — plenty of people want the dread without the
 * gore, or the bleakness without the fear. Merging on correlation alone is how
 * you lose exactly the traits that matter most.
 *
 * Separability asks the operational question instead: IS THERE A PAIR OF TITLES
 * IN THE CORPUS THAT SPLITS THESE TWO AXES IN OPPOSITE DIRECTIONS? If such a
 * pair exists, the game can put it on screen and the answer distinguishes them.
 * If no such pair exists, no observation this instrument can make will ever tell
 * them apart, and keeping both is a promise the data cannot honour.
 *
 * That criterion is honest about its own limits: it measures the CORPUS, not the
 * world. An axis that fails separability today may become separable when the
 * catalogue grows, which is why the audit runs over a supplied corpus and is
 * re-runnable rather than baked into a constant.
 *
 * PURE. No I/O, no clock, no randomness.
 */

/** One title's position on the axes it asserts, signed, roughly -1..1. */
export interface AxisVector {
  id: string;
  values: Readonly<Record<string, number>>;
}

/** How strongly a title must express an axis for it to count as a real signal. */
export const MEANINGFUL = 0.3;

/** How hard a pair must split an axis for that split to count as a separation. */
export const SPLIT = 0.5;

function valuesOf(corpus: readonly AxisVector[], key: string): number[] {
  return corpus.map((t) => t.values[key] ?? 0);
}

/** How many titles say anything meaningful about this axis. */
export function coverage(corpus: readonly AxisVector[], key: string): number {
  return valuesOf(corpus, key).filter((v) => Math.abs(v) >= MEANINGFUL).length;
}

/** Pearson correlation across the corpus. Context, never the verdict. */
export function correlation(corpus: readonly AxisVector[], a: string, b: string): number {
  const xs = valuesOf(corpus, a);
  const ys = valuesOf(corpus, b);
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a0 = xs[i]! - mx;
    const b0 = ys[i]! - my;
    num += a0 * b0;
    dx += a0 * a0;
    dy += b0 * b0;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

/**
 * THE VERDICT FUNCTION. How many title pairs split these two axes in OPPOSITE
 * directions — i.e. how many questions exist that a person could answer one way
 * for `a` and the other way for `b`.
 *
 * Zero means the corpus cannot tell them apart at all: every pair that moves one
 * moves the other the same way, so every answer is consistent with both
 * hypotheses and no amount of play will ever separate the beliefs.
 */
export function separatingPairs(
  corpus: readonly AxisVector[],
  a: string,
  b: string,
): number {
  let count = 0;
  for (let i = 0; i < corpus.length; i++) {
    for (let j = i + 1; j < corpus.length; j++) {
      const ti = corpus[i]!;
      const tj = corpus[j]!;
      const da = (ti.values[a] ?? 0) - (tj.values[a] ?? 0);
      const db = (ti.values[b] ?? 0) - (tj.values[b] ?? 0);
      if (Math.abs(da) < SPLIT || Math.abs(db) < SPLIT) continue;
      if (Math.sign(da) !== Math.sign(db)) count++;
    }
  }
  return count;
}

/**
 * The minimum number of separating pairs an axis needs to be demonstrably
 * distinguishable from another.
 *
 * Not 1: a single separating pair is one lucky title, and the planner may never
 * deal it. Eight means the distinction survives the pool being sampled, and is
 * reachable in a twenty-round session more often than not.
 */
export const MIN_SEPARATING_PAIRS = 8;

/**
 * SEPARATION ALONE IS NOT A VERDICT, and the first version of this file thought
 * it was. Running it over the real catalogue returned `sep=0` for `warmth` vs
 * `serialized`, `emotion` vs `serialized`, `romance` vs `serialized` — which
 * would have merged three obviously distinct axes into one. The correlations
 * were 0.10, 0.12, 0.12.
 *
 * The cause is sparsity, not redundancy. A separating pair needs BOTH axes to
 * split hard in the same pair of titles, and two thinly-annotated axes rarely
 * co-occur that strongly however different they are. Zero separating pairs at
 * r=0.10 means "the corpus never asked" — a hole in the instrument. Zero at
 * r=0.88 (which is what `international` vs `subtitles` actually returns) means
 * "the corpus cannot tell them apart" — a genuine merge.
 *
 * So redundancy requires both: no separating evidence AND the two axes moving
 * together. 0.75 because r² = 0.56 there — a quarter of the movement is still
 * unexplained below it, which is too much to throw away on a corpus this size.
 */
export const REDUNDANT_CORRELATION = 0.75;

export type AxisRelation = 'independent' | 'redundant' | 'under-determined';

export function relate(
  corpus: readonly AxisVector[],
  a: string,
  b: string,
): { separating: number; correlation: number; relation: AxisRelation } {
  const separating = separatingPairs(corpus, a, b);
  const r = correlation(corpus, a, b);
  const relation: AxisRelation =
    separating >= MIN_SEPARATING_PAIRS
      ? 'independent'
      : Math.abs(r) >= REDUNDANT_CORRELATION
        ? 'redundant'
        : 'under-determined';
  return { separating, correlation: r, relation };
}

export interface AxisAudit {
  key: string;
  coverage: number;
  /** The retained axis it is hardest to distinguish from, and by how little. */
  nearest: { key: string; separating: number; correlation: number } | null;
  /** Axes this one genuinely duplicates. Non-empty means merge. */
  redundantWith: string[];
  /**
   * Axes the corpus cannot yet separate it from, but which it does not track.
   * A REPORTED HOLE, not a merge — the fix is more annotated titles.
   */
  underDetermined: string[];
  /** No axis in the set duplicates it. */
  independent: boolean;
}

/** Audit a whole proposed vocabulary against a corpus. */
export function auditAxes(
  corpus: readonly AxisVector[],
  keys: readonly string[],
): AxisAudit[] {
  return keys.map((key) => {
    let nearest: AxisAudit['nearest'] = null;
    const redundantWith: string[] = [];
    const underDetermined: string[] = [];
    for (const other of keys) {
      if (other === key) continue;
      const { separating, correlation: r, relation } = relate(corpus, key, other);
      if (relation === 'redundant') redundantWith.push(other);
      if (relation === 'under-determined') underDetermined.push(other);
      if (!nearest || separating < nearest.separating) {
        nearest = { key: other, separating, correlation: r };
      }
    }
    return {
      key,
      coverage: coverage(corpus, key),
      nearest,
      redundantWith,
      underDetermined,
      independent: redundantWith.length === 0,
    };
  });
}

/**
 * Axes the corpus cannot support yet — the "automated detection of missing trait
 * coverage" the classification pipeline needs.
 *
 * REPORTED, NOT SILENTLY DROPPED. An axis with three titles behind it is a real
 * hole in the instrument, and the fix is more titles, not a smaller vocabulary.
 */
export const MIN_COVERAGE = 6;

export function underCovered(
  corpus: readonly AxisVector[],
  keys: readonly string[],
): Array<{ key: string; coverage: number }> {
  return keys
    .map((key) => ({ key, coverage: coverage(corpus, key) }))
    .filter((a) => a.coverage < MIN_COVERAGE)
    .sort((a, b) => a.coverage - b.coverage);
}
