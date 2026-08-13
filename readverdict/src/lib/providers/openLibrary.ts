import 'server-only';

import { toCanonicalIsbn13, isbn13To10 } from '@/lib/domain/isbn';
import type {
  BookProvider,
  BookQuery,
  ProviderBook,
  ProviderHealth,
  ProviderResult,
} from './types';

// Open Library provider — free, key-less, real. The mapping (`mapDoc`) is pure
// and exported for testing; the network calls are server-only.

const BASE = 'https://openlibrary.org';
const FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_name',
  'first_publish_year',
  'cover_i',
  'isbn',
  'number_of_pages_median',
  'language',
  'subject',
  'ratings_average',
  'ratings_count',
].join(',');

interface OlDoc {
  key?: unknown;
  title?: unknown;
  subtitle?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  cover_i?: unknown;
  isbn?: unknown;
  number_of_pages_median?: unknown;
  language?: unknown;
  subject?: unknown;
  ratings_average?: unknown;
  ratings_count?: unknown;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Pure: map one Open Library search doc into a ProviderBook. */
export function mapDoc(doc: OlDoc): ProviderBook | null {
  const title = str(doc.title);
  if (!title) return null;
  const key = str(doc.key);
  const isbns = strArr(doc.isbn);
  const isbn13 = isbns.map(toCanonicalIsbn13).find((x): x is string => !!x) ?? null;
  const ratingsAvg = num(doc.ratings_average);
  const ratingsCount = num(doc.ratings_count);
  const coverId = num(doc.cover_i);

  return {
    source: 'openlibrary',
    sourceId: key ? key.replace('/works/', '') : null,
    title,
    subtitle: str(doc.subtitle),
    authors: strArr(doc.author_name),
    firstPublishYear: num(doc.first_publish_year),
    isbn13,
    isbn10: isbn13 ? isbn13To10(isbn13) : null,
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    subjects: strArr(doc.subject).slice(0, 12),
    languages: strArr(doc.language),
    pageCount: num(doc.number_of_pages_median),
    rating:
      ratingsAvg != null && ratingsCount != null && ratingsCount > 0
        ? { average: ratingsAvg, count: ratingsCount }
        : null,
  };
}

function buildQuery(q: BookQuery): string {
  if (q.isbn) return `${BASE}/search.json?q=${encodeURIComponent(`isbn:${q.isbn}`)}&fields=${FIELDS}&limit=1`;
  const parts: string[] = [];
  if (q.title) parts.push(`title=${encodeURIComponent(q.title)}`);
  if (q.author) parts.push(`author=${encodeURIComponent(q.author)}`);
  if (q.q && parts.length === 0) parts.push(`q=${encodeURIComponent(q.q)}`);
  const limit = Math.max(1, Math.min(40, q.limit ?? 20));
  return `${BASE}/search.json?${parts.join('&')}&fields=${FIELDS}&limit=${limit}`;
}

async function fetchJson(url: string): Promise<{ docs?: OlDoc[] }> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ReadVerdict/0.1' },
    next: { revalidate: 60 * 60 },
  });
  if (!res.ok) throw new Error(`Open Library ${res.status}`);
  return (await res.json()) as { docs?: OlDoc[] };
}

export const openLibraryProvider: BookProvider = {
  key: 'openlibrary',
  displayName: 'Open Library',

  async search(q: BookQuery): Promise<ProviderResult<ProviderBook[]>> {
    const retrievedAt = new Date().toISOString();
    try {
      const data = await fetchJson(buildQuery(q));
      const docs = Array.isArray(data.docs) ? data.docs : [];
      const books = docs.map(mapDoc).filter((b): b is ProviderBook => b !== null);
      return {
        state: books.length > 0 ? 'ok' : 'no_data',
        data: books,
        source: 'openlibrary',
        retrievedAt,
      };
    } catch (err) {
      return {
        state: 'provider_failure',
        data: null,
        source: 'openlibrary',
        retrievedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async getByIsbn(isbn: string): Promise<ProviderResult<ProviderBook | null>> {
    const res = await this.search({ isbn, limit: 1 });
    return {
      state: res.state,
      data: res.data?.[0] ?? null,
      source: 'openlibrary',
      retrievedAt: res.retrievedAt,
      error: res.error,
    };
  },

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(`${BASE}/search.json?q=the&limit=1`, {
        headers: { 'User-Agent': 'ReadVerdict/0.1' },
      });
      return { source: 'openlibrary', healthy: res.ok, checkedAt };
    } catch {
      return { source: 'openlibrary', healthy: false, checkedAt, note: 'unreachable' };
    }
  },
};
