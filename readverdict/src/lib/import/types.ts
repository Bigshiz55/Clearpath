import type { UserBookStatus } from '@/lib/domain/userBook';

/** A normalized book row from any import source. The raw row is always kept. */
export interface ImportedBook {
  /** The original uploaded row, preserved verbatim for provenance/repair. */
  raw: Record<string, string>;
  rowIndex: number;
  title: string;
  authors: string[];
  isbn13: string | null;
  isbn10: string | null;
  status: UserBookStatus;
  /** 0..5, or null when not rated. */
  rating: number | null;
  dateRead: string | null;
  dateAdded: string | null;
  review: string | null;
  pageCount: number | null;
  readCount: number | null;
  owned: boolean | null;
  /** Import source key, e.g. 'goodreads-csv'. */
  source: string;
  /** Per-row parse warnings (never silently dropped). */
  warnings: string[];
}

export interface ImportResult {
  source: string;
  books: ImportedBook[];
  /** Rows that could not be parsed into a book at all. */
  skipped: { rowIndex: number; raw: Record<string, string>; reason: string }[];
  /** Aggregate counts for the import preview. */
  summary: {
    total: number;
    parsed: number;
    skipped: number;
    withIsbn: number;
    byStatus: Record<string, number>;
  };
}
