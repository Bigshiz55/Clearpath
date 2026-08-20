/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BOXING LITMUS — the first graph-native vertical slice, as a test.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "a boxing movie" through the REAL /api/ask route must produce a decision
 * run whose graph shows: a request (request_only), the subject constraint
 * surviving from the raw utterance to every returned candidate, and the
 * GoodFellas-class candidate REJECTED — connected, not merely ranked low.
 * The graph invariants then hold over the captured run. The world (TMDB,
 * Supabase, the finder's retrieval) is mocked at its boundary; the
 * interpretation and the run assembly are the real code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRunInvariants, inv2RequestOnlyNeverDurable } from './invariants';
import { buildCaseRun } from './decisionRun';
import type { DecisionRun } from './types';

const persisted: Array<Record<string, unknown>> = [];
function tableStub(table: string) {
  const chain = {
    insert: async (row: unknown) => {
      if (table === 'decision_runs') persisted.push(row as Record<string, unknown>);
      return { error: null };
    },
    upsert: async () => ({ error: null }),
    select: () => chain,
    eq: () => chain,
    in: async () => ({ data: [] }),
    order: () => chain,
    limit: async () => ({ data: [] }),
    maybeSingle: async () => ({ data: null }),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-under-test' } }, error: null }) },
    from: (table: string) => tableStub(table),
  }),
}));

vi.mock('@/lib/finder', async (orig) => {
  const actual = await orig<typeof import('@/lib/finder')>();
  return {
    ...actual,
    runFinder: vi.fn(async (_sb: unknown, _uid: string, query: { subjectLexemes?: string[] }) => {
      // A realistic finder outcome for a boxing ask: Rocky eligible and
      // returned, GoodFellas evaluated and REJECTED for lacking the subject.
      const subject = query.subjectLexemes?.[0] ?? 'boxing';
      return {
        items: [{
          id: 1366, mediaType: 'movie', title: 'Rocky', year: 1976, posterPath: null,
          matchScore: 87,
          subjectEvidence: {
            constraint: subject, satisfied: true, status: 'PASS', centrality: 'CENTRAL',
            confidence: 0.95, evidenceType: 'centrality', evidence: 'keyword+overview',
            rejectionReason: null, ambiguous: false, decidedBy: 'deterministic',
          },
        }],
        scoredFor: 'test', relaxed: null, total: 1,
        diagnostics: {
          requestedCount: 1, candidateCount: 2, deterministicEligibleCount: 2,
          semanticEvaluatedCount: 2, centralSubjectEligibleCount: 1,
          qualityEligibleCount: 1, finalReturnedCount: 1,
          evaluations: [
            { id: 1366, mediaType: 'movie', title: 'Rocky', year: 1976, status: 'PASS', centrality: 'CENTRAL', confidence: 0.95, evidence: 'keyword+overview', rejectionReason: null, eligible: true, matchScore: 87, rankedByTasteDna: false },
            { id: 769, mediaType: 'movie', title: 'GoodFellas', year: 1990, status: 'FAIL', centrality: 'ABSENT', confidence: 0.9, evidence: 'no boxing evidence', rejectionReason: 'subject not present', eligible: false, matchScore: 55, rankedByTasteDna: false },
          ],
        },
      };
    }),
  };
});

vi.mock('@/lib/tmdb/client', () => ({
  searchPeople: vi.fn(async () => []),
  searchKeywords: vi.fn(async (terms: string[]) => (terms.some((t) => /box/i.test(t)) ? [1234] : [])),
  getCredits: vi.fn(async () => ({ cast: [], crew: [], directors: [], creators: [] })),
  searchTitles: vi.fn(async () => []),
  getTitle: vi.fn(async () => null),
  discoverTitles: vi.fn(async () => []),
}));

vi.mock('@/lib/preference/store', () => ({ loadPreferenceCached: async () => null }));
vi.mock('@/lib/titleDimensions', () => ({ getCachedDimensions: async () => new Map() }));

