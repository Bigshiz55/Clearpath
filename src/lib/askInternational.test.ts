import { describe, it, expect } from 'vitest';
import { augmentInternational } from './askInternational';
import type { FinderQuery } from './finder';

const base = (): FinderQuery => ({
  mediaType: 'movie', genreIds: [], maxRuntime: null, sinceMonths: null,
  minAudience: null, minImdb: null, englishAudioOnly: false, onMyServices: false,
  minMatch: null, streamItOnly: false, bingeableOnly: false, upcoming: false,
  liveOnly: false, pace: null,
});

describe('ask route international augmentation (live wiring)', () => {
  it('the flagship Spanish/English-audio/Christmas-Story prompt restricts origin + audio', () => {
    const q = augmentInternational(base(), 'Show me a Spanish film with English audio similar to A Christmas Story.');
    expect(q.originCountries).toEqual(['ES']);
    expect(q.originalLanguages).toEqual(['es']);
    expect(q.englishAudioOnly).toBe(true);
  });

  it('Korean thriller under two hours, English dub', () => {
    const q = augmentInternational(base(), 'A Korean thriller under two hours with an English dub.');
    expect(q.originCountries).toEqual(['KR']);
    expect(q.originalLanguages).toEqual(['ko']);
    expect(q.englishAudioOnly).toBe(true);
    expect(q.maxRuntime).toBe(120);
  });

  it('leaves a domestic request untouched', () => {
    const q = augmentInternational(base(), 'a good crime movie');
    expect(q.originCountries).toBeUndefined();
    expect(q.englishAudioOnly).toBe(false);
    expect(q.maxRuntime).toBeNull();
  });

  it('never overrides a stronger runtime already set by the parser', () => {
    const q = { ...base(), maxRuntime: 90 };
    augmentInternational(q, 'under two hours');
    expect(q.maxRuntime).toBe(90);
  });

  it('narrows an uncommitted query when a media type is explicitly ruled out', () => {
    const anyQ: FinderQuery = { ...base(), mediaType: 'any' };
    augmentInternational(anyQ, 'Fargo the movie, not the series');
    expect(anyQ.mediaType).toBe('movie');
    const anyQ2: FinderQuery = { ...base(), mediaType: 'any' };
    augmentInternational(anyQ2, 'the show, not a movie');
    expect(anyQ2.mediaType).toBe('tv');
  });

  it('never overrides a media type the parser already committed to', () => {
    const q: FinderQuery = { ...base(), mediaType: 'tv' };
    augmentInternational(q, 'not the series'); // conflicting, but parser wins
    expect(q.mediaType).toBe('tv');
  });
});
