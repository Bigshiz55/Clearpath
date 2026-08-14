/**
 * ══════════════════════════════════════════════════════════════════════════
 * SERVING MODE CHOOSES WHO EXECUTES — NEVER WHAT A SENTENCE MEANS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The measured violation: in `anthropic` mode the AI orchestrator returned a
 * finished answer BEFORE the canonical interpreter ran, and it read the count
 * with `parseRequestedCount(whole utterance)` — so the same sentence produced
 * a different executable meaning depending on a deployment variable. "Mode is
 * off by default" is not an invariant; this suite is.
 *
 * The contract: interpretation happens before mode selection. A request the
 * canonical layer recognises (recommendation or lookup) takes the canonical
 * pipeline in EVERY mode; the orchestrator may only be handed language the
 * canonical layer does not recognise as an executable request. The sentinel
 * mock proves consultation: if the orchestrator were asked, its answer would
 * visibly differ, and the parity comparison would catch it.
 *
 * Every case runs under legacy / shadow / anthropic / unset and must produce
 * a materially equivalent execution: same response kind, same FinderQuery
 * handed to retrieval.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const RAN: Array<Record<string, unknown>> = [];

vi.mock('@/lib/finder', async (orig) => {
  const actual = await orig<typeof import('@/lib/finder')>();
  return {
    ...actual,
    runFinder: vi.fn(async (_sb: unknown, _uid: string, query: Record<string, unknown>) => {
      RAN.push(query);
      return { items: [], scoredFor: 'test', relaxed: null, total: 0, diagnostics: {
        requestedCount: null, candidateCount: 0, deterministicEligibleCount: 0,
        semanticEvaluatedCount: 0, centralSubjectEligibleCount: 0,
        qualityEligibleCount: 0, finalReturnedCount: 0,
      } };
    }),
  };
});

/* THE SENTINEL BRAIN. If the orchestrator is consulted for a canonical
   request, this answer — visibly unlike the deterministic one — reaches the
   user and the parity comparison fails. Consultation is also counted. */
const runAiDiscovery = vi.fn(async () => ({
  kind: 'search' as const,
  query: { SENTINEL: true },
  interpretation: ['SENTINEL BRAIN ANSWERED'],
  scoredFor: 'sentinel',
  relaxed: null,
  items: [],
}));
vi.mock('@/lib/ai/discoveryBridge', () => ({
  runAiDiscovery: (..._args: unknown[]) => runAiDiscovery(),
  recordShadowInterpretation: vi.fn(async () => undefined),
}));

vi.mock('@/lib/tmdb/client', () => ({
  searchPeople: vi.fn(async (q: string) => {
    if (/stal+one/i.test(q)) return [{ id: 16483, name: 'Sylvester Stallone', profilePath: null, knownFor: 'Rocky' }];
    if (/hanks/i.test(q)) return [{ id: 31, name: 'Tom Hanks', profilePath: null, knownFor: 'Forrest Gump' }];
    return [];
  }),
  searchKeywords: vi.fn(async (terms: string[]) => {
    if (terms.some((t) => /box|prizefight/i.test(t))) return [1234, 5678];
    if (terms.some((t) => /courtroom|trial|legal/i.test(t))) return [4321];
    if (terms.some((t) => /baseball/i.test(t))) return [1480];
    if (terms.some((t) => /supernatural/i.test(t))) return [777];
    return [];
  }),
  getCredits: vi.fn(async () => ({ cast: [], crew: [], directors: [], creators: [] })),
  searchTitles: vi.fn(async () => []),
  getTitle: vi.fn(async () => null),
  discoverTitles: vi.fn(async () => []),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-under-test' } }, error: null }) },
  }),
}));

vi.mock('@/lib/preference/store', () => ({ loadPreferenceCached: async () => null }));
vi.mock('@/lib/titleDimensions', () => ({ getCachedDimensions: async () => new Map() }));

const MODES = ['legacy', 'shadow', 'anthropic', 'unset'] as const;

const CASES = [
  'I watched 3 movies yesterday. Give me a Sylvester Stallone movie.',
  '3 Sylvester Stallone movies',
  'a Tom Hanks courtroom movie',
  'Had a beef burrito for dinner. Anyway, give me a boxing movie.',
  'I watched Rocky three weeks ago, but tonight I want a baseball movie.',
  'Give me a thriller but no supernatural stuff.',
  'Show me The Lego Movie',
];

interface Execution {
  kind: string | undefined;
  query: Record<string, unknown> | null;
}

async function askUnderMode(mode: (typeof MODES)[number], text: string): Promise<Execution> {
  if (mode === 'unset') delete process.env.AI_DISCOVERY_MODE;
  else process.env.AI_DISCOVERY_MODE = mode;
  const before = RAN.length;
  const { POST } = await import('./ask/route');
  const res = await POST(new Request('https://local.test/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
  const body = (await res.json()) as { kind?: string };
  return { kind: body.kind, query: RAN.length > before ? RAN[RAN.length - 1]! : null };
}

beforeEach(() => {
  RAN.length = 0;
  runAiDiscovery.mockClear();
  delete process.env.AI_DISCOVERY_MODE;
});

describe('the same sentence means the same thing in every serving mode', () => {
  for (const text of CASES) {
    it(`"${text}" — materially equivalent under ${MODES.join(' / ')}`, async () => {
      const baseline = await askUnderMode('legacy', text);
      expect(baseline.kind, 'legacy produced no executable answer at all').toBeDefined();
      for (const mode of MODES.slice(1)) {
        const other = await askUnderMode(mode, text);
        expect(other.kind, `${mode} answered a different KIND than legacy`).toBe(baseline.kind);
        expect(other.query, `${mode} executed a different QUERY than legacy`).toEqual(baseline.query);
      }
    });
  }

  it('the sentinel brain is never consulted for a request the canonical layer recognises', async () => {
    for (const text of CASES) {
      await askUnderMode('anthropic', text);
    }
    expect(
      runAiDiscovery,
      'the AI orchestrator was handed a canonical request — mode chose meaning',
    ).not.toHaveBeenCalled();
  });
});
