import { describe, it, expect } from 'vitest';
import {
  CATEGORY_META,
  categoriesFor,
  categoryLexicon,
  normalizeSubject,
  WEIGHT_CORE,
  WEIGHT_NICHE,
} from './categories';
import { TASTE_CATEGORIES } from './types';

describe('CATEGORY_META', () => {
  it('covers all 36 categories with a label, intent and weight', () => {
    expect(Object.keys(CATEGORY_META)).toHaveLength(36);
    for (const c of TASTE_CATEGORIES) {
      const meta = CATEGORY_META[c];
      expect(meta.category).toBe(c);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.intent.length).toBeGreaterThan(0);
      expect(meta.weight).toBeGreaterThan(0);
    }
  });

  it('weighs core axes ~3x the niche ones', () => {
    for (const core of ['genres', 'pacing', 'mood', 'horrorTolerance', 'complexity', 'emotionalIntensity'] as const) {
      expect(CATEGORY_META[core].weight).toBe(WEIGHT_CORE);
    }
    for (const niche of ['musicals', 'holiday', 'westerns'] as const) {
      expect(CATEGORY_META[niche].weight).toBe(WEIGHT_NICHE);
    }
    expect(WEIGHT_CORE / WEIGHT_NICHE).toBeGreaterThanOrEqual(2);
  });
});

describe('normalizeSubject', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeSubject('  The Silence of the Lambs!  ')).toBe('the silence of the lambs');
    expect(normalizeSubject('Se7en.')).toBe('se7en');
  });
});

describe('categoriesFor', () => {
  it('maps a genre word to its axes', () => {
    const cats = categoriesFor('horror', 'genre');
    expect(cats).toContain('horrorTolerance');
    expect(cats).toContain('genres');
  });

  it('maps the flagship title across several axes', () => {
    const cats = categoriesFor('The Silence of the Lambs', 'title');
    expect(cats).toEqual(expect.arrayContaining(['horrorTolerance', 'crime', 'psychologicalThrillers', 'mystery']));
  });

  it('maps a craft element to a single axis', () => {
    expect(categoriesFor('slow burn', 'element')).toEqual(['pacing']);
  });

  it('maps subtitles to the subtitle + foreign axes', () => {
    const cats = categoriesFor('subtitles', 'attribute');
    expect(cats).toContain('subtitles');
    expect(cats).toContain('foreignFilms');
  });

  it('maps Parasite to foreign + subtitles + thriller-ish axes', () => {
    const cats = categoriesFor('Parasite', 'title');
    expect(cats).toContain('foreignFilms');
    expect(cats).toContain('subtitles');
  });

  it('resolves a title only when the kind says title (ambiguous "it")', () => {
    expect(categoriesFor('It', 'title')).toEqual(['horrorTolerance']);
    expect(categoriesFor('it', 'element')).toEqual([]);
  });

  it('resolves a director to the directors axis', () => {
    expect(categoriesFor('Denis Villeneuve', 'person')).toContain('directors');
  });

  it('returns [] for an unknown subject and is deterministic', () => {
    expect(categoriesFor('some obscure home movie', 'title')).toEqual([]);
    expect(categoriesFor('horror', 'genre')).toEqual(categoriesFor('horror', 'genre'));
  });

  it('exposes a combined lexicon view', () => {
    expect(categoryLexicon['the silence of the lambs']).toContain('horrorTolerance');
    expect(categoryLexicon['slow burn']).toEqual(['pacing']);
  });
});
