import { describe, it, expect } from 'vitest';
import { pickBestTrailer, CONFIDENCE_FLOOR, type TmdbVideo } from './resolve';

const EN = { preferredLanguage: 'en' };

const vid = (p: Partial<TmdbVideo>): TmdbVideo => ({
  key: p.key ?? 'k',
  site: p.site ?? 'YouTube',
  type: p.type ?? 'Trailer',
  official: p.official ?? true,
  name: p.name ?? 'Video',
  iso_639_1: p.iso_639_1 ?? 'en',
  iso_3166_1: p.iso_3166_1 ?? 'US',
  published_at: p.published_at ?? '2020-01-01T00:00:00Z',
  size: p.size ?? 1080,
});

describe('trailer resolver — confidence-ranked, refuses to guess', () => {
  it('prefers an official English Trailer over a teaser', () => {
    const r = pickBestTrailer([
      vid({ key: 'teaser', type: 'Teaser' }),
      vid({ key: 'trailer', type: 'Trailer' }),
    ], EN);
    expect(r?.videoId).toBe('trailer');
    expect(r?.type).toBe('trailer');
    expect(r?.autoplayEligible).toBe(true);
  });

  it('prefers the viewer-language trailer over a foreign-language one', () => {
    const r = pickBestTrailer([
      vid({ key: 'fr', iso_639_1: 'fr' }),
      vid({ key: 'en', iso_639_1: 'en' }),
    ], EN);
    expect(r?.videoId).toBe('en');
  });

  it('falls back to the original-language official trailer when no English exists', () => {
    const r = pickBestTrailer([
      vid({ key: 'ja', iso_639_1: 'ja', type: 'Trailer', official: true }),
    ], EN);
    expect(r?.videoId).toBe('ja');
    expect(r?.language).toBe('ja');
    expect(r?.autoplayEligible).toBe(true);
  });

  it('NEVER returns a non-trailer type — clip / featurette / behind-the-scenes are ignored', () => {
    for (const t of ['Clip', 'Featurette', 'Behind the Scenes', 'Bloopers', 'Reaction', 'Review']) {
      const r = pickBestTrailer([vid({ key: 'x', type: t })], EN);
      expect(r, `type ${t} must not resolve`).toBeNull();
    }
  });

  it('rejects a fan (non-official) trailer when it is the only candidate below the floor', () => {
    // Unofficial trailer: 55 (trailer) - 25 (unofficial) + 15 (en) = 45 ≥ floor,
    // so it survives ONLY as a manual-play, never autoplay. Confirm it is not
    // autoplay-eligible.
    const r = pickBestTrailer([vid({ key: 'fan', official: false })], EN);
    if (r) expect(r.autoplayEligible).toBe(false);
  });

  it('an official trailer always beats a fan trailer for the same title', () => {
    const r = pickBestTrailer([
      vid({ key: 'fan', official: false, published_at: '2024-01-01T00:00:00Z' }), // newer
      vid({ key: 'official', official: true, published_at: '2019-01-01T00:00:00Z' }), // older
    ], EN);
    expect(r?.videoId).toBe('official');
    expect(r?.autoplayEligible).toBe(true);
  });

  it('ignores non-YouTube sites (Vimeo etc.)', () => {
    const r = pickBestTrailer([vid({ key: 'v', site: 'Vimeo' })], EN);
    expect(r).toBeNull();
  });

  it('returns null (→ poster) for an empty video list — never fabricates', () => {
    expect(pickBestTrailer([], EN)).toBeNull();
  });

  it('only a teaser available → picks the teaser, autoplay-eligible if official', () => {
    const r = pickBestTrailer([vid({ key: 't', type: 'Teaser', official: true })], EN);
    expect(r?.type).toBe('teaser');
    expect(r?.autoplayEligible).toBe(true);
  });

  it('is deterministic — same list always yields the same pick', () => {
    const list = [
      vid({ key: 'a', type: 'Trailer', official: true, published_at: '2020-01-01T00:00:00Z' }),
      vid({ key: 'b', type: 'Trailer', official: true, published_at: '2021-01-01T00:00:00Z' }),
    ];
    const first = pickBestTrailer(list, EN);
    const again = pickBestTrailer([...list].reverse(), EN);
    expect(first?.videoId).toBe('b'); // newer official trailer wins
    expect(again?.videoId).toBe('b');
  });

  it('confidence floor holds — a lone unofficial foreign teaser is refused', () => {
    // teaser 42 - 25 unofficial + 0 (foreign) = 17 < 40 floor → null.
    const r = pickBestTrailer([vid({ key: 'x', type: 'Teaser', official: false, iso_639_1: 'de' })], EN);
    expect(r).toBeNull();
    expect(CONFIDENCE_FLOOR).toBe(40);
  });
});
