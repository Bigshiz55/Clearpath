// Provider registry: caching, retries with backoff, cross-provider fallback,
// and health aggregation. Time and delay are injectable so the logic is
// deterministically testable without real clocks or network.

import type {
  BookProvider,
  BookQuery,
  ProviderBook,
  ProviderHealth,
  ProviderResult,
} from './types';

export interface RegistryOptions {
  cacheTtlMs?: number;
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry {
  expires: number;
  result: ProviderResult<ProviderBook[]>;
}

const RETRYABLE = new Set(['provider_failure']);

export class ProviderRegistry {
  private readonly providers: BookProvider[];
  private readonly cacheTtl: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(providers: BookProvider[], opts: RegistryOptions = {}) {
    if (providers.length === 0) throw new Error('ProviderRegistry needs at least one provider');
    this.providers = providers;
    this.cacheTtl = opts.cacheTtlMs ?? 60 * 60 * 1000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** The primary (first) provider — what attribution defaults to. */
  get primary(): BookProvider {
    return this.providers[0]!;
  }

  private key(q: BookQuery): string {
    return JSON.stringify({
      q: q.q?.toLowerCase().trim() ?? '',
      title: q.title?.toLowerCase().trim() ?? '',
      author: q.author?.toLowerCase().trim() ?? '',
      isbn: q.isbn ?? '',
      limit: q.limit ?? 20,
    });
  }

  /**
   * Search across providers: cache first, then the primary with retries, then
   * fall back to the next provider on failure. Returns the first usable result
   * and records which source answered.
   */
  async search(q: BookQuery): Promise<ProviderResult<ProviderBook[]>> {
    const cacheKey = this.key(q);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > this.now()) return cached.result;

    let lastFailure: ProviderResult<ProviderBook[]> | null = null;

    for (const provider of this.providers) {
      const result = await this.withRetries(() => provider.search(q));
      if (result.state === 'ok' || result.state === 'no_data') {
        this.cache.set(cacheKey, { expires: this.now() + this.cacheTtl, result });
        return result;
      }
      lastFailure = result;
    }

    return (
      lastFailure ?? {
        state: 'provider_failure',
        data: null,
        source: this.primary.key,
        retrievedAt: new Date(this.now()).toISOString(),
        error: 'All providers failed',
      }
    );
  }

  private async withRetries(
    fn: () => Promise<ProviderResult<ProviderBook[]>>,
  ): Promise<ProviderResult<ProviderBook[]>> {
    let attempt = 0;
    let result = await safe(fn);
    while (RETRYABLE.has(result.state) && attempt < this.maxRetries) {
      attempt++;
      await this.sleep(2 ** attempt * 100);
      result = await safe(fn);
    }
    return result;
  }

  async health(): Promise<ProviderHealth[]> {
    return Promise.all(
      this.providers.map((p) =>
        p.health().catch(
          (): ProviderHealth => ({
            source: p.key,
            healthy: false,
            checkedAt: new Date(this.now()).toISOString(),
            note: 'health check threw',
          }),
        ),
      ),
    );
  }

  clearCache(): void {
    this.cache.clear();
  }
}

async function safe(
  fn: () => Promise<ProviderResult<ProviderBook[]>>,
): Promise<ProviderResult<ProviderBook[]>> {
  try {
    return await fn();
  } catch (err) {
    return {
      state: 'provider_failure',
      data: null,
      source: 'unknown',
      retrievedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
