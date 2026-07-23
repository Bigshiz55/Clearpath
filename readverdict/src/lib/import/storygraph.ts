// StoryGraph CSV import. Column names differ from Goodreads; read status uses
// 'did-not-finish' natively, and star ratings can be fractional.

import { parseCsv } from './csv';
import { toCanonicalIsbn13, isbn13To10 } from '@/lib/domain/isbn';
import type { UserBookStatus } from '@/lib/domain/userBook';
import type { ImportedBook, ImportResult } from './types';

const SOURCE = 'storygraph-csv';

function toNumber(v: string | undefined): number | null {
  const n = Number((v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapStatus(readStatus: string): UserBookStatus {
  const s = readStatus.toLowerCase().trim();
  if (s === 'read') return 'finished';
  if (s === 'currently-reading') return 'reading';
  if (s === 'to-read') return 'saved';
  if (s === 'did-not-finish') return 'dnf';
  return 'saved';
}

function firstCol(raw: Record<string, string>, names: string[]): string {
  for (const n of names) {
    const v = raw[n];
    if (v != null && v.trim() !== '') return v.trim();
  }
  return '';
}

export function parseStorygraphCsv(text: string): ImportResult {
  const { rows } = parseCsv(text);
  const books: ImportedBook[] = [];
  const skipped: ImportResult['skipped'] = [];
  const byStatus: Record<string, number> = {};

  rows.forEach((raw, i) => {
    const title = firstCol(raw, ['Title']);
    if (!title) {
      skipped.push({ rowIndex: i, raw, reason: 'Missing title' });
      return;
    }
    const authorsRaw = firstCol(raw, ['Authors', 'Author']);
    const authors = authorsRaw
      ? authorsRaw.split(/[,;]/).map((a) => a.trim()).filter(Boolean)
      : [];

    const isbnRaw = firstCol(raw, ['ISBN/UID', 'ISBN13', 'ISBN']);
    const isbn13 = toCanonicalIsbn13(isbnRaw);
    const status = mapStatus(firstCol(raw, ['Read Status']));
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const rating = toNumber(firstCol(raw, ['Star Rating']));

    books.push({
      raw,
      rowIndex: i,
      title,
      authors,
      isbn13,
      isbn10: isbn13 ? isbn13To10(isbn13) : null,
      status,
      rating: rating ? Math.min(5, rating) : null,
      dateRead: firstCol(raw, ['Last Date Read', 'Dates Read']) || null,
      dateAdded: null,
      review: firstCol(raw, ['Review']) || null,
      pageCount: null,
      readCount: toNumber(firstCol(raw, ['Read Count'])),
      owned: null,
      source: SOURCE,
      warnings: [],
    });
  });

  return {
    source: SOURCE,
    books,
    skipped,
    summary: {
      total: rows.length,
      parsed: books.length,
      skipped: skipped.length,
      withIsbn: books.filter((b) => b.isbn13).length,
      byStatus,
    },
  };
}
