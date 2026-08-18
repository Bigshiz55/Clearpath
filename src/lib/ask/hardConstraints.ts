/**
 * WHAT THE USER EXPLICITLY ASKED FOR — separated from what merely ranks well.
 *
 * ── THE PRODUCTION FAILURE THIS EXISTS TO MAKE IMPOSSIBLE ─────────────────
 * "Looking for a good Samuel L Jackson movie I may not have seen" answered with
 * The Furious (2026), Backrooms (2026) and The End of Oak Street (2026), each
 * labelled "100 match". None of them has Samuel L. Jackson in it.
 *
 * The interpreter was right; it emitted the person. Three things downstream
 * were not:
 *
 *  1. Resolution missed on punctuation ("Samuel L Jackson" vs the catalog's
 *     "Samuel L. Jackson") — fixed in `personReference.ts`.
 *  2. The unresolved requirement was SILENTLY DROPPED: `canonicalExecution`
 *     read `if (p.kind !== 'resolved') return;`, so the query proceeded as
 *     though nothing had been asked for.
 *  3. Nothing downstream could catch it, because eligibility filtering existed
 *     only for SUBJECTS: `finder.ts` read
 *       `subjectRequired ? survivors.filter(isEligible) : survivors`.
 *     "a boxing movie" was protected. "a Samuel L Jackson movie" was not.
 *
 * ── THE DISTINCTION THIS MODULE DRAWS ─────────────────────────────────────
 * HARD constraints are things the person SAID. They decide who is allowed to
 * be an answer at all, before any ranking runs. SOFT preferences — taste,
 * mood, tone, a wanted genre — decide the ORDER of the answers that qualify.
 * Collapsing the two is how "100% match" ends up on a film that fails the only
 * thing the user actually specified.
 *
 * A wanted genre is deliberately NOT hard. "a crime thriller" is a preference,
 * and gating on it deletes the excellent answer tagged only Drama. What the
 * user vetoed ("not horror") IS hard: a veto is not a wish.
 *
 * ── THE RULE THAT MAKES IT HARD ───────────────────────────────────────────
 * UNVERIFIABLE IS NOT A PASS. A candidate whose credits could not be read
 * fails a person constraint. "We could not check" has never been evidence that
 * something is true, and the alternative — admitting unchecked candidates —
 * is exactly the behaviour that produced the reported failure.
 *
 * PURE. No I/O, no clock. Resolution happens before this and arrives as ids.
 */
import type { CanonicalIntent } from '@/lib/interpret/types';

/** The credit roles this engine can actually enforce. */
export type ConstraintRole = 'actor' | 'director';

export type HardConstraint =
  | { type: 'person'; entity: string; personId: number; role: ConstraintRole; required: true }
  | { type: 'person'; entity: string; personId: number; role: ConstraintRole; excluded: true }
  | { type: 'genre'; value: string; excluded: true }
  | { type: 'media'; value: 'movie' | 'tv'; required: true };

/** A requirement the sentence made that could not be turned into a constraint. */
export interface UnresolvedRequirement {
  type: 'person';
  entity: string;
  reason: 'unresolved' | 'unsupported-role';
}

/**
 * A DISCRIMINATED PLAN, because the two outcomes are not degrees of each other.
 *
 * `blocked` still carries whatever DID resolve, so a caller can explain exactly
 * what it could and could not honour rather than choosing between silence and
 * a bare failure.
 */
export type ConstraintPlan =
  | { kind: 'apply'; constraints: HardConstraint[] }
  | { kind: 'blocked'; constraints: HardConstraint[]; unresolved: UnresolvedRequirement[] };

/** Identities resolved upstream, keyed by the span the user actually said. */
export interface ResolvedPeople {
  resolved: Map<string, { personId: number; name: string }>;
}

/** TV cannot be filtered by credit at the provider; see `people/constraint.ts`. */
function roleFor(intentRole: string, media: CanonicalIntent['media']): ConstraintRole | null {
  if (media === 'tv') return null;
  if (intentRole === 'director') return 'director';
  if (intentRole === 'actor' || intentRole === 'any') return 'actor';
  return null;
}

