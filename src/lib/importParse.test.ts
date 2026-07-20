import { describe, it, expect } from 'vitest';
import { parseImportText, parseStructuredCsv, parseCsvLine } from './importParse';

describe('parseCsvLine', () => {
  it('handles quotes, commas, and escaped quotes', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(parseCsvLine('"Hello, World",2020,9')).toEqual(['Hello, World', '2020', '9']);
    expect(parseCsvLine('"She said ""hi""",x')).toEqual(['She said "hi"', 'x']);
  });
});

describe('parseStructuredCsv — Letterboxd', () => {
  it('reads Name/Year/Rating and doubles the 5-star scale to /10', () => {
    const csv = [
      'Date,Name,Year,Letterboxd URI,Rating',
      '2024-01-02,Prisoners,2013,https://boxd.it/x,4.5',
      '2024-02-02,Parasite,2019,https://boxd.it/y,5',
      '2024-03-02,Cats,2019,https://boxd.it/z,0.5',
    ].join('\n');
    const out = parseStructuredCsv(csv)!;
    expect(out).toEqual([
      { title: 'Prisoners', rating: 9 },
      { title: 'Parasite', rating: 10 },
      { title: 'Cats', rating: 1 },
    ]);
  });
});

describe('parseStructuredCsv — generic exports (Trakt/Simkl/TV Time-style)', () => {
  it('reads a series column + 0–10 rating and rolls episodes up to one show', () => {
    const csv = [
      'series_name,season,episode,rating,watched_at',
      'Breaking Bad,1,1,10,2023-01-01',
      'Breaking Bad,1,2,10,2023-01-02',
      'The Wire,3,5,9,2023-02-01',
    ].join('\n');
    const out = parseStructuredCsv(csv)!;
    expect(out).toEqual([
      { title: 'Breaking Bad', rating: 10 },
      { title: 'The Wire', rating: 9 },
    ]);
  });

  it('keeps a 0–10 rating scale as-is (no doubling)', () => {
    const csv = 'title,year,score\nDune,2021,8\nTenet,2020,7';
    const out = parseStructuredCsv(csv)!;
    expect(out.find((t) => t.title === 'Dune')!.rating).toBe(8);
  });
});

describe('parseStructuredCsv — declines non-title CSVs', () => {
  it('returns null when there is no recognizable title column', () => {
    expect(parseStructuredCsv('foo,bar\n1,2\n3,4')).toBeNull();
  });
  it('leaves the Netflix Title,Date path to the fallback (no rich signal)', () => {
    expect(parseStructuredCsv('Title,Date\n"Prisoners","1/2/24"')).toBeNull();
  });
});

describe('parseImportText — routing', () => {
  it('uses the CSV parser for a Letterboxd export', () => {
    const out = parseImportText('Date,Name,Year,Rating\n2024-01-01,Heat,1995,4');
    expect(out).toEqual([{ title: 'Heat', rating: 8 }]);
  });
  it('still handles a plain pasted list', () => {
    const out = parseImportText('Prisoners - 9\nMare of Easttown 8');
    expect(out).toEqual([
      { title: 'Prisoners', rating: 9 },
      { title: 'Mare of Easttown', rating: 8 },
    ]);
  });
});
