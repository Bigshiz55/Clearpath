import { describe, it, expect } from 'vitest';
import {
  discoverParamFor,
  filterByRole,
  fromCastIds,
  idsForRole,
  requestedRoleFor,
  roleSupport,
  satisfiesRole,
  type CreditsView,
} from './constraint';

/**
 * THE ROLE IS A HARD CONSTRAINT, AND UNSUPPORTED BEATS CONFIDENTLY WRONG.
 *
 * The production defect: "movies directed by Christopher Nolan" executed as
 * `with_cast=525`, silently converting a director into an actor. These are the
 * properties that make that unrepresentable rather than merely unlikely.
 */

const NOLAN = 525;
const WILLIS = 62;

/** Inception: Nolan directs and writes; Leonardo DiCaprio is in the cast. */
const INCEPTION: CreditsView = {
  cast: [{ id: 6193 }],
  crew: [
    { id: NOLAN, job: 'Director', department: 'Directing' },
    { id: NOLAN, job: 'Writer', department: 'Writing' },
  ],
};

/** A film Nolan PRODUCED and did not direct — the case `with_crew` lets through. */
const PRODUCED_ONLY: CreditsView = {
  cast: [{ id: 999 }],
  crew: [{ id: NOLAN, job: 'Producer', department: 'Production' }],
};

/** An assistant director in the Directing department — not the director. */
const ASSISTANT_ONLY: CreditsView = {
  cast: [],
  crew: [{ id: NOLAN, job: 'First Assistant Director', department: 'Directing' }],
};

describe('retrieval sends the role, and the two roles differ', () => {
  it('director retrieves on crew; actor retrieves on cast', () => {
    expect(discoverParamFor('director')).toBe('with_crew');
    expect(discoverParamFor('actor')).toBe('with_cast');
  });

  it('and they are not the same parameter', () => {
    expect(discoverParamFor('director')).not.toBe(discoverParamFor('actor'));
  });
});

describe('qualification is what makes the director constraint HARD', () => {
  it('a film he directed qualifies', () => {
    expect(satisfiesRole(INCEPTION, { personId: NOLAN, role: 'director' })).toBe(true);
  });

  it('a film he only PRODUCED does not — this is what with_crew alone lets through', () => {
    /* THE REASON RETRIEVAL IS NOT SUFFICIENT. `with_crew=525` returns every
       title Nolan worked on in any capacity. Without this check the product
       would answer "directed by Nolan" with films he produced, which is the
       same class of wrong as answering with films he acted in. */
    expect(satisfiesRole(PRODUCED_ONLY, { personId: NOLAN, role: 'director' })).toBe(false);
  });

  it('nor does an assistant-director credit in the Directing department', () => {
    // `department` alone would admit this; the `job` is the precise claim.
    expect(satisfiesRole(ASSISTANT_ONLY, { personId: NOLAN, role: 'director' })).toBe(false);
  });

  it('UNVERIFIABLE IS NOT A PASS', () => {
    // "We could not check" is not evidence the constraint holds.
    expect(satisfiesRole(null, { personId: NOLAN, role: 'director' })).toBe(false);
  });

  it('an actor constraint reads the cast, not the crew', () => {
    expect(satisfiesRole(INCEPTION, { personId: NOLAN, role: 'actor' })).toBe(false);
    expect(satisfiesRole(INCEPTION, { personId: 6193, role: 'actor' })).toBe(true);
  });

  it('a director is not accepted merely for being ASSOCIATED with the film', () => {
    // The explicit instruction: association is not the requested role.
    const associated: CreditsView = { cast: [{ id: NOLAN }], crew: [] };
    expect(satisfiesRole(associated, { personId: NOLAN, role: 'director' })).toBe(false);
  });
});

describe('unsupported roles are refused, never degraded', () => {
  for (const role of ['writer', 'creator']) {
    it(`"${role}" is refused with a reason rather than run as cast`, () => {
      const s = roleSupport(role, 'movie');
      expect(s.supported).toBe(false);
      if (!s.supported) {
        expect(s.requested).toBe(role);
        expect(s.reason.length, 'a refusal has to say something true').toBeGreaterThan(0);
      }
    });

    it(`"${role}" never resolves to an executable role`, () => {
      const s = roleSupport(role, 'movie');
      // The property that matters: there is no path from an unsupported role to
      // `actor`. Degrading here is exactly the defect, one level up.
      expect(s.supported ? s.role : null).not.toBe('actor');
    });
  }

  it('director on TELEVISION is refused — the provider cannot filter it', () => {
    const s = roleSupport('director', 'tv');
    expect(s.supported).toBe(false);
  });

  it('actor on television is refused for the same provider reason', () => {
    expect(roleSupport('actor', 'tv').supported).toBe(false);
  });

  it('a role nobody anticipated is refused rather than guessed', () => {
    expect(roleSupport('cinematographer', 'movie').supported).toBe(false);
  });

  it('movie actor and movie director are the two that ARE supported', () => {
    expect(roleSupport('actor', 'movie')).toEqual({ supported: true, role: 'actor' });
    expect(roleSupport('director', 'movie')).toEqual({ supported: true, role: 'director' });
  });
});

