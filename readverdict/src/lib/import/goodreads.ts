// Goodreads CSV import. Maps the official Goodreads export columns onto
// ImportedBook, preserving the raw row. Goodreads wraps ISBNs like ="0306406152".

import { parseCsv } from './csv';
import { toCanonicalIsbn13, isbn13To10, normalizeIsbn, isValidIsbn10 } from '@/lib/domain/isbn';
import type { UserBookStatus } from '@/lib/domain/userBook';
import type { ImportedBook, ImportResult } from './types';

const SOURCE = 'goodreads-csv';

/** Unwrap Goodreads' ="..." Excel-guard formatting. */
function unwrap(v: string | undefined): string {
  if (!v) return '';
  return v.replace(/^="?/, '').replace(/"$/, '').trim();
}

function toNumber(v: string | undefined): number | null {
  const n = Number((v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapStatus(shelf: string, bookshelves: string): UserBookStatus {
  const s = shelf.toLowerCase().trim();
  const all = `${s} ${bookshelves.toLowerCase()}`;
  if (/\b(dnf|did-not-finish|did_not_finish|abandoned)\b/.test(all)) return 'dnf';
  if (s === 'read') return 'finished';
  if (s === 'currently-reading') return 'reading';
  if (s === 'to-read') return 'saved';
  return 'saved';
}

function pickIsbns(isbn: string, isbn13: string): { isbn13: string | null; isbn10: string | null } {
  const raw13 = unwrap(isbn13);
  const raw10 = unwrap(isbn);
  const canon =
    toCanonicalIsbn13(raw13) || toCanonicalIsbn13(raw10) || null;
  const ten =
    (isValidIsbn10(normalizeIsbn(raw10)) && normalizeIsbn(raw10)) ||
    (canon && isbn13To10(canon)) ||
    null;
  return { isbn13: canon, isbn10: ten };
}

export function parseGoodreadsCsv(text: string): ImportResult {
  const { rows } = parseCsv(text);
  const books: ImportedBook[] = [];
  const skipped: ImportResult['skipped'] = [];
  const byStatus: Record<string, number> = {};

  rows.forEach((raw, i) => {
    const title = (raw['Title'] ?? '').trim();
    const author = (raw['Author'] ?? raw['Author l-f'] ?? '').trim();
    if (!title) {
      skipped.push({ rowIndex: i, raw, reason: 'Missing title' });
      return;
    }
    const warnings: string[] = [];
    const { isbn13, isbn10 } = pickIsbns(raw['ISBN'] ?? '', raw['ISBN13'] ?? '');
    if (!isbn13 && (unwrap(raw['ISBN']) || unwrap(raw['ISBN13']))) {
      warnings.push('ISBN present but failed validation');
    }
    const ratingNum = toNumber(raw['My Rating']);
    const status = mapStatus(raw['Exclusive Shelf'] ?? '', raw['Bookshelves'] ?? '');
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    books.push({
      raw,
      rowIndex: i,
      title,
      authors: author ? [author] : [],
      isbn13,
      isbn10,
      status,
      rating: ratingNum && ratingNum > 0 ? Math.min(5, ratingNum) : null,
      dateRead: (raw['Date Read'] ?? '').trim() || null,
      dateAdded: (raw['Date Added'] ?? '').trim() || null,
      review: (raw['My Review'] ?? '').trim() || null,
      pageCount: toNumber(raw['Number of Pages']),
      readCount: toNumber(raw['Read Count']),
      owned: (() => {
        const v = (raw['Owned Copies'] ?? '').trim();
        if (v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n > 0 : null;
      })(),
      source: SOURCE,
      warnings,
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