export function constraintsFrom(intent: CanonicalIntent, people: ResolvedPeople): ConstraintPlan {
  const constraints: HardConstraint[] = [];
  const unresolved: UnresolvedRequirement[] = [];

  if (intent.media === 'movie' || intent.media === 'tv') {
    constraints.push({ type: 'media', value: intent.media, required: true });
  }

  for (const p of intent.people) {
    const hit = people.resolved.get(p.span);
    const role = roleFor(p.role, intent.media);
    if (role === null) {
      unresolved.push({ type: 'person', entity: p.span, reason: 'unsupported-role' });
      continue;
    }
    if (!hit) {
      // NEVER SILENTLY DROPPED — this is the reported defect.
      unresolved.push({ type: 'person', entity: p.span, reason: 'unresolved' });
      continue;
    }
    constraints.push(
      p.relation === 'excluded'
        ? { type: 'person', entity: hit.name, personId: hit.personId, role, excluded: true }
        : { type: 'person', entity: hit.name, personId: hit.personId, role, required: true },
    );
  }

  // A VETO IS NOT A WISH. Wanted genres rank; vetoed genres gate.
  for (const g of intent.genres) {
    if (!g.wanted) constraints.push({ type: 'genre', value: g.span, excluded: true });
  }

  return unresolved.length > 0 ? { kind: 'blocked', constraints, unresolved } : { kind: 'apply', constraints };
}

/** What we know about one candidate. `creditsKnown: false` means we could not check. */
export interface CandidateFacts {
  mediaType: 'movie' | 'tv';
  castIds: number[];
  directorIds: number[];
  genreNames: string[];
  creditsKnown: boolean;
}

/**
 * THE EVIDENCE OBJECT every recommendation carries.
 *
 * Deliberately not a number. A score can only say "94"; this says WHICH
 * requirements were met and which were not, which is what an explanation layer
 * needs and what a reviewer needs to tell a real match from a lucky one.
 */
export interface ConstraintEvidence {
  hardConstraintsSatisfied: HardConstraint[];
  hardConstraintsMissing: HardConstraint[];
  positiveSignals: string[];
  negativeSignals: string[];
}

function holds(facts: CandidateFacts, c: HardConstraint): boolean {
  switch (c.type) {
    case 'media':
      return facts.mediaType === c.value;
    case 'genre':
      // Excluded: the candidate must NOT carry it.
      return !facts.genreNames.some((g) => g.toLowerCase() === c.value.toLowerCase());
    case 'person': {
      // UNVERIFIABLE IS NOT A PASS.
      if (!facts.creditsKnown) return false;
      const pool = c.role === 'director' ? facts.directorIds : facts.castIds;
      const present = pool.includes(c.personId);
      return 'excluded' in c ? !present : present;
    }
    default:
      return false;
  }
}

export function evaluateCandidate(facts: CandidateFacts, constraints: readonly HardConstraint[]): ConstraintEvidence {
  const satisfied: HardConstraint[] = [];
  const missing: HardConstraint[] = [];
  for (const c of constraints) (holds(facts, c) ? satisfied : missing).push(c);
  return {
    hardConstraintsSatisfied: satisfied,
    hardConstraintsMissing: missing,
    positiveSignals: satisfied.map(describeConstraint),
    negativeSignals: missing.map((c) => `does not satisfy: ${describeConstraint(c)}`),
  };
}

/** Eligible means EVERY stated requirement holds. One miss is a miss. */
export function isEligible(evidence: ConstraintEvidence): boolean {
  return evidence.hardConstraintsMissing.length === 0;
}

/** One constraint, in words the explanation layer can print. */
export function describeConstraint(c: HardConstraint): string {
  switch (c.type) {
    case 'media':
      return c.value === 'movie' ? 'a movie' : 'a TV series';
    case 'genre':
      return `no ${c.value}`;
    case 'person':
      return 'excluded' in c
        ? `without ${c.entity}`
        : c.role === 'director'
          ? `directed by ${c.entity}`
          : `starring ${c.entity}`;
    default:
      return 'a stated requirement';
  }
}