describe('the role a sentence asks for', () => {
  const CASES: Array<[string, string | null]> = [
    ['movies directed by Christopher Nolan', 'director'],
    ['films of Christopher Nolan', 'director'],
    ['movies written by Aaron Sorkin', 'writer'],
    ['shows created by Vince Gilligan', 'creator'],
    ['what should I watch tonight with Tom Hanks', 'actor'],
    ['movies starring Denzel Washington', 'actor'],
    ['find me 3 Sylvester Stallone movies', null],
  ];
  for (const [said, role] of CASES) {
    it(`"${said}" → ${role ?? 'unstated'}`, () => {
      expect(requestedRoleFor(said)).toBe(role);
    });
  }

  it('an unstated role is null, so the caller defaults deliberately', () => {
    // "3 Stallone movies" names no role; the caller chooses `actor` explicitly
    // rather than this function pretending the sentence said so.
    expect(requestedRoleFor('find me 3 Sylvester Stallone movies')).toBeNull();
  });
});

describe('the legacy castIds list still means exactly what it meant', () => {
  it('every legacy id is an actor', () => {
    expect(fromCastIds([WILLIS, 31])).toEqual([
      { personId: WILLIS, role: 'actor' },
      { personId: 31, role: 'actor' },
    ]);
  });

  it('undefined is empty, not a crash', () => {
    expect(fromCastIds(undefined)).toEqual([]);
  });

  it('ids are selected by role and never mixed', () => {
    const people = [
      { personId: NOLAN, role: 'director' as const },
      { personId: WILLIS, role: 'actor' as const },
    ];
    expect(idsForRole(people, 'director')).toEqual([NOLAN]);
    expect(idsForRole(people, 'actor')).toEqual([WILLIS]);
  });
});

describe('filterByRole — association is not the requested role', () => {
  const DIRECTED = { id: 27205, mediaType: 'movie', title: 'Inception' };
  const PRODUCED = { id: 141052, mediaType: 'movie', title: 'Man of Steel' };
  const ACTED_IN = { id: 1, mediaType: 'movie', title: 'A Cameo' };
  const A_SERIES = { id: 2, mediaType: 'tv', title: 'Some Series' };

  const credits = async (_mt: 'movie' | 'tv', id: number): Promise<CreditsView | null> => {
    if (id === DIRECTED.id) return { cast: [], crew: [{ id: NOLAN, job: 'Director' }] };
    if (id === PRODUCED.id) return { cast: [], crew: [{ id: NOLAN, job: 'Producer' }] };
    if (id === ACTED_IN.id) return { cast: [{ id: NOLAN }], crew: [] };
    return null;
  };

  it('keeps the film he DIRECTED and drops the one he only produced', async () => {
    /* THE WHOLE POINT, AND THE REASON `with_crew` IS NOT ENOUGH. Retrieval
       returns both — Nolan worked on both — and only one is an answer to
       "movies directed by Christopher Nolan". */
    const out = await filterByRole([DIRECTED, PRODUCED], [{ personId: NOLAN, role: 'director' }], credits);
    expect(out.map((i) => i.title)).toEqual(['Inception']);
  });

  it('drops a film he merely APPEARED in', async () => {
    const out = await filterByRole([ACTED_IN], [{ personId: NOLAN, role: 'director' }], credits);
    expect(out).toEqual([]);
  });

  it('drops a title whose credits could not be read', async () => {
    // Unverifiable is not a pass — the guarantee is the whole point of the filter.
    const out = await filterByRole([A_SERIES, { id: 404, mediaType: 'movie' }], [{ personId: NOLAN, role: 'director' }], credits);
    expect(out).toEqual([]);
  });

  it('a television title can never satisfy a movie-only constraint', async () => {
    const out = await filterByRole([A_SERIES], [{ personId: NOLAN, role: 'director' }], credits);
    expect(out).toEqual([]);
  });

  it('two named people means BOTH, never either', async () => {
    const out = await filterByRole(
      [DIRECTED],
      [{ personId: NOLAN, role: 'director' }, { personId: 999, role: 'director' }],
      credits,
    );
    expect(out, 'the second director is not on this film').toEqual([]);
  });

  it('no constraints is a no-op — an ordinary request pays nothing', async () => {
    const items = [DIRECTED, PRODUCED, A_SERIES];
    expect(await filterByRole(items, [], credits)).toEqual(items);
  });
});
