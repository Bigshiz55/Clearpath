import { describe, it, expect } from 'vitest';
import {
  constraintsFrom,
  evaluateCandidate,
  isEligible,
  describeConstraint,
  qualifyCandidates,
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

/**
 * ONE ANSWER TO "CAN THIS CANDIDATE SATISFY THE REQUEST?"
 *
 * Enforcement was split three ways: subject centrality filtered in `finder.ts`,
 * person credits verified inside `qualifyByRole`, media and genre exclusions
 * applied at the provider. Three places, three shapes, and only the subject one
 * had a leak guard — which is precisely the architecture mistake just removed
 * from interpretation, one layer down.
 *
 * The decision now lives here for every explicit requirement. I/O still lives
 * outside (credits must be fetched), but the VERDICT is computed in one pure
 * function, so "eligible" cannot mean two different things in two files.
 */
describe('subject centrality is a constraint like any other', () => {
  const needsBoxing: HardConstraint = { type: 'subject', value: 'boxing', required: true };

  it('a candidate the evaluator judged central satisfies it', () => {
    expect(isEligible(evaluateCandidate(facts({ subjectSatisfied: true }), [needsBoxing]))).toBe(true);
  });

  it('one it judged peripheral does not', () => {
    expect(isEligible(evaluateCandidate(facts({ subjectSatisfied: false }), [needsBoxing]))).toBe(false);
  });

  it('REJECT ON UNCERTAINTY — an unjudged candidate is not eligible', () => {
    // The same rule the finder already applied: no verdict means it stays out.
    expect(isEligible(evaluateCandidate(facts({ subjectSatisfied: null }), [needsBoxing]))).toBe(false);
  });
});

describe('qualifyCandidates — the one gate, batched and bounded', () => {
  const SLJ2 = 2231;
  const requireSLJ: HardConstraint = { type: 'person', entity: 'Samuel L. Jackson', personId: SLJ2, role: 'actor', required: true };
  type Item = { id: number; mediaType: 'movie' | 'tv'; title: string };
  const items: Item[] = [
    { id: 1, mediaType: 'movie', title: 'In It' },
    { id: 2, mediaType: 'movie', title: 'Not In It' },
    { id: 3, mediaType: 'movie', title: 'Also In It' },
  ];
  const fetchFacts = async (i: Item) =>
    facts({ castIds: i.id === 2 ? [999] : [SLJ2], mediaType: i.mediaType });

  it('keeps only the candidates that satisfy every requirement', async () => {
    const out = await qualifyCandidates(items, [requireSLJ], fetchFacts, { need: 10 });
    expect(out.map((r) => r.item.title)).toEqual(['In It', 'Also In It']);
  });

  /* THE PROPERTY THAT PROTECTS THE REAL PIPELINE ORDER.
     In `runFinder` the personal ranker sorts the pool BEFORE this gate runs,
     so the gate sees a taste-ordered list. That is safe only if position is
     irrelevant to the verdict — if a title the reader would adore is dropped
     just as readily as one they would not. This pins that: the same pool,
     reversed, yields the same survivors. Taste chooses the ORDER, and thereby
     which candidates get verified first; it never buys a place in the answer. */
  it('an INELIGIBLE candidate ranked FIRST is still dropped', async () => {
    const tasteFirst: Item[] = [
      { id: 2, mediaType: 'movie', title: 'Not In It' }, // taste's favourite
      { id: 1, mediaType: 'movie', title: 'In It' },
      { id: 3, mediaType: 'movie', title: 'Also In It' },
    ];
    const out = await qualifyCandidates(tasteFirst, [requireSLJ], fetchFacts, { need: 10 });
    expect(out.map((r) => r.item.title)).toEqual(['In It', 'Also In It']);
  });

  it('survivors are identical whatever order the ranker hands over', async () => {
    const forward = await qualifyCandidates(items, [requireSLJ], fetchFacts, { need: 10 });
    const backward = await qualifyCandidates([...items].reverse(), [requireSLJ], fetchFacts, { need: 10 });
    expect(new Set(backward.map((r) => r.item.id))).toEqual(new Set(forward.map((r) => r.item.id)));
  });

  it('carries the evidence forward, so nothing has to recompute it', async () => {
    const out = await qualifyCandidates(items, [requireSLJ], fetchFacts, { need: 10 });
    expect(out[0]!.evidence.hardConstraintsSatisfied).toHaveLength(1);
    expect(out[0]!.evidence.positiveSignals.join(' ')).toContain('Samuel L. Jackson');
  });

  it('NO N+1 — work stops once enough candidates qualify', async () => {
    /* The pool must exceed one batch for this to prove anything: within a
       single round every candidate is fetched concurrently on purpose, and the
       bound being asserted is that later ROUNDS never happen once `need` is
       met. A 3-item pool fits in one batch and would pass vacuously. */
    const big: Item[] = Array.from({ length: 40 }, (_, n) => ({ id: n + 10, mediaType: 'movie', title: `T${n}` }));
    const seen: number[] = [];
    const counted = async (i: Item) => {
      seen.push(i.id);
      return facts({ castIds: [SLJ2] });
    };
    await qualifyCandidates(big, [requireSLJ], counted, { need: 1 });
    expect(seen.length, 'must not walk the whole pool to return one').toBeLessThan(big.length);
    expect(seen.length, 'and must not exceed a single bounded round').toBeLessThanOrEqual(12);
  });

  it('a request with NO constraints fetches nothing at all', async () => {
    const seen: number[] = [];
    const counted = async (i: Item) => {
      seen.push(i.id);
      return fetchFacts(i);
    };
    const out = await qualifyCandidates(items, [], counted, { need: 10 });
    expect(seen).toEqual([]);
    expect(out).toHaveLength(items.length);
  });

  it('a fact lookup that throws drops the candidate rather than the request', async () => {
    const flaky = async (i: Item) => {
      if (i.id === 1) throw new Error('tmdb down');
      return fetchFacts(i);
    };
    const out = await qualifyCandidates(items, [requireSLJ], flaky, { need: 10 });
    expect(out.map((r) => r.item.title)).toEqual(['Also In It']);
  });
});

describe('AN INELIGIBLE CANDIDATE CAN NEVER BE SCORED', () => {
  it('the gate returns only eligible candidates, so ranking never sees the rest', async () => {
    /* The property the split enforcement could not state: there is no path from
       a failed requirement to a recommendation score, because the rejected
       candidate does not survive the gate to be scored at all. */
    const requireSLJ: HardConstraint = { type: 'person', entity: 'Samuel L. Jackson', personId: 2231, role: 'actor', required: true };
    const pool = [{ id: 7, mediaType: 'movie' as const }];
    const out = await qualifyCandidates(pool, [requireSLJ], async () => facts({ castIds: [] }), { need: 5 });
    expect(out).toEqual([]);
  });
});

describe('properties inherited from the retired qualifyByRole walker', () => {
  /* `qualifyByRole` was the person-only predecessor of `qualifyCandidates`. It
     is retired, and the properties its suite pinned are asserted here so
     nothing was lost in the consolidation. */
  const NOLAN = 525;
  const dirNolan: HardConstraint = { type: 'person', entity: 'Christopher Nolan', personId: NOLAN, role: 'director', required: true };

  it('TWO NAMED PEOPLE MEANS BOTH, NEVER EITHER', async () => {
    const other: HardConstraint = { type: 'person', entity: 'Someone Else', personId: 999, role: 'director', required: true };
    const ev = evaluateCandidate(facts({ directorIds: [NOLAN] }), [dirNolan, other]);
    expect(isEligible(ev), 'the second director is not on this film').toBe(false);
  });

  it('a film he only PRODUCED does not satisfy "directed by"', () => {
    // Produced credits never reach directorIds, so association is not the role.
    expect(isEligible(evaluateCandidate(facts({ directorIds: [], castIds: [] }), [dirNolan]))).toBe(false);
  });

  it('a television title can never satisfy a movie-only person request', () => {
    const movieOnly: HardConstraint = { type: 'media', value: 'movie', required: true };
    expect(isEligible(evaluateCandidate(facts({ mediaType: 'tv', directorIds: [NOLAN] }), [dirNolan, movieOnly]))).toBe(false);
  });
});
