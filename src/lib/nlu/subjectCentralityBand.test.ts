import { describe, it, expect } from 'vitest';
import { evaluateSubjectCentrality, type SubjectRequirement } from './semanticEligibility';

/**
 * THE BASEBALL FALSE-NEGATIVE — the failure this change exists to stop.
 *
 * "Give me three movies about baseball that I would like." returned nothing.
 * The deterministic evaluator equated centrality with literal repetition of the
 * word "baseball", so a real baseball film whose overview talks about the A's, a
 * GM, players and sabermetrics — rarely the literal word — was rejected outright.
 *
 * The generalized architecture does NOT try to solve this with a bigger word
 * list. It splits candidates into three zones:
 *   • CONFIDENT CENTRAL   → pass deterministically (title hit / strong overview)
 *   • CONFIDENT INCIDENTAL → reject deterministically (setting-only, Snake Eyes)
 *   • AMBIGUOUS (a lone tag + a light mention) → escalate to the semantic
 *     adjudicator, which tells Moneyball (baseball) from Pulp Fiction (a boxer
 *     among an ensemble). Both look identical to any counting rule.
 *
 * These tests prove the PARTITION — the thing that is provable offline without a
 * model. The real baseball films must land in the ambiguous band (so they are
 * escalated, not silently killed); the incidental decoys must be rejected before
 * the band (so the model is never asked to save a Snake Eyes). The band's final
 * CENTRAL/INCIDENTAL resolution is the adjudicator's job (model-backed in prod).
 */

const baseball: SubjectRequirement = { canonical: 'baseball', label: 'Baseball', lexemes: ['baseball'], strict: true };
const boxing: SubjectRequirement = {
  canonical: 'boxing',
  label: 'Boxing',
  lexemes: ['boxing', 'boxer', 'prizefighter', 'ring', 'knockout', 'heavyweight', 'boxing match'],
  strict: true,
};

// Real public TMDB synopses + representative keyword tags. NOT doctored to add
// or remove the literal subject word.
const BASEBALL_FILMS = [
  { title: 'Moneyball', overview: "Oakland A's general manager Billy Beane's successful attempt to assemble a baseball team on a lean budget by employing computer-generated analysis to acquire new players.", genres: ['Drama'], keywords: ['baseball', 'based on a true story', 'sport'] },
  { title: 'Field of Dreams', overview: "Ray Kinsella is an Iowa farmer who hears a mysterious voice telling him to build a baseball diamond in his cornfield. He builds the field and the ghosts of great players emerge.", genres: ['Drama', 'Fantasy'], keywords: ['baseball', 'iowa', 'ghost'] },
  { title: 'The Natural', overview: 'An unknown middle-aged batter named Roy Hobbs with a mysterious past appears out of nowhere to take a losing team to the top of the league.', genres: ['Drama'], keywords: ['baseball', 'sport'] },
  { title: 'Major League', overview: "The new owner of the Cleveland Indians puts together a purposely horrible team so they'll lose and she can move the team.", genres: ['Comedy'], keywords: ['baseball', 'cleveland'] },
];

describe('generalized subject partition — the baseball false-negative', () => {
  it('real baseball films are NOT silently rejected — they enter the adjudication band', () => {
    for (const f of BASEBALL_FILMS) {
      const v = evaluateSubjectCentrality(baseball, { title: f.title, overview: f.overview, genres: f.genres, keywords: f.keywords });
      // They must be flagged ambiguous (escalated), NOT UNSUPPORTED/rejected outright.
      expect(v.ambiguous, `${f.title} must be escalated to the adjudicator, not killed`).toBe(true);
      expect(v.centrality, `${f.title} should be MATERIAL (borderline), not UNSUPPORTED`).toBe('MATERIAL');
    }
  });

  it('a confident-central boxing film still passes deterministically (no model needed)', () => {
    const creed = evaluateSubjectCentrality(boxing, {
      title: 'Creed',
      overview: 'The former World Heavyweight Champion Rocky Balboa mentors Adonis Johnson, a rising boxer chasing the title through his first professional fights in the ring.',
      genres: ['Drama'],
      keywords: ['boxing', 'boxer', 'sport'],
    });
    expect(creed.status).toBe('PASS');
    expect(creed.centrality).toBe('CENTRAL');
    expect(creed.ambiguous).toBe(false);
  });

  it('an incidental decoy is rejected BEFORE the band — the model is never asked to save it', () => {
    const snake = evaluateSubjectCentrality(boxing, {
      title: 'Snake Eyes',
      overview: 'A corrupt cop is at an Atlantic City boxing match when the Secretary of Defense is assassinated beside him, and he uncovers a conspiracy.',
      genres: ['Crime', 'Thriller'],
      keywords: ['conspiracy', 'assassination', 'boxing'],
    });
    expect(snake.status).toBe('FAIL');
    expect(snake.centrality).toBe('INCIDENTAL');
    // Not ambiguous → never escalated → the deterministic layer alone kills it.
    expect(snake.ambiguous).toBe(false);
    expect(snake.signals.settingOnly).toBe(true);
  });
});
