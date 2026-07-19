/**
 * WatchVrdIQt DNA Score — the math (pure, deterministic, no I/O).
 *
 * The idea: represent every title as a "vibe vector" (an embedding of its
 * meaning) and every user as a "Taste-DNA" — the centroid of what they've rated
 * highly, minus what they've panned. A new title's DNA Score is how close its
 * vibe sits to your Taste-DNA, calibrated into a 0..100 "odds you'll love it"
 * and blended with the objective quality by how much of your data we have.
 *
 * All functions here are pure so they're unit-tested and never touched by AI —
 * the embeddings feeding them are deterministic, so the score is authoritative.
 */

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Cosine similarity of two equal-length vectors, in [-1, 1]. 0 if degenerate. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Weighted average of vectors (their centroid). Null when nothing qualifies. */
export function weightedCentroid(samples: Array<{ vector: number[]; weight: number }>): number[] | null {
  const valid = samples.filter((s) => s.weight > 0 && s.vector.length > 0);
  if (valid.length === 0) return null;
  const dim = valid[0]!.vector.length;
  const out = new Array<number>(dim).fill(0);
  let wsum = 0;
  for (const s of valid) {
    for (let i = 0; i < dim; i++) out[i]! += (s.vector[i] ?? 0) * s.weight;
    wsum += s.weight;
  }
  if (wsum === 0) return null;
  for (let i = 0; i < dim; i++) out[i]! /= wsum;
  return out;
}

export interface TasteDna {
  liked: number[] | null; // centroid of highly-rated titles' vibe vectors
  disliked: number[] | null; // centroid of panned titles' vibe vectors
  sampleSize: number; // how many rated titles fed the model
}

/**
 * Build a user's Taste-DNA from their rated titles. Loves (rating ≥ 7) pull the
 * `liked` centroid, weighted by how much they loved it; pans (≤ 4) pull the
 * `disliked` centroid. Middling ratings are ignored (weak signal).
 */
export function buildTasteDna(rated: Array<{ vector: number[]; rating: number }>): TasteDna {
  const liked = weightedCentroid(
    rated.filter((r) => r.rating >= 7).map((r) => ({ vector: r.vector, weight: r.rating - 6 })),
  );
  const disliked = weightedCentroid(
    rated.filter((r) => r.rating <= 4).map((r) => ({ vector: r.vector, weight: 5 - r.rating })),
  );
  return { liked, disliked, sampleSize: rated.length };
}

export interface DnaResult {
  score: number; // 0..100 odds you'll love it
  confidence: number; // 0..1 — how much of the number is your taste vs. objective
  tasteScore: number | null; // the pure taste-fit signal (null when no taste data)
}

/**
 * The most weight the taste signal is ever allowed in the blend, even at full
 * confidence. Capping it below 1 means the objective Quality score NEVER drops
 * out — a title you'd love but that's objectively weak still scores below an
 * equally-loved great one. (Before this cap the blend collapsed to 100% taste at
 * full confidence, so Quality stopped moving the number.)
 */
export const MAX_TASTE_WEIGHT = 0.6;

/**
 * The DNA Score for a title given a user's Taste-DNA and the objective quality.
 * With little history it leans on objective quality; with more, it leans on your
 * proven taste — so the number sharpens the more you rate.
 *
 * `confidence` ramps to full at ~`fullAt` rated titles. The taste signal uses a
 * liked-vs-disliked differential when both centroids exist (most robust), else a
 * calibrated liked-similarity. Constants are v1 and will be tuned against real
 * rating outcomes.
 */
export function dnaScore(
  titleVector: number[] | null,
  dna: TasteDna,
  objectiveScore: number,
  fullAt = 20,
): DnaResult {
  if (!titleVector || titleVector.length === 0) {
    return { score: clamp(Math.round(objectiveScore)), confidence: 0, tasteScore: null };
  }
  const confidence = clamp(dna.sampleSize / fullAt, 0, 1);

  let tasteScore: number | null = null;
  if (dna.liked && dna.disliked) {
    const signal = cosine(titleVector, dna.liked) - cosine(titleVector, dna.disliked);
    tasteScore = clamp(50 + 50 * Math.tanh(signal * 6));
  } else if (dna.liked) {
    // Related content typically sits ~0.15–0.60 cosine; stretch that to 0..100.
    const sim = cosine(titleVector, dna.liked);
    tasteScore = clamp(((sim - 0.15) / 0.45) * 100);
  }

  if (tasteScore == null) {
    return { score: clamp(Math.round(objectiveScore)), confidence: 0, tasteScore: null };
  }
  // Taste weight ramps with confidence but is capped so Quality always counts.
  const tasteWeight = confidence * MAX_TASTE_WEIGHT;
  const blended = tasteWeight * tasteScore + (1 - tasteWeight) * objectiveScore;
  return { score: clamp(Math.round(blended)), confidence, tasteScore: clamp(Math.round(tasteScore)) };
}
