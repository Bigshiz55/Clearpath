import { describe, it, expect } from 'vitest';
import { evaluateSubjectCentrality, type SubjectRequirement } from './semanticEligibility';
import { extractResultCount } from './count';

/**
 * IMMUTABLE PRODUCTION REGRESSION — the exact live failure.
 *
 * On 2026-08-07 an authenticated request of EXACTLY:
 *
 *     "Give me three boxing movies that I would like."
 *
 * returned **Snake Eyes (1998)** as the first (and only) result. Boxing in
 * Snake Eyes is incidental — a corrupt cop is *at* an Atlantic City boxing
 * match when the Secretary of Defense is assassinated beside him; the film is a
 * conspiracy thriller, not a boxing movie. The request asked for THREE and got
 * ONE.
 *
 * This test freezes that exact sentence and the exact wrong answer. It is a
 * black box over the two deterministic contract pieces the live path depends
 * on — the count parser and the subject-centrality evaluator — with a candidate
 * pool built from real TMDB-shaped records including the actual Snake Eyes
 * overview. It asserts, forever:
 *
 *   1. The count parser reads THREE (not 1, and not a runtime/year number).
 *   2. Snake Eyes is FAIL / INCIDENTAL — it is never eligible.
 *   3. Every genuinely-central boxing movie in the pool is eligible.
 *   4. At least three central boxing movies remain eligible, so the request
 *      can be answered in full without padding.
 *
 * DO NOT weaken, retitle, or delete this test. It is evidence of a real
 * production defect and the guarantee it does not return. Fixing it by adding a
 * boxing-specific rule instead of a general one is a governance violation — the
 * evaluator here is the same subject-agnostic function the whole app uses.
 */

const EXACT_REQUEST = 'Give me three boxing movies that I would like.';

const BOXING: SubjectRequirement = {
  canonical: 'boxing',
  label: 'Boxing',
  lexemes: ['boxing', 'boxer', 'prizefighter', 'prizefighting', 'heavyweight', 'ring', 'knockout', 'boxing match'],
  strict: true,
};

interface Rec {
  title: string;
  overview: string;
  genres: string[];
  keywords: string[];
  // Independent ground truth, authored by hand.
  central: boolean;
}

// Real-shaped TMDB records. The three central titles are canonical boxing
// films; Snake Eyes and Pulp Fiction are the incidental decoys that must never
// be served for "a boxing movie".
const POOL: Rec[] = [
  {
    title: 'Snake Eyes',
    overview:
      'Corrupt cop Rick Santoro is at an Atlantic City boxing match when the Secretary of Defense is assassinated beside him, and he uncovers a sprawling conspiracy over one rain-soaked night.',
    genres: ['Crime', 'Thriller', 'Mystery'],
    keywords: ['conspiracy', 'assassination', 'boxing', 'casino', 'atlantic city'],
    central: false,
  },
  {
    title: 'Pulp Fiction',
    overview:
      'The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner robbers intertwine in four tales of violence and redemption.',
    genres: ['Thriller', 'Crime'],
    keywords: ['hitman', 'boxer', 'crime', 'nonlinear'],
    central: false,
  },
  {
    title: 'Creed',
    overview:
      'The former World Heavyweight Champion Rocky Balboa serves as a trainer and mentor to Adonis Johnson, a rising boxer chasing the title in his first professional fights.',
    genres: ['Drama'],
    keywords: ['boxing', 'boxer', 'sport', 'trainer'],
    central: true,
  },
  {
    title: 'The Fighter',
    overview:
      'The story of boxer Micky Ward and his brother Dicky, a former boxer turned trainer, on his hard road through the ring to a championship title shot.',
    genres: ['Drama'],
    keywords: ['boxing', 'boxer', 'based on a true story'],
    central: true,
  },
  {
    title: 'Million Dollar Baby',
    overview:
      'A determined waitress works with a hardened boxing trainer to become a professional boxer, fighting her way up through the ring toward a title.',
    genres: ['Drama'],
    keywords: ['boxing', 'boxer', 'trainer'],
    central: true,
  },
  {
    title: 'Cinderella Man',
    overview:
      'During the Great Depression, common-man heavyweight boxer James J. Braddock makes an improbable comeback in the ring to fight for the championship and feed his family.',
    genres: ['Drama', 'History'],
    keywords: ['boxing', 'boxer', 'great depression', 'heavyweight'],
    central: true,
  },
];

describe('IMMUTABLE regression — "Give me three boxing movies that I would like."', () => {
  it('parses the requested count as THREE (not one, not a stray number)', () => {
    expect(extractResultCount(EXACT_REQUEST)).toBe(3);
  });

  it('rejects Snake Eyes — boxing is incidental (setting), never eligible', () => {
    const snake = POOL.find((r) => r.title === 'Snake Eyes')!;
    const v = evaluateSubjectCentrality(BOXING, {
      title: snake.title,
      overview: snake.overview,
      genres: snake.genres,
      keywords: snake.keywords,
    });
    expect(v.status).toBe('FAIL');
    expect(v.centrality).toBe('INCIDENTAL');
    expect(v.signals.settingOnly).toBe(true);
  });

  it('rejects Pulp Fiction — a boxer character, not a boxing movie', () => {
    const pulp = POOL.find((r) => r.title === 'Pulp Fiction')!;
    const v = evaluateSubjectCentrality(BOXING, {
      title: pulp.title,
      overview: pulp.overview,
      genres: pulp.genres,
      keywords: pulp.keywords,
    });
    expect(v.status).toBe('FAIL');
  });

  it('accepts every genuinely-central boxing movie', () => {
    for (const rec of POOL.filter((r) => r.central)) {
      const v = evaluateSubjectCentrality(BOXING, {
        title: rec.title,
        overview: rec.overview,
        genres: rec.genres,
        keywords: rec.keywords,
      });
      expect(v.status, `${rec.title} should PASS`).toBe('PASS');
      expect(v.centrality, `${rec.title} should be CENTRAL`).toBe('CENTRAL');
    }
  });

  it('leaves at least three eligible central boxing movies — the request can be answered in full, no decoy, no padding', () => {
    const eligible = POOL.filter((rec) => {
      const v = evaluateSubjectCentrality(BOXING, {
        title: rec.title,
        overview: rec.overview,
        genres: rec.genres,
        keywords: rec.keywords,
      });
      return v.status === 'PASS';
    });
    expect(eligible.length).toBeGreaterThanOrEqual(3);
    // The eligible set is exactly the central titles — no decoy leaked in.
    expect(eligible.every((r) => r.central)).toBe(true);
    expect(eligible.some((r) => r.title === 'Snake Eyes')).toBe(false);
  });
});
