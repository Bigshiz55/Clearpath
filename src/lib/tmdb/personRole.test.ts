import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A CREDIT ROLE SURVIVES ALL THE WAY ONTO THE WIRE.
 *
 * ── THE DEFECT THIS REPLACES, AND THE RED THAT PINNED IT ──────────────────
 * "movies directed by Christopher Nolan" resolved Nolan correctly and then
 * executed as `with_cast=525`. The role was dropped between resolution and
 * retrieval, because the execution contract had exactly one person field —
 * `castIds: number[]` — with nowhere to record what the person DID.
 *
 * The RED was taken here rather than at the parser, because the parser had been
 * right about "directed by" all along; the meaning simply had nowhere to go.
 * Measured against the shipped code, all three of these failed:
 *
 *   with_cast   "525"   ← the director, filed as a cast member
 *   with_crew   null    ← nothing retrieved on crew credits
 *   director vs actor   byte-identical query strings
 *
 * That last one is the clearest statement of the bug: two requests that mean
 * different things told TMDB exactly the same thing.
 *
 * ── WHY `with_crew` IS NOT THE WHOLE ANSWER ───────────────────────────────
 * It is a CREW filter, not a director filter — Nolan is also a writer and a
 * producer on most of his films, and a title he only produced would pass it.
 * Retrieval narrows; `satisfiesRole` verifies. Both halves are required for the
 * constraint to be hard, and each is tested where it lives.
 */

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
vi.mock('@/lib/env', () => ({
  serverEnv: { tmdbKey: () => 'test-key', tmdbToken: () => null },
}));

const { discoverTitles } = await import('./client');

const NOLAN = 525;
const WILLIS = 62;

function lastParams(): URLSearchParams {
  const url = String(fetchMock.mock.calls.at(-1)?.[0] ?? '');
  return new URL(url).searchParams;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ results: [], total_pages: 1 }),
  });
});

describe('director retrieves on crew, never on cast', () => {
  it('Nolan as DIRECTOR leaves as with_crew and never as with_cast', async () => {
    await discoverTitles('movie', { people: [{ personId: NOLAN, role: 'director' }] });
    const p = lastParams();
    expect(p.get('with_crew'), 'a director retrieves on crew credits').toBe(String(NOLAN));
    expect(p.get('with_cast'), 'a director must NEVER be sent as a cast filter').toBeNull();
  });

  it('Bruce Willis as ACTOR is unchanged — with_cast, no crew filter', async () => {
    await discoverTitles('movie', { people: [{ personId: WILLIS, role: 'actor' }] });
    const p = lastParams();
    expect(p.get('with_cast')).toBe(String(WILLIS));
    expect(p.get('with_crew')).toBeNull();
  });

  it('THE TWO ROLES ARE OBSERVABLY DIFFERENT QUERIES', async () => {
    // The property the RED failed on. If this ever passes by accident again,
    // the engine has gone back to answering the wrong question.
    await discoverTitles('movie', { people: [{ personId: NOLAN, role: 'director' }] });
    const asDirector = lastParams().toString();
    await discoverTitles('movie', { people: [{ personId: NOLAN, role: 'actor' }] });
    const asActor = lastParams().toString();
    expect(asDirector).not.toBe(asActor);
    expect(asDirector).toContain('with_crew=525');
    expect(asActor).toContain('with_cast=525');
  });

  it('both roles at once keep their own parameters', async () => {
    await discoverTitles('movie', {
      people: [
        { personId: NOLAN, role: 'director' },
        { personId: WILLIS, role: 'actor' },
      ],
    });
    const p = lastParams();
    expect(p.get('with_crew')).toBe(String(NOLAN));
    expect(p.get('with_cast')).toBe(String(WILLIS));
  });
});

describe('the legacy castIds path is untouched', () => {
  it('castIds still means actor, exactly as before', async () => {
    await discoverTitles('movie', { castIds: [WILLIS] });
    const p = lastParams();
    expect(p.get('with_cast')).toBe(String(WILLIS));
    expect(p.get('with_crew')).toBeNull();
  });

  it('several actors are still OR-ed within the one parameter', async () => {
    await discoverTitles('movie', { castIds: [WILLIS, 31] });
    expect(lastParams().get('with_cast')).toBe(`${WILLIS}|31`);
  });

  it('castIds and people merge without duplicating an id', async () => {
    await discoverTitles('movie', {
      castIds: [WILLIS],
      people: [{ personId: WILLIS, role: 'actor' }],
    });
    expect(lastParams().get('with_cast')).toBe(String(WILLIS));
  });
});

describe('television sends no person filter at all', () => {
  /* `/discover/tv` accepts neither `with_cast` nor `with_crew`. Sending one
     would be silently ignored by the provider, which reads to us as "the filter
     was applied" — so nothing is sent, and `roleSupport` refuses the request
     upstream rather than letting it look like it worked. */
  it('an actor constraint is not smuggled into a tv discover call', async () => {
    await discoverTitles('tv', { castIds: [WILLIS] });
    expect(lastParams().get('with_cast')).toBeNull();
  });

  it('nor is a director constraint', async () => {
    await discoverTitles('tv', { people: [{ personId: NOLAN, role: 'director' }] });
    const p = lastParams();
    expect(p.get('with_crew')).toBeNull();
    expect(p.get('with_cast')).toBeNull();
  });
});