function runFromRow(row: Record<string, unknown>): DecisionRun {
  return {
    id: row.id as string,
    entryPoint: row.entry_point as DecisionRun['entryPoint'],
    rawText: row.raw_text as string,
    intent: { kind: row.intent_kind as string, persistence: row.persistence as DecisionRun['intent']['persistence'] },
    edges: row.edges as DecisionRun['edges'],
    createdAt: row.created_at as string,
  };
}

beforeEach(() => {
  persisted.length = 0;
});

describe('the boxing litmus — a request run, graph-lawful end to end', () => {
  it('"a boxing movie" produces a request_only run whose constraint survives to the results', async () => {
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(new Request('https://local.test/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'a boxing movie' }),
    }));
    expect(res.status).toBe(200);
    // The fire-and-forget persist has been scheduled; let it settle.
    await new Promise((r) => setTimeout(r, 25));

    expect(persisted.length, 'no decision run was persisted').toBe(1);
    const run = runFromRow(persisted[0]!);

    expect(run.rawText).toBe('a boxing movie');
    expect(run.intent.persistence).toBe('request_only');

    // The subject constraint is an edge, connected from request to results.
    const required = run.edges.filter((e) => e.predicate === 'requires_subject');
    expect(required.length, 'the boxing constraint vanished from the run').toBeGreaterThan(0);
    expect(required.map((e) => e.object).join(' ')).toMatch(/box/i);

    // GoodFellas is REJECTED — ineligible with a stated reason, never ranked.
    const rejected = run.edges.filter((e) => e.predicate === 'rejected');
    expect(rejected.some((e) => e.subject === 'candidate:movie:769')).toBe(true);

    // Rocky is returned and satisfies the constraint.
    const returned = run.edges.filter((e) => e.predicate === 'returned');
    expect(returned.map((e) => e.object)).toContain('candidate:movie:1366');

    // The whole invariant suite holds over the real captured run.
    expect(checkRunInvariants(run)).toEqual([]);
  });
});

describe('the durable contrast — statement runs are visibly different', () => {
  it('a statement run records durable persistence and lawful writes; a fabricated request-write violates INV-2', () => {
    const statement = buildCaseRun({
      runId: '00000000-0000-4000-8000-000000000001',
      text: 'I love boxing movies',
      classifiedAs: 'taste',
      routedTo: null,
      durableEvidence: 'I love boxing movies',
      tasteAxesWritten: ['pacing'],
      titlesSeeded: [],
      createdAt: '2026-08-20T00:00:00.000Z',
    });
    expect(statement.intent.persistence).toBe('durable');
    expect(statement.edges.some((e) => e.predicate === 'wrote_taste')).toBe(true);
    expect(checkRunInvariants(statement)).toEqual([]);

    // The OLD production behavior, expressed as a run, is an INV-2 violation:
    // "a boxing movie" (request, no durable clause) writing a seeded title.
    const polluted = buildCaseRun({
      runId: '00000000-0000-4000-8000-000000000002',
      text: 'a boxing movie',
      classifiedAs: 'request',
      routedTo: '/app/ask?q=a%20boxing%20movie',
      durableEvidence: '',
      tasteAxesWritten: [],
      titlesSeeded: ['a boxing movie'],
      createdAt: '2026-08-20T00:00:00.000Z',
    });
    const violations = inv2RequestOnlyNeverDurable(polluted);
    expect(violations.length, 'the fabricated-rating defect must be an invariant violation').toBeGreaterThan(0);

    // And the mixed utterance is lawful: its writes carry durable evidence.
    const mixed = buildCaseRun({
      runId: '00000000-0000-4000-8000-000000000003',
      text: 'I love slow burns but I hate gore. Give me a thriller tonight.',
      classifiedAs: 'request',
      routedTo: '/app/ask?q=…',
      durableEvidence: 'I love slow burns but I hate gore.',
      tasteAxesWritten: ['pacing'],
      titlesSeeded: [],
      createdAt: '2026-08-20T00:00:00.000Z',
    });
    expect(inv2RequestOnlyNeverDurable(mixed)).toEqual([]);
  });
});
