import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from './registry';
import { mapDoc } from './openLibrary';
import { mockProvider } from './mock';
import { providerBookToWork } from './normalize';
import type { BookProvider, ProviderBook, ProviderResult } from './types';

const NOW = '2026-07-23T00:00:00.000Z';
const noSleep = () => Promise.resolve();

function failing(key: string): BookProvider {
  return {
    key,
    displayName: key,
    async search(): Promise<ProviderResult<ProviderBook[]>> {
      return { state: 'provider_failure', data: null, source: key, retrievedAt: NOW, error: 'boom' };
    },
    async health() {
      return { source: key, healthy: false, checkedAt: NOW };
    },
  };
}

describe('Open Library mapDoc', () => {
  it('maps a doc and canonicalizes ISBNs', () => {
    const book = mapDoc({
      key: '/works/OL123W',
      title: 'Dune',
      author_name: ['Frank Herbert'],
      first_publish_year: 1965,
      isbn: ['0441013597', 'bad'],
      ratings_average: 4.2,
      ratings_count: 500,
      cover_i: 42,
    });
    expect(book?.title).toBe('Dune');
    expect(book?.sourceId).toBe('OL123W');
    expect(book?.isbn13).toBe('9780441013593');
    expect(book?.rating).toEqual({ average: 4.2, count: 500 });
    expect(book?.coverUrl).toContain('/b/id/42-M.jpg');
  });

  it('returns null for a doc with no title and no fake rating for 0 count', () => {
    expect(mapDoc({ author_name: ['x'] })).toBeNull();
    const b = mapDoc({ title: 'X', ratings_average: 4, ratings_count: 0 });
    expect(b?.rating).toBeNull();
  });
});

describe('ProviderRegistry', () => {
  it('falls back to the next provider when the primary fails', async () => {
    const reg = new ProviderRegistry([failing('primary'), mockProvider], {
      now: () => 0,
      sleep: noSleep,
    });
    const res = await reg.search({ q: 'gone girl' });
    expect(res.state).toBe('ok');
    expect(res.source).toBe('mock');
  });

  it('retries a failing provider up to maxRetries then gives up', async () => {
    let calls = 0;
    const flaky: BookProvider = {
      key: 'flaky',
      displayName: 'flaky',
      async search(): Promise<ProviderResult<ProviderBook[]>> {
        calls++;
        return { state: 'provider_failure', data: null, source: 'flaky', retrievedAt: NOW };
      },
      async health() {
        return { source: 'flaky', healthy: false, checkedAt: NOW };
      },
    };
    const reg = new ProviderRegistry([flaky], { maxRetries: 2, now: () => 0, sleep: noSleep });
    const res = await reg.search({ q: 'x' });
    expect(res.state).toBe('provider_failure');
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('caches successful results by query', async () => {
    let calls = 0;
    const counting: BookProvider = {
      key: 'c',
      displayName: 'c',
      async search(): Promise<ProviderResult<ProviderBook[]>> {
        calls++;
        return { state: 'ok', data: [], source: 'c', retrievedAt: NOW };
      },
      async health() {
        return { source: 'c', healthy: true, checkedAt: NOW };
      },
    };
    const reg = new ProviderRegistry([counting], { now: () => 1000, sleep: noSleep });
    await reg.search({ q: 'dune' });
    await reg.search({ q: 'dune' });
    expect(calls).toBe(1);
  });
});

describe('normalize provider book → work', () => {
  it('produces a work + edition with provenance-tagged fields', async () => {
    const res = await mockProvider.search({ q: 'silent patient' });
    const pb = res.data![0]!;
    const work = providerBookToWork(pb, NOW);
    expect(work.title).toBe('The Silent Patient');
    expect(work.editions).toHaveLength(1);
    expect(work.editions[0]!.isbn13).toBe('9781250301697');
    expect(work.editions[0]!.rating?.provenance.source).toBe('mock');
    expect(work.firstPublishYear?.value).toBe(2019);
  });
});
