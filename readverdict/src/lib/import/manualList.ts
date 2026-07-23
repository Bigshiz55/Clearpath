// Manual-list and ISBN-list imports. A user pastes titles (one per line) or a
// list of ISBNs; we resolve what we can and flag ambiguity rather than guessing.

import { toCanonicalIsbn13, isbn13To10, normalizeIsbn, isValidIsbn } from '@/lib/domain/isbn';
import type { ImportedBook, ImportResult } from './types';

/** Parse a pasted list of ISBNs (any separators). Invalid tokens are skipped. */
export function parseIsbnList(text: string): ImportResult {
  const tokens = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const books: ImportedBook[] = [];
  const skipped: ImportResult['skipped'] = [];

  tokens.forEach((tok, i) => {
    const raw = { isbn: tok };
    if (!isValidIsbn(normalizeIsbn(tok))) {
      skipped.push({ rowIndex: i, raw, reason: 'Not a valid ISBN' });
      return;
    }
    const isbn13 = toCanonicalIsbn13(tok)!;
    books.push({
      raw,
      rowIndex: i,
      title: '', // resolved later against a provider
      authors: [],
      isbn13,
      isbn10: isbn13To10(isbn13),
      status: 'saved',
      rating: null,
      dateRead: null,
      dateAdded: null,
      review: null,
      pageCount: null,
      readCount: null,
      owned: null,
      source: 'isbn-list',
      warnings: ['Title/author to be resolved from ISBN'],
    });
  });

  return {
    source: 'isbn-list',
    books,
    skipped,
    summary: {
      total: tokens.length,
      parsed: books.length,
      skipped: skipped.length,
      withIsbn: books.length,
      byStatus: { saved: books.length },
    },
  };
}

const AUTHOR_SEP = /\s+(?:by|—|-|·|\|)\s+/i;

/** Parse a pasted list of titles (one per line, optional "Title by Author"). */
export function parseTitleList(text: string): ImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const books: ImportedBook[] = [];
  const skipped: ImportResult['skipped'] = [];

  lines.forEach((line, i) => {
    const raw = { line };
    // If the whole line is an ISBN, treat it as one.
    if (isValidIsbn(normalizeIsbn(line))) {
      const isbn13 = toCanonicalIsbn13(line)!;
      books.push({
        raw,
        rowIndex: i,
        title: '',
        authors: [],
        isbn13,
        isbn10: isbn13To10(isbn13),
        status: 'saved',
        rating: null,
        dateRead: null,
        dateAdded: null,
        review: null,
        pageCount: null,
        readCount: null,
        owned: null,
        source: 'title-list',
        warnings: ['Resolved as ISBN'],
      });
      return;
    }
    const parts = line.split(AUTHOR_SEP);
    const title = parts[0]!.trim();
    const author = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
    if (!title) {
      skipped.push({ rowIndex: i, raw, reason: 'Empty line' });
      return;
    }
    books.push({
      raw,
      rowIndex: i,
      title,
      authors: author ? [author] : [],
      isbn13: null,
      isbn10: null,
      status: 'saved',
      rating: null,
      dateRead: null,
      dateAdded: null,
      review: null,
      pageCount: null,
      readCount: null,
      owned: null,
      source: 'title-list',
      warnings: author ? [] : ['Author unknown — may need disambiguation'],
    });
  });

  return {
    source: 'title-list',
    books,
    skipped,
    summary: {
      total: lines.length,
      parsed: books.length,
      skipped: skipped.length,
      withIsbn: books.filter((b) => b.isbn13).length,
      byStatus: { saved: books.length },
    },
  };
}
