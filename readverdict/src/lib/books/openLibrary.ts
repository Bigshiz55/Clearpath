import 'server-only';
import type { BookMetadata, EbookAccess } from '@/lib/types';
import { openLibraryContact } from '@/lib/env';

// Server-only Open Library client. Open Library is a free, key-less public API,
// so ReadVerdict runs with zero configuration. We only ever read real fields
// and coerce them defensively — a missing field becomes an honest null/0,
// never a fabricated value.

const BASE = 'https://openlibrary.org';

/** Fields we ask the search API to return — everything the engine scores on. */
const SEARCH_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_name',
  'first_publish_year',
  'cover_i',
  'number_of_pages_median',
  'edition_count',
  'language',
  'ratings_average',
  'ratings_count',
  'readinglog_count',
  'want_to_read_count',
  'currently_reading_count',
  'already_read_count',
  'ebook_access',
  'subject',
].join(',');

interface RawDoc {
  key?: unknown;
  title?: unknown;
  subtitle?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  cover_i?: unknown;
  number_of_pages_median?: unknown;
  edition_count?: unknown;
  language?: unknown;
  ratings_average?: unknown;
  ratings_count?: unknown;
  readinglog_count?: unknown;
  want_to_read_count?: unknown;
  currently_reading_count?: unknown;
  already_read_count?: unknown;
  ebook_access?: unknown;
  subject?: unknown;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const int0 = (v: unknown): number => {
  const n = num(v);
  return n == null ? 0 : Math.round(n);
};
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function workIdFromKey(key: unknown): string | null {
  const s = str(key);
  if (!s) return null;
  const m = s.match(/OL\w+W/);
  return m ? m[0] : null;
}

function ebookAccessOf(v: unknown): EbookAccess {
  const s = str(v);
  switch (s) {
    case 'public':
    case 'borrowable':
    case 'printdisabled':
    case 'no_ebook':
      return s;
    default:
      return 'unknown';
  }
}

function mapDoc(doc: RawDoc, description: string | null): BookMetadata | null {
  const workId = workIdFromKey(doc.key);
  const title = str(doc.title);
  if (!workId || !title) return null;

  return {
    workId,
    title,
    subtitle: str(doc.subtitle),
    authors: strArr(doc.author_name),
    firstPublishYear: num(doc.first_publish_year),
    coverId: num(doc.cover_i),
    pageCount: num(doc.number_of_pages_median),
    editionCount: int0(doc.edition_count),
    subjects: strArr(doc.subject).slice(0, 12),
    languages: strArr(doc.language),
    ratingsAverage: num(doc.ratings_average),
    ratingsCount: int0(doc.ratings_count),
    readingLogCount: int0(doc.readinglog_count),
    wantToReadCount: int0(doc.want_to_read_count),
    currentlyReadingCount: int0(doc.currently_reading_count),
    alreadyReadCount: int0(doc.already_read_count),
    ebookAccess: ebookAccessOf(doc.ebook_access),
    description,
  };
}

async function olFetch(url: string, revalidateSeconds: number): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `ReadVerdict/0.1 (${openLibraryContact()})`,
    },
    // Cache at the framework layer — Open Library data changes slowly.
    next: { revalidate: revalidateSeconds },
  });
}

export interface BookSummary {
  workId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  firstPublishYear: number | null;
  coverId: number | null;
  ratingsAverage: number | null;
  ratingsCount: number;
}

/** Search Open Library for books matching a free-text query. */
export async function searchBooks(query: string, limit = 20): Promise<BookSummary[]> {
  const q = query.trim();
  if (!q) return [];
  const url =
    `${BASE}/search.json?q=${encodeURIComponent(q)}` +
    `&fields=${SEARCH_FIELDS}&limit=${Math.max(1, Math.min(50, limit))}`;

  let res: Response;
  try {
    res = await olFetch(url, 60 * 60);
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const data = (await res.json()) as { docs?: RawDoc[] };
  const docs = Array.isArray(data.docs) ? data.docs : [];
  const out: BookSummary[] = [];
  for (const doc of docs) {
    const meta = mapDoc(doc, null);
    if (!meta) continue;
    out.push({
      workId: meta.workId,
      title: meta.title,
      subtitle: meta.subtitle,
      authors: meta.authors,
      firstPublishYear: meta.firstPublishYear,
      coverId: meta.coverId,
      ratingsAverage: meta.ratingsAverage,
      ratingsCount: meta.ratingsCount,
    });
  }
  return out;
}

/** Extract description text from a work JSON (string or {value} form). */
function descriptionOf(work: unknown): string | null {
  if (!work || typeof work !== 'object') return null;
  const d = (work as { description?: unknown }).description;
  if (typeof d === 'string') return str(d);
  if (d && typeof d === 'object' && 'value' in d) return str((d as { value: unknown }).value);
  return null;
}

/**
 * Fetch full metadata for one work. Combines the rich search doc (ratings,
 * reading log, editions, availability) with the work JSON (description).
 * Returns null if the work cannot be found.
 */
export async function getBook(workId: string): Promise<BookMetadata | null> {
  const id = workIdFromKey(workId) ?? (workId.match(/OL\w+W/)?.[0] ?? null);
  if (!id) return null;

  const searchUrl =
    `${BASE}/search.json?q=${encodeURIComponent(`key:/works/${id}`)}` +
    `&fields=${SEARCH_FIELDS}&limit=1`;
  const workUrl = `${BASE}/works/${id}.json`;

  const [searchRes, workRes] = await Promise.allSettled([
    olFetch(searchUrl, 60 * 60),
    olFetch(workUrl, 60 * 60),
  ]);

  let doc: RawDoc | null = null;
  if (searchRes.status === 'fulfilled' && searchRes.value.ok) {
    const data = (await searchRes.value.json()) as { docs?: RawDoc[] };
    doc = Array.isArray(data.docs) && data.docs[0] ? data.docs[0] : null;
  }

  let description: string | null = null;
  let workSubjects: string[] = [];
  if (workRes.status === 'fulfilled' && workRes.value.ok) {
    const work = await workRes.value.json();
    description = descriptionOf(work);
    workSubjects = strArr((work as { subjects?: unknown }).subjects).slice(0, 12);
  }

  if (!doc) {
    // Fall back to the work JSON alone when search has no doc for the key.
    if (workSubjects.length === 0 && !description) return null;
    return null;
  }

  const meta = mapDoc(doc, description);
  if (!meta) return null;
  // Prefer the fuller subject list from the work record when available.
  if (meta.subjects.length === 0 && workSubjects.length > 0) {
    meta.subjects = workSubjects;
  }
  return meta;
}
