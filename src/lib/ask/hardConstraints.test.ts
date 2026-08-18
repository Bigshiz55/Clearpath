import { describe, it, expect } from 'vitest';
import {
  constraintsFrom,
  evaluateCandidate,
  isEligible,
  describeConstraint,
  type CandidateFacts,
  type HardConstraint,
} from './hardConstraints';
import { EMPTY_INTENT, type CanonicalIntent } from '@/lib/interpret/types';

/**
 * WHAT THE USER ASKED FOR IS NOT A RANKING SIGNAL.
 *
 * ── THE PRODUCTION FAILURE ────────────────────────────────────────────────
 * "Looking for a good Samuel L Jackson movie I may not have seen" returned The
 * Furious (2026), Backrooms (2026) and The End of Oak Street (2026) at "100
 * match". None of them has Samuel L. Jackson in it.
 *
 * Eligibility filtering existed — but only for SUBJECTS. `finder.ts` read
 *   const eligibleSurvivors = subjectRequired ? survivors.filter(isEligible) : survivors;
 * so "a boxing movie" was protected and "a Samuel L Jackson movie" was not. A
 * person was only ever a RETRIEVAL hint (`with_cast`), and anything that
 * entered the pool another way met no gate at all.
 *
 * This module is the missing half: the things a person explicitly ASKED for,
 * expressed once, checked per candidate, with the verdict carried as evidence
 * rather than folded into a number.
 *
 * THE RULE THAT MAKES IT HARD: unverifiable is not a pass. A candidate whose
 * credits could not be read fails a person constraint — "we could not check"
 * has never been evidence that something is true.
 *
 * PURE. No I/O, no clock.
 */

const SLJ = 2231;
const EASTWOOD = 190;

const intent = (over: Partial<CanonicalIntent> = {}): CanonicalIntent => ({ ...EMPTY_INTENT, kind: 'recommendation', ...over });

const facts = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  mediaType: 'movie', castIds: [], directorIds: [], genreNames: [], creditsKnown: true, ...over,
});

describe('constraints are extracted from the canonical intent, never from raw text', () => {
  it('a required person becomes an actor constraint carrying the resolved id', () => {
    const cs = constraintsFrom(
      intent({ media: 'movie', people: [{ span: 'Samuel L Jackson', relation: 'required', role: 'any' }] }),
      { resolved: new Map([['Samuel L Jackson', { personId: SLJ, name: 'Samuel L. Jackson' }]]) },
    );
    expect(cs.kind).toBe('apply');
    if (cs.kind !== 'apply') return;
    const person = cs.constraints.find((c) => c.type === 'person');
    expect(person).toMatchObject({ type: 'person', personId: SLJ, role: 'actor', required: true });
  });

  it('a stated "directed by" becomes a DIRECTOR constraint, never an actor one', () => {
    const cs = constraintsFrom(
      intent({ media: 'movie', people: [{ span: 'Clint Eastwood', relation: 'required', role: 'director' }] }),
      { resolved: new Map([['Clint Eastwood', { personId: EASTWOOD, name: 'Clint Eastwood' }]]) },
    );
    expect(cs.kind).toBe('apply');
    if (cs.kind !== 'apply') return;
    expect(cs.constraints.find((c) => c.type === 'person')).toMatchObject({ role: 'director' });
  });

  it('a vetoed genre becomes an exclusion', () => {
    const cs = constraintsFrom(
      intent({ media: 'movie', genres: [{ span: 'horror', wanted: false, holder: 'user' }] }),
      { resolved: new Map() },
    );
    expect(cs.kind).toBe('apply');
    if (cs.kind !== 'apply') return;
    expect(cs.constraints).toContainEqual({ type: 'genre', value: 'horror', excluded: true });
  });

  it('a WANTED genre is NOT a hard constraint — it ranks, it does not gate', () => {
    /* "a crime thriller" is a preference. Gating on it would delete the good
       answer that happens to be tagged only Drama. */
    const cs = constraintsFrom(
      intent({ media: 'movie', genres: [{ span: 'crime', wanted: true, holder: 'user' }] }),
      { resolved: new Map() },
    );
    expect(cs.kind).toBe('apply');
    if (cs.kind !== 'apply') return;
    expect(cs.constraints.some((c) => c.type === 'genre')).toBe(false);
  });

  it('a stated medium is a hard constraint; an unstated one is not', () => {
    const stated = constraintsFrom(intent({ media: 'movie' }), { resolved: new Map() });
    expect(stated.kind === 'apply' && stated.constraints).toContainEqual({ type: 'media', value: 'movie', required: true });
    const unstated = constraintsFrom(intent({ media: 'either' }), { resolved: new Map() });
    expect(unstated.kind === 'apply' && unstated.constraints.some((c) => c.type === 'media')).toBe(false);
  });
});

