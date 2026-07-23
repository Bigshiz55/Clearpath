// Mapping between a provider result and the compact BookRef used across the UI
// and local store. Pure — safe on client and server.

import { titleKey } from '@/lib/domain/entityResolution';
import type { ProviderBook } from '@/lib/providers/types';
import type { BookRef } from '@/lib/store/types';

export function workIdOf(pb: Pick<ProviderBook, 'source' | 'sourceId' | 'isbn13' | 'title' | 'authors'>): string {
  if (pb.sourceId) return `${pb.source}:${pb.sourceId}`;
  if (pb.isbn13) return `isbn:${pb.isbn13}`;
  return `t:${titleKey(pb.title)}:${(pb.authors[0] ?? '').toLowerCase()}`;
}

export function providerBookToRef(pb: ProviderBook): BookRef {
  return {
    workId: workIdOf(pb),
    title: pb.title,
    author: pb.authors[0] ?? null,
    year: pb.firstPublishYear,
    coverUrl: pb.coverUrl,
    isbn13: pb.isbn13,
    subjects: pb.subjects,
    pageCount: pb.pageCount,
    rating: pb.rating,
    source: pb.source,
  };
}

/** Reconstruct a minimal ProviderBook from a stored BookRef (to build a trial). */
export function refToProviderBook(ref: BookRef): ProviderBook {
  const sourceId = ref.workId.includes(':') ? ref.workId.split(':').slice(1).join(':') : null;
  return {
    source: ref.source,
    sourceId,
    title: ref.title,
    subtitle: null,
    authors: ref.author ? [ref.author] : [],
    firstPublishYear: ref.year,
    isbn13: ref.isbn13,
    isbn10: null,
    coverUrl: ref.coverUrl,
    subjects: ref.subjects,
    languages: [],
    pageCount: ref.pageCount,
    rating: ref.rating,
  };
}
