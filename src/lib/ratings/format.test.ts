import { describe, it, expect } from 'vitest';
import { formatRating, parseRatingRaw, ratingText, RATING_UNAVAILABLE } from './format';

describe('parsing the engine raw strings', () => {
  it('splits score from scale for every shape the engine emits', () => {
    expect(parseRatingRaw('7.9/10')).toEqual({ value: '7.9', scale: '/10', note: null });
    expect(parseRatingRaw('85%')).toEqual({ value: '85', scale: '%', note: null });
    expect(parseRatingRaw('74/100')).toEqual({ value: '74', scale: '/100', note: null });
    expect(parseRatingRaw('3.5/5')).toEqual({ value: '3.5', scale: '/5', note: null });
    expect(parseRatingRaw('3.5/4')).toEqual({ value: '3.5', scale: '/4', note: null });
  });

  it('keeps the vote-count note separate instead of gluing it to the score', () => {
    expect(parseRatingRaw('7.9/10 (12,345 votes)')).toEqual({ value: '7.9', scale: '/10', note: '12,345 votes' });
  });

  it('never mangles an unknown shape — shows it as-is', () => {
    expect(parseRatingRaw('Fresh')).toEqual({ value: 'Fresh', scale: '', note: null });
  });

  it('null and empty are null, not broken punctuation', () => {
    expect(parseRatingRaw(null)).toBeNull();
    expect(parseRatingRaw('')).toBeNull();
  });
});

describe('THE REGRESSION THIS MODULE EXISTS FOR', () => {
  it('a formatted rating never prints its scale twice ("7.9/10 / 10")', () => {
    const f = formatRating({ name: 'IMDb', raw: '7.9/10', available: true });
    const printed = `${f.value}${f.scale} ${f.scale}`; // what the old double-label produced
    expect(`${f.value}${f.scale}`).toBe('7.9/10');
    expect(printed).not.toBe(`${f.value}${f.scale}`); // the double form is detectably different…
    expect(ratingText({ name: 'IMDb', raw: '7.9/10', available: true })).toBe('7.9/10'); // …and ratingText emits the single form
    expect(ratingText({ name: 'IMDb', raw: '7.9/10', available: true })).not.toContain('/10 /');
  });

  it('a percentage never doubles its % sign', () => {
    expect(ratingText({ name: 'Rotten Tomatoes', raw: '85%', available: true })).toBe('85%');
  });
});

describe('honesty about sources', () => {
  it('a TMDB-derived audience number is an "Audience score", never Popcornmeter branding', () => {
    const f = formatRating({ name: 'TMDB Audience', raw: '81%', available: true });
    expect(f.source).toBe('Audience score');
    expect(f.detail).toContain('TMDB');
    expect(f.source.toLowerCase()).not.toContain('popcorn');
  });

  it('the real RT audience score names Rotten Tomatoes in its detail', () => {
    const f = formatRating({ name: 'RT Audience', raw: '92%', available: true });
    expect(f.source).toBe('Audience score');
    expect(f.detail).toContain('Rotten Tomatoes');
  });

  it('every known source declares critic, audience, or user', () => {
    for (const name of ['IMDb', 'Rotten Tomatoes', 'RT Audience', 'TMDB Audience', 'Metacritic', 'Metacritic Users']) {
      expect(['critic', 'audience', 'user']).toContain(formatRating({ name, raw: '50%', available: true }).kind);
    }
  });
});

describe('the unavailable state', () => {
  it('is the honest sentence, not a dash or empty scale', () => {
    const f = formatRating({ name: 'IMDb', raw: null, available: false });
    expect(f.value).toBe(RATING_UNAVAILABLE);
    expect(f.scale).toBe('');
    expect(ratingText({ name: 'IMDb', raw: null, available: false })).toBe('Not available');
  });

  it('an unknown source still formats without throwing', () => {
    const f = formatRating({ name: 'Some Future Source', raw: '4.2/5', available: true });
    expect(f.source).toBe('Some Future Source');
    expect(`${f.value}${f.scale}`).toBe('4.2/5');
  });
});
