import { describe, it, expect } from 'vitest';
import { splitCsvLine, findColumns, parseTitleIdMapCsv } from './titleIdMap';

describe('splitCsvLine', () => {
  it('splits a plain comma line', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('honours quoted fields containing a comma', () => {
    expect(splitCsvLine('wm1,"Movie, The",tt123')).toEqual(['wm1', 'Movie, The', 'tt123']);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(splitCsvLine('wm1,"He said ""hi""",tt1')).toEqual(['wm1', 'He said "hi"', 'tt1']);
  });
});

describe('findColumns', () => {
  it('locates all four columns by header name', () => {
    const idx = findColumns(['id', 'imdb_id', 'tmdb_id', 'tmdb_type', 'title']);
    expect(idx).toEqual({ watchmodeId: 0, imdbId: 1, tmdbId: 2, tmdbMediaType: 3 });
  });

  it('accepts the tmdb_media_type header alias', () => {
    const idx = findColumns(['id', 'tmdb_id', 'tmdb_media_type']);
    expect(idx).toEqual({ watchmodeId: 0, imdbId: -1, tmdbId: 1, tmdbMediaType: 2 });
  });

  it('returns null when a required column is missing', () => {
    expect(findColumns(['id', 'title'])).toBeNull();
  });
});

describe('parseTitleIdMapCsv', () => {
  const HEADER = 'id,imdb_id,tmdb_id,tmdb_type,title';

  it('parses well-formed rows into resolved title-map entries', () => {
    const csv = [HEADER, '1,tt0111161,278,movie,Shawshank', '2,tt0903747,1396,tv,Breaking Bad'].join('\n');
    const r = parseTitleIdMapCsv(csv);
    expect(r.totalRows).toBe(2);
    expect(r.skipped).toBe(0);
    expect(r.rows).toEqual([
      { watchmodeId: 1, imdbId: 'tt0111161', tmdbId: 278, tmdbMediaType: 'movie' },
      { watchmodeId: 2, imdbId: 'tt0903747', tmdbId: 1396, tmdbMediaType: 'tv' },
    ]);
  });

  it('drops a row with no TMDB id, counting it in `skipped`, without fabricating one', () => {
    const csv = [HEADER, '1,tt0111161,,movie,Untracked', '2,tt0903747,1396,tv,Breaking Bad'].join('\n');
    const r = parseTitleIdMapCsv(csv);
    expect(r.totalRows).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.tmdbId).toBe(1396);
  });

  it('drops a row with an unrecognised media type', () => {
    const csv = [HEADER, '1,tt1,55,person,Someone'].join('\n');
    const r = parseTitleIdMapCsv(csv);
    expect(r.skipped).toBe(1);
    expect(r.rows).toHaveLength(0);
  });

  it('drops a row with a non-numeric Watchmode id', () => {
    const csv = [HEADER, 'not-a-number,tt1,55,movie,X'].join('\n');
    const r = parseTitleIdMapCsv(csv);
    expect(r.skipped).toBe(1);
  });

  it('works with no imdb_id column at all', () => {
    const csv = ['id,tmdb_id,tmdb_type', '1,55,movie'].join('\n');
    const r = parseTitleIdMapCsv(csv);
    expect(r.rows).toEqual([{ watchmodeId: 1, imdbId: null, tmdbId: 55, tmdbMediaType: 'movie' }]);
  });

  it('an empty file (header only) parses to zero rows, not an error', () => {
    const r = parseTitleIdMapCsv(HEADER);
    expect(r.totalRows).toBe(0);
    expect(r.rows).toEqual([]);
  });

  it('a totally unrecognised header returns everything as skipped, not a crash', () => {
    const csv = ['foo,bar,baz', '1,2,3'].join('\n');
    const r = parseTitleIdMapCsv(csv);
    expect(r.rows).toEqual([]);
    expect(r.skipped).toBe(1);
  });
});
