/**
 * EMBEDDING PROVIDER INTERFACE (pure, no I/O in the default providers).
 *
 * The engine must run, and be testable, with NO external key. So embeddings go
 * through a provider interface with three implementations:
 *
 *   fixture  — deterministic vectors derived from a seed and the input text.
 *              These are NOT SEMANTIC. Two texts about the same subject get
 *              unrelated vectors. They exist to exercise and measure the vector
 *              code path, and nothing about recommendation quality may be
 *              inferred from them.
 *   disabled — returns null. The funnel must still produce a court.
 *   openai   — the real provider, wired but inert until a key exists.
 *
 * Every vector carries `semantic: false` unless a real model produced it, and
 * the diagnostic UI surfaces that flag, so a fixture run can never be mistaken
 * for a quality result.
 */

export const FIXTURE_DIMS = 32;

export interface EmbeddingVector {
  values: number[];
  dims: number;
  model: string;
  version: string;
  /** FALSE for fixtures. The single most important field in this file. */
  semantic: boolean;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly semantic: boolean;
  /** Null means "no vector available" — never a zero vector, which would score. */
  embed(text: string): Promise<EmbeddingVector | null>;
  embedBatch(texts: string[]): Promise<(EmbeddingVector | null)[]>;
}

/** xmur3 + sfc32: small, stable, well-distributed, no dependencies. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0, b = Math.imul(h, 1597334677) >>> 0, c = Math.imul(h, 2654435761) >>> 0, d = 1;
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Deterministic, non-semantic fixture vectors. Same text + seed always gives
 * the same unit vector, which is what makes a failing performance or ranking
 * test reproducible.
 */
export class FixtureEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'fixture-32d';
  readonly semantic = false;
  constructor(private readonly seed = 'wv-fixture-v1', private readonly dims = FIXTURE_DIMS) {}

  /**
   * Synchronous vector. The fixture computation has no I/O, and building a
   * 50,000-row catalog through Promises would be pointless overhead, so the
   * sync form is part of the public surface for this provider only.
   */
  vectorFor(text: string): EmbeddingVector {
    const rnd = seededRandom(`${this.seed}:${text}`);
    const values: number[] = [];
    let norm = 0;
    for (let i = 0; i < this.dims; i++) {
      const v = rnd() * 2 - 1;
      values.push(v);
      norm += v * v;
    }
    const len = Math.sqrt(norm) || 1;
    return {
      values: values.map((v) => v / len),
      dims: this.dims,
      model: this.name,
      version: 'fixture-1',
      semantic: false,
    };
  }

  async embed(text: string) { return text.trim() ? this.vectorFor(text) : null; }
  async embedBatch(texts: string[]) { return texts.map((t) => (t.trim() ? this.vectorFor(t) : null)); }
}

/** No embeddings at all. The funnel must degrade, not fail. */
export class DisabledEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'disabled';
  readonly semantic = false;
  async embed() { return null; }
  async embedBatch(texts: string[]) { return texts.map(() => null); }
}

/**
 * Real provider. Left unwired on purpose for this phase: it is selected only
 * when a key is present, and `getEmbeddingProvider` never picks it otherwise.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'text-embedding-3-small';
  readonly semantic = true;
  constructor(private readonly fetcher: (text: string) => Promise<number[] | null>) {}
  async embed(text: string): Promise<EmbeddingVector | null> {
    const v = await this.fetcher(text).catch(() => null);
    return v ? { values: v, dims: v.length, model: this.name, version: 'openai-3-small', semantic: true } : null;
  }
  async embedBatch(texts: string[]) { return Promise.all(texts.map((t) => this.embed(t))); }
}

export type ProviderKind = 'fixture' | 'disabled' | 'openai';

/**
 * Choose a provider. `openai` requires BOTH an explicit request and a real
 * fetcher — asking for it without a key falls back to fixtures rather than
 * silently producing nothing.
 */
export function getEmbeddingProvider(
  kind: ProviderKind,
  opts: { seed?: string; openaiFetcher?: (t: string) => Promise<number[] | null> } = {},
): EmbeddingProvider {
  if (kind === 'openai' && opts.openaiFetcher) return new OpenAIEmbeddingProvider(opts.openaiFetcher);
  if (kind === 'disabled') return new DisabledEmbeddingProvider();
  return new FixtureEmbeddingProvider(opts.seed);
}

/** Cosine similarity, guarding mismatched dims and zero vectors. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
