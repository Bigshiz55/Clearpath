import { clusterWorks, type MatchCandidate } from '@/lib/domain/entityResolution';
import { parseGoodreadsCsv } from './goodreads';
import { parseStorygraphCsv } from './storygraph';
import { parseIsbnList, parseTitleList } from './manualList';
import type { ImportedBook, ImportResult } from './types';

export * from './types';
export { parseCsv, parseCsvMatrix } from './csv';
export { parseGoodreadsCsv } from './goodreads';
export { parseStorygraphCsv } from './storygraph';
export { parseIsbnList, parseTitleList } from './manualList';

export type ImportKind =
  | 'goodreads_csv'
  | 'storygraph_csv'
  | 'isbn_list'
  | 'title_list';

/** Route raw import text through the right parser. */
export function parseImport(kind: ImportKind, text: string): ImportResult {
  switch (kind) {
    case 'goodreads_csv':
      return parseGoodreadsCsv(text);
    case 'storygraph_csv':
      return parseStorygraphCsv(text);
    case 'isbn_list':
      return parseIsbnList(text);
    case 'title_list':
      return parseTitleList(text);
  }
}

/**
 * Detect likely-duplicate rows within an import (same work imported twice).
 * Returns clusters of row indices with more than one member. Uses the shared
 * entity-resolution rules, so similar titles alone never count as duplicates.
 */
export function detectDuplicates(books: ImportedBook[]): number[][] {
  const candidates: MatchCandidate[] = books.map((b) => ({
    title: b.title,
    authors: b.authors,
    isbn13: b.isbn13,
    isbn10: b.isbn10,
  }));
  return clusterWorks(candidates)
    .filter((c) => c.length > 1)
    .map((c) => c.map((idx) => books[idx]!.rowIndex));
}
