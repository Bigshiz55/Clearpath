import type {
  BookProvider,
  BookQuery,
  ProviderBook,
  ProviderHealth,
  ProviderResult,
} from './types';

// Development/fixture provider. Clearly flagged `isMock` so the UI can label
// results as sample data — never presented as real. Useful offline and in tests.

const FIXTURES: ProviderBook[] = [
  {
    source: 'mock',
    sourceId: 'mock-silent-patient',
    title: 'The Silent Patient',
    subtitle: null,
    authors: ['Alex Michaelides'],
    firstPublishYear: 2019,
    isbn13: '9781250301697',
    isbn10: '1250301696',
    coverUrl: null,
    subjects: ['Psychological thriller', 'Mystery'],
    languages: ['eng'],
    pageCount: 336,
    rating: { average: 4.1, count: 900 },
  },
  {
    source: 'mock',
    sourceId: 'mock-project-hail-mary',
    title: 'Project Hail Mary',
    subtitle: null,
    authors: ['Andy Weir'],
    firstPublishYear: 2021,
    isbn13: '9780593135204',
    isbn10: '0593135202',
    coverUrl: null,
    subjects: ['Science fiction', 'Space'],
    languages: ['eng'],
    pageCount: 476,
    rating: { average: 4.5, count: 1200 },
  },
  {
    source: 'mock',
    sourceId: 'mock-gone-girl',
    title: 'Gone Girl',
    subtitle: null,
    authors: ['Gillian Flynn'],
    firstPublishYear: 2012,
    isbn13: '9780307588371',
    isbn10: '0307588378',
    coverUrl: null,
    subjects: ['Thriller', 'Marriage'],
    languages: ['eng'],
    pageCount: 415,
    rating: { average: 4.0, count: 2500 },
  },
];

function matches(book: ProviderBook, q: BookQuery): boolean {
  if (q.isbn) return book.isbn13 === q.isbn || book.isbn10 === q.isbn;
  const needle = (q.q ?? q.title ?? '').toLowerCase();
  const author = (q.author ?? '').toLowerCase();
  const titleHit = !needle || book.title.toLowerCase().includes(needle);
  const authorHit = !author || book.authors.some((a) => a.toLowerCase().includes(author));
  return titleHit && authorHit;
}

export const mockProvider: BookProvider = {
  key: 'mock',
  displayName: 'Mock (development fixtures)',
  isMock: true,

  async search(q: BookQuery): Promise<ProviderResult<ProviderBook[]>> {
    const data = FIXTURES.filter((b) => matches(b, q)).slice(0, q.limit ?? 20);
    return {
      state: data.length > 0 ? 'ok' : 'no_data',
      data,
      source: 'mock',
      retrievedAt: new Date().toISOString(),
    };
  },

  async getByIsbn(isbn: string): Promise<ProviderResult<ProviderBook | null>> {
    const data = FIXTURES.find((b) => b.isbn13 === isbn || b.isbn10 === isbn) ?? null;
    return {
      state: data ? 'ok' : 'no_data',
      data,
      source: 'mock',
      retrievedAt: new Date().toISOString(),
    };
  },

  async health(): Promise<ProviderHealth> {
    return { source: 'mock', healthy: true, checkedAt: new Date().toISOString() };
  },
};
