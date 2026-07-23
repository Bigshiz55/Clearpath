import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvMatrix } from './csv';
import { parseGoodreadsCsv } from './goodreads';
import { parseStorygraphCsv } from './storygraph';
import { parseIsbnList, parseTitleList } from './manualList';
import { detectDuplicates, parseImport } from './index';

describe('CSV parser', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const text = 'a,b,c\n"hello, world","she said ""hi""",3';
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toEqual({ a: 'hello, world', b: 'she said "hi"', c: '3' });
  });

  it('handles newlines inside quoted fields', () => {
    const m = parseCsvMatrix('a,b\n"line1\nline2",x');
    expect(m[1]![0]).toBe('line1\nline2');
    expect(m[1]![1]).toBe('x');
  });
});

const GOODREADS = [
  'Title,Author,ISBN,ISBN13,My Rating,Exclusive Shelf,Date Read,Number of Pages,Read Count,Owned Copies,Bookshelves,My Review',
  '"The Silent Patient",Alex Michaelides,="0",="9781250301697",5,read,2021/03/01,336,1,1,,"Loved the twist"',
  'Gone Girl,Gillian Flynn,="0307588378",="9780307588371",4,read,2020/01/01,415,1,0,,',
  'Slow Book,Some Author,="",="",0,to-read,,,,0,,',
  'Quit This,Another Author,="",="",2,read,,,1,0,"dnf, fiction",',
  ',No Title Author,="",="",0,to-read,,,,,,',
].join('\n');

describe('Goodreads import', () => {
  const result = parseGoodreadsCsv(GOODREADS);

  it('parses rows, preserves raw, and skips a titleless row', () => {
    expect(result.summary.parsed).toBe(4);
    expect(result.summary.skipped).toBe(1);
    expect(result.books[0]!.raw['Title']).toBe('The Silent Patient');
  });

  it('canonicalizes ISBNs to ISBN-13', () => {
    expect(result.books[0]!.isbn13).toBe('9781250301697');
    expect(result.books[1]!.isbn13).toBe('9780307588371');
  });

  it('maps shelves to canonical statuses including DNF via bookshelves', () => {
    expect(result.books[0]!.status).toBe('finished');
    expect(result.books[2]!.status).toBe('saved');
    expect(result.books[3]!.status).toBe('dnf');
  });

  it('captures ratings, pages, owned', () => {
    expect(result.books[0]!.rating).toBe(5);
    expect(result.books[0]!.pageCount).toBe(336);
    expect(result.books[0]!.owned).toBe(true);
    expect(result.books[1]!.owned).toBe(false);
  });
});

const STORYGRAPH = [
  'Title,Authors,ISBN/UID,Format,Read Status,Star Rating,Review',
  'Project Hail Mary,Andy Weir,9780593135204,audiobook,read,4.5,Great',
  'The Push,Ashley Audrain,,ebook,did-not-finish,2,',
].join('\n');

describe('StoryGraph import', () => {
  const r = parseStorygraphCsv(STORYGRAPH);
  it('maps did-not-finish to dnf and parses fractional ratings', () => {
    expect(r.books[0]!.status).toBe('finished');
    expect(r.books[0]!.rating).toBe(4.5);
    expect(r.books[1]!.status).toBe('dnf');
    expect(r.books[0]!.isbn13).toBe('9780593135204');
  });
});

describe('manual lists', () => {
  it('parses an ISBN list and rejects invalid tokens', () => {
    const r = parseIsbnList('9780306406157, not-isbn 0306406152');
    expect(r.summary.parsed).toBe(2);
    expect(r.summary.skipped).toBe(1);
    expect(r.books.every((b) => b.isbn13)).toBe(true);
  });

  it('parses a title list with optional "by Author"', () => {
    const r = parseTitleList('The Silent Patient by Alex Michaelides\nGone Girl');
    expect(r.books[0]!.authors).toEqual(['Alex Michaelides']);
    expect(r.books[1]!.authors).toEqual([]);
    expect(r.books[1]!.warnings.length).toBeGreaterThan(0);
  });
});

describe('duplicate detection', () => {
  it('flags the same work imported twice but not similar-titled different books', () => {
    const r = parseTitleList(
      ['Gone Girl by Gillian Flynn', 'Gone Girl by Gillian Flynn', 'Home by Toni Morrison'].join('\n'),
    );
    const dupes = detectDuplicates(r.books);
    expect(dupes.length).toBe(1);
    expect(dupes[0]!.length).toBe(2);
  });
});

describe('parseImport router', () => {
  it('dispatches by kind', () => {
    expect(parseImport('goodreads_csv', GOODREADS).source).toBe('goodreads-csv');
    expect(parseImport('title_list', 'A Book').source).toBe('title-list');
  });
});
