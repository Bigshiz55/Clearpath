'use server';

import { getBookRegistry } from '@/lib/providers';
import { providerBookToRef } from '@/lib/search/bookRef';
import type { BookRef } from '@/lib/store/types';
import type { DataState } from '@/lib/providers/types';

export interface SearchResponse {
  state: DataState;
  source: string;
  books: BookRef[];
  /** True when the answering provider is a labelled mock/fixture source. */
  isMock: boolean;
}

/** Search books across providers (real Open Library, mock fallback). */
export async function searchBooks(query: string): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) return { state: 'no_data', source: 'none', books: [], isMock: false };

  const registry = getBookRegistry();
  const result = await registry.search({ q, limit: 20 });
  const books = (result.data ?? []).map(providerBookToRef);
  return {
    state: result.state,
    source: result.source,
    books,
    isMock: result.source === 'mock',
  };
}

/** Fetch a single book by its internal workId (source:sourceId), for trial pages. */
export async function getBookByWorkId(workId: string): Promise<BookRef | null> {
  const [source, ...rest] = workId.split(':');
  const id = rest.join(':');
  const registry = getBookRegistry();

  if (source === 'openlibrary' && id) {
    const res = await registry.search({ q: `key:/works/${id}`, limit: 1 });
    const pb = res.data?.[0];
    return pb ? providerBookToRef(pb) : null;
  }
  if (source === 'isbn' && id) {
    const res = await registry.search({ isbn: id, limit: 1 });
    const pb = res.data?.[0];
    return pb ? providerBookToRef(pb) : null;
  }
  // Mock / title fallback: run a broad search and match by workId.
  const res = await registry.search({ q: id.replace(/-/g, ' '), limit: 20 });
  const pb = (res.data ?? []).map(providerBookToRef).find((b) => b.workId === workId);
  return pb ?? null;
}
