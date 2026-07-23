import 'server-only';

import { ProviderRegistry } from './registry';
import { openLibraryProvider } from './openLibrary';
import { mockProvider } from './mock';

// Composition root for book-data providers. Open Library is the real primary;
// the mock provider is a labelled fallback so search still returns something
// (clearly marked) when the network is unavailable. Additional licensed
// providers (Google Books, ISBNdb, audiobook/library sources) slot in here as
// adapters without touching product code — see docs/PROVIDERS.md.

let registry: ProviderRegistry | null = null;

export function getBookRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry([openLibraryProvider, mockProvider], {
      cacheTtlMs: 60 * 60 * 1000,
      maxRetries: 2,
    });
  }
  return registry;
}

export type { BookProvider, BookQuery, ProviderBook, ProviderResult, DataState } from './types';
export { providerBookToWork } from './normalize';
