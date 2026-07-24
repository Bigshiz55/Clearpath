/**
 * Pure helpers for the owner founder-comparison view (PART 10). Given each
 * founder's top taste "leans" (endpoint labels like "Fast-paced", "Grounded"),
 * compute how much two founders' DNA overlaps and where they differ. No I/O.
 */

export interface LeanOverlap {
  shared: string[];
  onlyA: string[];
  onlyB: string[];
  /** Jaccard similarity 0..1 over the lean sets. */
  jaccard: number;
}

export function leanOverlap(a: readonly string[], b: readonly string[]): LeanOverlap {
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  const shared: string[] = [];
  for (const x of a) if (setB.has(x.toLowerCase()) && !shared.includes(x)) shared.push(x);
  const onlyA = a.filter((x) => !setB.has(x.toLowerCase()));
  const onlyB = b.filter((x) => !setA.has(x.toLowerCase()));
  const union = new Set([...setA, ...setB]).size;
  const inter = shared.length;
  return { shared, onlyA, onlyB, jaccard: union > 0 ? inter / union : 0 };
}

export interface PairwiseOverlap {
  aKey: string;
  bKey: string;
  overlap: LeanOverlap;
}

/** All unordered pairs' overlaps for a set of founders. */
export function pairwiseOverlaps(founders: { key: string; leans: string[] }[]): PairwiseOverlap[] {
  const out: PairwiseOverlap[] = [];
  for (let i = 0; i < founders.length; i++) {
    for (let j = i + 1; j < founders.length; j++) {
      const a = founders[i]!;
      const b = founders[j]!;
      out.push({ aKey: a.key, bKey: b.key, overlap: leanOverlap(a.leans, b.leans) });
    }
  }
  return out;
}
