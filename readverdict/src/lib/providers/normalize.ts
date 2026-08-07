// Pure normalization from a provider's ProviderBook into the canonical domain
// Work + Edition, attaching provenance & confidence to sourced fields. No I/O.

import { sourced } from '@/lib/domain/provenance';
import { confidenceFromSample } from '@/lib/domain/confidence';
import { emptyBookDna, type Edition, type Work } from '@/lib/domain/book';
import { titleKey } from '@/lib/domain/entityResolution';
import type { ProviderBook } from './types';

/** Stable-ish work id derived from the strongest identifier available. */
function workId(pb: ProviderBook): string {
  if (pb.sourceId) return `${pb.source}:${pb.sourceId}`;
  if (pb.isbn13) return `isbn:${pb.isbn13}`;
  return `t:${titleKey(pb.title)}:${(pb.authors[0] ?? '').toLowerCase()}`;
}

export function providerBookToWork(pb: ProviderBook, now: string): Work {
  const id = workId(pb);
  const prov = { source: pb.source, sourceRecordId: pb.sourceId, retrievedAt: now };

  const edition: Edition = {
    id: `${id}#ed`,
    workId: id,
    format: 'other',
    isbn13: pb.isbn13,
    isbn10: pb.isbn10,
    altIds: pb.sourceId ? [{ scheme: `${pb.source}-work`, value: pb.sourceId }] : [],
    language: pb.languages[0] ?? null,
    pageCount:
      pb.pageCount != null
        ? sourced(pb.pageCount, 'sourced', 0.7, { ...prov, editionScope: `${id}#ed` })
        : null,
    coverUrl: pb.coverUrl,
    rating: pb.rating
      ? sourced(
          { average: pb.rating.average, count: pb.rating.count, scaleMax: 5 as const },
          'sourced',
          confidenceFromSample(pb.rating.count),
          prov,
        )
      : null,
    narrators: [],
    availability: [],
  };

  return {
    id,
    title: pb.title,
    subtitle: pb.subtitle,
    originalTitle: null,
    contributors: pb.authors.map((name, i) => ({
      person: { id: `p:${name.toLowerCase()}`, name },
      role: 'author',
      order: i,
    })),
    series: null,
    firstPublishYear:
      pb.firstPublishYear != null
        ? sourced(pb.firstPublishYear, 'sourced', 0.7, prov)
        : null,
    originalLanguage: pb.languages[0] ?? null,
    subjects: pb.subjects,
    bookDna: emptyBookDna(),
    identifiers: pb.sourceId ? [{ scheme: `${pb.source}-work`, value: pb.sourceId }] : [],
    editions: [edition],
  };
}
