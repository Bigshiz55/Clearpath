/**
 * THE DOCKET KEY CONTRACT — a reviewer catch on PR #105.
 *
 * The docket names its candidates with `docketKey()` — colon-delimited
 * (`movie:603`) — but the verdict beacon's validator only accepted the
 * court-style hyphen form (`movie-603`), so every REAL docket payload was
 * silently stripped and the recorded run held zero candidate edges: an
 * empty verdict run pretending the docket decided nothing.
 *
 * The cure is pinned at the true boundary: these tests build the payload
 * from the REAL `docketKey()` function — not a literal that can drift —
 * and require the persisted run to carry the candidates. Keys are
 * normalized to one stored shape (`candidate:movie-603`, the same shape
 * the court run stores) so the two group surfaces stay joinable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { docketKey } from '@/lib/verdict/docket';
import { checkRunInvariants } from '@/lib/graph/invariants';
import type { DecisionRun } from '@/lib/graph/types';

const persisted: Array<Record<string, unknown>> = [];
function tableStub(table: string) {
  const chain = {
    insert: async (row: unknown) => {
      if (table === 'decision_runs') persisted.push(row as Record<string, unknown>);
      return { error: null };
    },
    select: () => chain,
    eq: () => chain,
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

import { POST } from './route';

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('http://test/api/verdict/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function lastRun(): DecisionRun {
  const row = persisted[persisted.length - 1];
  expect(row).toBeDefined();
  return {
    id: String(row!.id),
    entryPoint: row!.entry_point,
    rawText: String(row!.raw_text),
    intent: { kind: row!.intent_kind, persistence: row!.persistence },
    edges: row!.edges,
    createdAt: String(row!.created_at),
  } as DecisionRun;
}

beforeEach(() => {
  persisted.length = 0;
});

describe('the verdict beacon accepts what the docket actually sends', () => {
  it('a payload keyed by the REAL docketKey() records every candidate — not an empty run', async () => {
    const res = await post({
      winner: { key: docketKey('movie', 603), title: 'The Matrix', score: 84 },
      backup: { key: docketKey('tv', 1396), title: 'Breaking Bad', score: 79 },
      alsoRan: [{ key: docketKey('movie', 680), title: 'Pulp Fiction', score: 71 }],
      ruledOut: [{ key: docketKey('movie', 105), title: 'Back to the Future', reason: 'already seen' }],
    });
    expect(res.status).toBe(200);
    const run = lastRun();
    const returned = run.edges.filter((e) => e.predicate === 'returned');
    const rejected = run.edges.filter((e) => e.predicate === 'rejected');
    expect(returned.length).toBe(3);
    expect(rejected.length).toBe(1);
    // One stored candidate shape across group surfaces: the court form.
    expect(returned.map((e) => e.object).sort()).toEqual(
      ['candidate:movie-603', 'candidate:movie-680', 'candidate:tv-1396'].sort(),
    );
    expect(rejected[0]!.subject).toBe('candidate:movie-105');
    expect(run.edges.some((e) => e.predicate === 'scored' && e.subject === 'candidate:movie-603' && e.object === '84')).toBe(true);
  });

  it('the court-style hyphen form stays accepted (both group surfaces, one validator)', async () => {
    const res = await post({ winner: { key: 'movie-603', title: 'The Matrix', score: 84 }, alsoRan: [], ruledOut: [] });
    expect(res.status).toBe(200);
    const run = lastRun();
    expect(run.edges.some((e) => e.predicate === 'returned' && e.object === 'candidate:movie-603')).toBe(true);
  });

  it('garbage keys are still dropped — normalization is not laxity', async () => {
    await post({
      winner: { key: 'movie:603:extra', title: 'x', score: 1 },
      alsoRan: [{ key: 'MOVIE:603', title: 'x', score: 1 }, { key: 'movie:', title: 'x', score: 1 }],
      ruledOut: [{ key: '603', title: 'x', reason: 'r' }],
    });
    const run = lastRun();
    expect(run.edges.filter((e) => e.predicate === 'returned').length).toBe(0);
    expect(run.edges.filter((e) => e.predicate === 'rejected').length).toBe(0);
  });

  it('the recorded run still satisfies the invariant suite (INV-9 included)', async () => {
    await post({
      winner: { key: docketKey('movie', 603), title: 'The Matrix', score: 84 },
      alsoRan: [],
      ruledOut: [{ key: docketKey('movie', 105), title: 'Back to the Future', reason: 'already seen' }],
    });
    const run = lastRun();
    expect(checkRunInvariants(run)).toEqual([]);
  });
});
