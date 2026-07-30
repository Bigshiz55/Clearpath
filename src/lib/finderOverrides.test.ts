import { describe, it, expect } from 'vitest';
import { applyOverrides, sanitizeOverrides } from './finderOverrides';
import { EMPTY_QUERY } from './finderParse';
import type { FinderQuery } from './finder';

const parsed: FinderQuery = {
  ...EMPTY_QUERY,
  mediaType: 'movie',
  genreIds: [80, 53],
  maxRuntime: 140,
  sinceMonths: 24,
  minMatch: 80,
};

describe('sanitizeOverrides', () => {
  it('keeps only real query fields', () => {
    expect(sanitizeOverrides(['minMatch', 'sinceMonths'], EMPTY_QUERY)).toEqual(['minMatch', 'sinceMonths']);
  });

  it('drops anything that is not a field on the query', () => {
    expect(sanitizeOverrides(['minMatch', '__proto__', 'constructor', 'nonsense'], EMPTY_QUERY)).toEqual(['minMatch']);
  });

  it('drops non-strings and duplicates', () => {
    expect(sanitizeOverrides(['minMatch', 'minMatch', 7, null], EMPTY_QUERY)).toEqual(['minMatch']);
  });

  it('is empty for anything that is not an array', () => {
    expect(sanitizeOverrides(undefined, EMPTY_QUERY)).toEqual([]);
    expect(sanitizeOverrides('minMatch', EMPTY_QUERY)).toEqual([]);
  });
});

describe('applyOverrides', () => {
  it('returns the parse untouched when nothing was set by hand', () => {
    expect(applyOverrides(parsed, { ...EMPTY_QUERY, minMatch: 40 }, [])).toEqual(parsed);
  });

  it('THE BUG: a dragged slider survives the re-parse of the same sentence', () => {
    // "…match 80+" parses to 80 every time. The user then drags the slider to
    // 40 and hits Update. Without the override they get 80 back and the same
    // titles, which is exactly what made the control look broken.
    const client: FinderQuery = { ...parsed, minMatch: 40 };
    const merged = applyOverrides(parsed, client, ['minMatch']);
    expect(merged.minMatch).toBe(40);
  });

  it('leaves every field the user did not touch to the parse', () => {
    const client: FinderQuery = { ...EMPTY_QUERY, minMatch: 40 };
    const merged = applyOverrides(parsed, client, ['minMatch']);
    expect(merged.minMatch).toBe(40);
    // The client's regex never understood "24 months" or "under 140 minutes";
    // the server's parse did, and it must survive.
    expect(merged.sinceMonths).toBe(24);
    expect(merged.maxRuntime).toBe(140);
    expect(merged.genreIds).toEqual([80, 53]);
  });

  it('honours a deliberate reset back to "Any"', () => {
    const merged = applyOverrides(parsed, { ...parsed, maxRuntime: null }, ['maxRuntime']);
    expect(merged.maxRuntime).toBeNull();
  });

  it('carries booleans and arrays, not just numbers', () => {
    const client: FinderQuery = { ...parsed, englishAudioOnly: true, genreIds: [35] };
    const merged = applyOverrides(parsed, client, ['englishAudioOnly', 'genreIds']);
    expect(merged.englishAudioOnly).toBe(true);
    expect(merged.genreIds).toEqual([35]);
  });

  it('never mutates its inputs', () => {
    const before = JSON.stringify(parsed);
    applyOverrides(parsed, { ...parsed, minMatch: 10 }, ['minMatch']);
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it('ignores a named field the client does not actually carry', () => {
    const client = { minMatch: 40 } as unknown as FinderQuery;
    const merged = applyOverrides(parsed, client, ['maxRuntime']);
    expect(merged.maxRuntime).toBe(140);
  });
});