describe('A REQUIREMENT THAT CANNOT BE RESOLVED IS NEVER SILENTLY DROPPED', () => {
  /* THE SECOND HALF OF THE PRODUCTION DEFECT. `canonicalExecution` read
       if (p.kind !== 'resolved') return;
     so an unresolvable person vanished — no constraint, no refusal, no signal
     — and the query proceeded as though the user had asked for nothing. */
  it('an unresolved required person BLOCKS rather than disappearing', () => {
    const cs = constraintsFrom(
      intent({ media: 'movie', people: [{ span: 'Samuel L Jackson', relation: 'required', role: 'any' }] }),
      { resolved: new Map() },
    );
    expect(cs.kind).toBe('blocked');
    if (cs.kind !== 'blocked') return;
    expect(cs.unresolved).toEqual([{ type: 'person', entity: 'Samuel L Jackson', reason: 'unresolved' }]);
  });

  it('the block names the person, so the caller can say something true', () => {
    const cs = constraintsFrom(
      intent({ media: 'movie', people: [{ span: 'Nobody At All', relation: 'required', role: 'any' }] }),
      { resolved: new Map() },
    );
    expect(cs.kind === 'blocked' && cs.unresolved[0]?.entity).toBe('Nobody At All');
  });

  it('constraints that DID resolve are still reported alongside the block', () => {
    // The caller may want to explain precisely what it could and could not do.
    const cs = constraintsFrom(
      intent({
        media: 'movie',
        people: [
          { span: 'Samuel L Jackson', relation: 'required', role: 'any' },
          { span: 'Ghost Person', relation: 'required', role: 'any' },
        ],
      }),
      { resolved: new Map([['Samuel L Jackson', { personId: SLJ, name: 'Samuel L. Jackson' }]]) },
    );
    expect(cs.kind).toBe('blocked');
    if (cs.kind !== 'blocked') return;
    expect(cs.constraints.some((c) => c.type === 'person' && c.personId === SLJ)).toBe(true);
  });
});

describe('eligibility — a candidate either satisfies the request or it does not', () => {
  const requireSLJ: HardConstraint = { type: 'person', entity: 'Samuel L. Jackson', personId: SLJ, role: 'actor', required: true };
  const requireMovie: HardConstraint = { type: 'media', value: 'movie', required: true };
  const noHorror: HardConstraint = { type: 'genre', value: 'horror', excluded: true };

  it('a film he is in satisfies the constraint', () => {
    const ev = evaluateCandidate(facts({ castIds: [SLJ, 99] }), [requireSLJ]);
    expect(ev.hardConstraintsSatisfied).toHaveLength(1);
    expect(ev.hardConstraintsMissing).toHaveLength(0);
    expect(isEligible(ev)).toBe(true);
  });

  it('THE PRODUCTION CASE — a film he is not in is INELIGIBLE, whatever its quality', () => {
    const ev = evaluateCandidate(facts({ castIds: [12345] }), [requireSLJ]);
    expect(ev.hardConstraintsMissing).toHaveLength(1);
    expect(isEligible(ev)).toBe(false);
  });

  it('UNVERIFIABLE IS NOT A PASS — unknown credits fail the constraint', () => {
    const ev = evaluateCandidate(facts({ castIds: [], creditsKnown: false }), [requireSLJ]);
    expect(isEligible(ev)).toBe(false);
  });

  it('a director constraint reads the crew, not the cast', () => {
    const dir: HardConstraint = { type: 'person', entity: 'Clint Eastwood', personId: EASTWOOD, role: 'director', required: true };
    expect(isEligible(evaluateCandidate(facts({ directorIds: [EASTWOOD] }), [dir]))).toBe(true);
    // Appearing in it is not directing it.
    expect(isEligible(evaluateCandidate(facts({ castIds: [EASTWOOD] }), [dir]))).toBe(false);
  });

  it('an excluded genre disqualifies', () => {
    expect(isEligible(evaluateCandidate(facts({ genreNames: ['Horror'] }), [noHorror]))).toBe(false);
    expect(isEligible(evaluateCandidate(facts({ genreNames: ['Thriller'] }), [noHorror]))).toBe(true);
  });

  it('the wrong medium disqualifies', () => {
    expect(isEligible(evaluateCandidate(facts({ mediaType: 'tv' }), [requireMovie]))).toBe(false);
  });

  it('EVERY constraint must hold — satisfying one is not satisfying the request', () => {
    const ev = evaluateCandidate(facts({ castIds: [SLJ], genreNames: ['Horror'] }), [requireSLJ, noHorror]);
    expect(ev.hardConstraintsSatisfied).toHaveLength(1);
    expect(ev.hardConstraintsMissing).toHaveLength(1);
    expect(isEligible(ev)).toBe(false);
  });

  it('no constraints means everything is eligible — an ordinary request pays nothing', () => {
    expect(isEligible(evaluateCandidate(facts(), []))).toBe(true);
  });

  it('a constraint can be described in words, for the explanation layer', () => {
    expect(describeConstraint(requireSLJ).toLowerCase()).toContain('samuel l. jackson');
    expect(describeConstraint(noHorror).toLowerCase()).toContain('horror');
  });
});
