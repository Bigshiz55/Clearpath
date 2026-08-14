import { describe, it, expect } from 'vitest';
import {
  CALIBRATION_GENRES,
  CALIBRATION_GENRE_SLUGS,
  genreAnswerToEvent,
  genreSlug,
  gradeForRating,
} from './genreCalibration';
import { GENRE_IDS } from '@/lib/finderGenres';
import { deriveDna } from './engine';
import { resolveConfidence } from './confidence';
import { preferenceNudge } from './rank';

/**
 * GENRE CALIBRATION FEEDS THE REAL MODEL — proven against the real engine.
 *
 * The contract under test is the one the owner stated: a broad CANONICAL
 * genre list, a fast 1–10 input, explicit "not for me" where the model
 * supports negative affinity, and every answer feeding the REAL existing
 * Taste DNA system. So the assertions below end in `deriveDna` and
 * `preferenceNudge` — the production fold and the production ranker — not in
 * a mock of either.
 */

describe('the vocabulary is canonical, not invented', () => {
  it('every calibration genre maps to a real GENRE_IDS entry', () => {
    for (const g of CALIBRATION_GENRES) {
      const named = Object.entries(GENRE_IDS).find(([, id]) => id === g.tmdbId);
      expect(named, `${g.slug} must exist in the canonical vocabulary`).toBeDefined();
    }
  });

  it('aliases collapse — one entry per real genre id', () => {
    const ids = CALIBRATION_GENRES.map((g) => g.tmdbId);
    expect(new Set(ids).size).toBe(ids.length);
    // The alias spellings never surface as their own rows.
    expect(CALIBRATION_GENRE_SLUGS).not.toContain('sci_fi');
    expect(CALIBRATION_GENRE_SLUGS).not.toContain('scifi');
    expect(CALIBRATION_GENRE_SLUGS).toContain('science_fiction');
  });

  it('slugs use the SAME transform the fingerprint ranker uses (one owner)', () => {
    expect(genreSlug('Science Fiction')).toBe('science_fiction');
    expect(genreSlug('Sci-Fi')).toBe('sci_fi');
    expect(genreSlug('  War & Politics ')).toBe('war_politics');
  });
});

describe('1–10 lands on the existing attraction grades', () => {
  it('tiers', () => {
    expect(gradeForRating(1)).toBe('absolutely_not');
    expect(gradeForRating(2)).toBe('absolutely_not');
    expect(gradeForRating(3)).toBe('not_interested');
    expect(gradeForRating(4)).toBe('not_interested');
    expect(gradeForRating(5)).toBe('maybe_interested');
    expect(gradeForRating(6)).toBe('maybe_interested');
    expect(gradeForRating(7)).toBe('interested');
    expect(gradeForRating(8)).toBe('interested');
    expect(gradeForRating(9)).toBe('must_watch');
    expect(gradeForRating(10)).toBe('must_watch');
  });
});

describe('the event is an ordinary preference event', () => {
  it('a rating builds an attraction event carrying the genre', () => {
    const e = genreAnswerToEvent({ slug: 'comedy', rating: 9 }, 1_000, 'ev1');
    expect(e.action).toBe('unseen_interested');
    expect(e.attractionGrade).toBe('must_watch');
    expect(e.genres).toEqual(['comedy']);
    expect(e.titleId).toBe('genre:comedy');
    expect(e.source).toBe('genre-calibration');
    expect(e.dims, 'a genre statement carries no title fingerprint').toBeUndefined();
  });

  it('"not for me" is the model’s strongest negative attraction', () => {
    const e = genreAnswerToEvent({ slug: 'horror', notForMe: true }, 1_000, 'ev2');
    expect(e.action).toBe('unseen_not_interested');
    expect(e.attractionGrade).toBe('absolutely_not');
  });

  it('a low rating is negative through the same grades', () => {
    const e = genreAnswerToEvent({ slug: 'western', rating: 3 }, 1_000, 'ev3');
    expect(e.action).toBe('unseen_not_interested');
    expect(e.attractionGrade).toBe('not_interested');
  });
});

describe('the REAL engine moves — deriveDna, not a mock', () => {
  const at = 1_700_000_000_000;
  const now = at + 60_000;

  it('a 9 builds a positive genre belief; a 2 builds a negative one', () => {
    const dna = deriveDna(
      [
        genreAnswerToEvent({ slug: 'comedy', rating: 9 }, at, 'a'),
        genreAnswerToEvent({ slug: 'horror', rating: 2 }, at, 'b'),
      ],
      now,
    );
    const comedy = resolveConfidence(dna.attraction.genres['comedy']!);
    const horror = resolveConfidence(dna.attraction.genres['horror']!);
    expect(comedy.polarity).toBe(1);
    expect(horror.polarity).toBe(-1);
  });

  it('"not for me" carries more evidence weight than a mild no (1.2 vs 0.8)', () => {
    const dna = deriveDna(
      [
        genreAnswerToEvent({ slug: 'horror', notForMe: true }, at, 'a'),
        genreAnswerToEvent({ slug: 'western', rating: 3 }, at, 'b'),
      ],
      now,
    );
    expect(dna.attraction.genres['horror']!.evidence).toBeGreaterThan(
      dna.attraction.genres['western']!.evidence,
    );
  });

  it('repeated genre statements reach the production RANKER, signed correctly', () => {
    /* One tap must never move ranking (confidence floor) — that is the
       engine's own skepticism and it applies here identically. Consistent
       repeated statements cross the floor, and then a title carrying a loved
       genre ranks up while a ruled-out genre ranks down. */
    const events = [
      genreAnswerToEvent({ slug: 'comedy', rating: 10 }, at, 'a'),
      genreAnswerToEvent({ slug: 'comedy', rating: 9 }, at + 1, 'b'),
      genreAnswerToEvent({ slug: 'comedy', rating: 9 }, at + 2, 'c'),
      genreAnswerToEvent({ slug: 'horror', notForMe: true }, at + 3, 'd'),
      genreAnswerToEvent({ slug: 'horror', notForMe: true }, at + 4, 'e'),
      genreAnswerToEvent({ slug: 'horror', rating: 1 }, at + 5, 'f'),
    ];
    const dna = deriveDna(events, now);
    const up = preferenceNudge({ genres: ['comedy'] }, dna);
    const down = preferenceNudge({ genres: ['horror'] }, dna);
    expect(up.nudge).toBeGreaterThan(0);
    expect(down.nudge).toBeLessThan(0);
  });

  it('a single tap does NOT move ranking — the skepticism floor holds', () => {
    const dna = deriveDna([genreAnswerToEvent({ slug: 'war', rating: 10 }, at, 'a')], now);
    expect(preferenceNudge({ genres: ['war'] }, dna).nudge).toBe(0);
  });
});
