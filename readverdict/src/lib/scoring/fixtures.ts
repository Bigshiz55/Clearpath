import type { BookMetadata } from '@/lib/types';

/** A neutral, fully-unknown book — every optional signal absent. */
export function emptyBook(overrides: Partial<BookMetadata> = {}): BookMetadata {
  return {
    workId: 'OL0W',
    title: 'Untitled',
    subtitle: null,
    authors: [],
    firstPublishYear: null,
    coverId: null,
    pageCount: null,
    editionCount: 0,
    subjects: [],
    languages: [],
    ratingsAverage: null,
    ratingsCount: 0,
    readingLogCount: 0,
    wantToReadCount: 0,
    currentlyReadingCount: 0,
    alreadyReadCount: 0,
    ebookAccess: 'unknown',
    description: null,
    ...overrides,
  };
}

/** An acclaimed, enduring classic (think a widely-loved public-domain novel). */
export function classicBook(overrides: Partial<BookMetadata> = {}): BookMetadata {
  return emptyBook({
    workId: 'OL45804W',
    title: 'Pride and Prejudice',
    authors: ['Jane Austen'],
    firstPublishYear: 1813,
    coverId: 12345,
    pageCount: 279,
    editionCount: 220,
    subjects: ['Fiction', 'Romance', 'Social classes'],
    languages: ['eng'],
    ratingsAverage: 4.3,
    ratingsCount: 950,
    readingLogCount: 48000,
    wantToReadCount: 40000,
    currentlyReadingCount: 3000,
    alreadyReadCount: 5000,
    ebookAccess: 'public',
    description: 'A witty comedy of manners about the spirited Elizabeth Bennet.',
    ...overrides,
  });
}

/** A poorly-received, thinly-rated recent book. */
export function weakBook(overrides: Partial<BookMetadata> = {}): BookMetadata {
  return emptyBook({
    workId: 'OL99999W',
    title: 'Forgettable Doorstop',
    authors: ['Anon'],
    firstPublishYear: 2024,
    pageCount: 820,
    editionCount: 1,
    subjects: ['Fiction'],
    languages: ['eng'],
    ratingsAverage: 2.1,
    ratingsCount: 40,
    readingLogCount: 120,
    ebookAccess: 'no_ebook',
    description: 'A sprawling novel that never quite lands.',
    ...overrides,
  });
}
