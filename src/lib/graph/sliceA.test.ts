/**
 * SLICE A, THE GRAPH HALF — INV-4 exists, and the runs that make claims about
 * availability or route a subject actually carry the edges it checks.
 *
 * Before this: the airing branch of build-case dropped the subject ("AMC
 * boxing movies tonight" → /app/tv with the boxing gone), and because
 * `buildCaseRun` emitted no `requires_subject` edge for airing routes, INV-1
 * could not even SEE the loss — `hardRequirements(run)` was empty and the
 * check passed clean over a run that discarded the user's constraint. The
 * graph must record the obligation for the invariant to defend it.
 *
 * INV-4: an availability/airing claim edge (`available_on` / `airs_on`)
 * must carry provenance with a source and an observation time. A claim
 * without a timestamp is an assertion about the world with no "as of", which
 * is how stale offers get presented as facts.
 */
import { describe, it, expect } from 'vitest';
import { buildAskRun, buildCaseRun } from './decisionRun';
import { checkRunInvariants, inv4AvailabilityClaimsSourced } from './invariants';
import type { DecisionRun } from './types';

const CREATED = '2026-08-21T00:00:00.000Z';

describe('INV-4 — availability claims carry source + timestamp', () => {
  const base: DecisionRun = {
    id: 'r1',
    entryPoint: 'ask',
    rawText: 'something on AMC',
    intent: { kind: 'recommendation', persistence: 'request_only' },
    edges: [],
    createdAt: CREATED,
  };

  it('an available_on edge without provenance is a violation', () => {
    const run: DecisionRun = {
      ...base,
      edges: [{ subject: 'candidate:movie:1', predicate: 'available_on', object: 'Netflix' }],
    };
    const v = inv4AvailabilityClaimsSourced(run);
    expect(v.length).toBe(1);
    expect(v[0]!.invariant).toBe('INV-4');
  });

  it('a sourced, timestamped claim is lawful', () => {
    const run: DecisionRun = {
      ...base,
      edges: [
        {
          subject: 'candidate:movie:1',
          predicate: 'available_on',
          object: 'Netflix',
          provenance: { source: 'external:tmdb', observedAt: CREATED },
        },
      ],
    };
    expect(inv4AvailabilityClaimsSourced(run)).toEqual([]);
  });

  it('is part of the standard suite', () => {
    const run: DecisionRun = {
      ...base,
      edges: [{ subject: 'candidate:movie:1', predicate: 'airs_on', object: 'AMC' }],
    };
    expect(checkRunInvariants(run).some((v) => v.invariant === 'INV-4')).toBe(true);
  });
});

describe('ask runs claim availability WITH its provenance', () => {
  it('a returned item that names a provider emits available_on, sourced and timestamped', () => {
    const run = buildAskRun({
      runId: 'r2',
      text: 'a thriller',
      kind: 'recommendation',
      query: { mediaType: 'movie' },
      returned: [
        { id: 7, mediaType: 'movie', title: 'Heat', matchScore: 90, where: 'Netflix', whereObservedAt: '2026-08-20T12:00:00.000Z' },
        { id: 8, mediaType: 'movie', title: 'Ronin', matchScore: 80 },
      ],
      createdAt: CREATED,
    });
    const claims = run.edges.filter((e) => e.predicate === 'available_on');
    expect(claims.length, 'one claim for the item that has a provider, none invented for the other').toBe(1);
    expect(claims[0]!.subject).toBe('candidate:movie:7');
    expect(claims[0]!.object).toBe('Netflix');
    expect(claims[0]!.provenance?.source).toBe('external:tmdb');
    expect(claims[0]!.provenance?.observedAt).toBe('2026-08-20T12:00:00.000Z');
    expect(inv4AvailabilityClaimsSourced(run)).toEqual([]);
  });

  it('an item with a provider but NO observation time makes no claim at all', () => {
    /* Claiming "on Netflix" with no as-of would be the exact INV-4 sin — so
       the builder refuses to emit the edge rather than emitting it naked. */
    const run = buildAskRun({
      runId: 'r3',
      text: 'a thriller',
      kind: 'recommendation',
      returned: [{ id: 9, mediaType: 'movie', where: 'Hulu' }],
      createdAt: CREATED,
    });
    expect(run.edges.filter((e) => e.predicate === 'available_on')).toEqual([]);
  });
});

describe('airing runs carry the subject they route', () => {
  it('buildCaseRun records requires_subject for the terms the destination must honor', () => {
    const run = buildCaseRun({
      runId: 'r4',
      text: 'AMC boxing movies tonight',
      classifiedAs: 'airing',
      routedTo: '/app/tv?within=6&network=amc&type=movie&q=boxing',
      subjectTerms: ['boxing'],
      durableEvidence: '',
      tasteAxesWritten: [],
      titlesSeeded: [],
      createdAt: CREATED,
    });
    const subj = run.edges.filter((e) => e.predicate === 'requires_subject');
    expect(subj.map((e) => e.object)).toEqual(['boxing']);
  });

  it('a run that ROUTES its obligation is not an empty-result violation', () => {
    /* INV-1 demands hard requirements end in satisfied results or an explicit
       empty/clarify state. A routing run returns nothing by design — the
       destination owns the results; the routed_to edge (whose URL carries the
       term, proven browser-side) is its explicit terminal state. */
    const run = buildCaseRun({
      runId: 'r5',
      text: 'AMC boxing movies tonight',
      classifiedAs: 'airing',
      routedTo: '/app/tv?within=6&q=boxing',
      subjectTerms: ['boxing'],
      durableEvidence: '',
      tasteAxesWritten: [],
      titlesSeeded: [],
      createdAt: CREATED,
    });
    expect(checkRunInvariants(run).filter((v) => v.invariant === 'INV-1')).toEqual([]);
  });

  it('and a NON-routing run with a hard requirement and no results still violates', () => {
    const run: DecisionRun = {
      id: 'r6',
      entryPoint: 'ask',
      rawText: 'a boxing movie',
      intent: { kind: 'recommendation', persistence: 'request_only' },
      edges: [{ subject: 'request', predicate: 'requires_subject', object: 'boxing' }],
      createdAt: CREATED,
    };
    expect(checkRunInvariants(run).some((v) => v.invariant === 'INV-1')).toBe(true);
  });
});

describe('the airing branch transports the subject it understood', () => {
  it('build-case appends the canonical subject to the guide redirect', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'app', 'api', 'build-case', 'route.ts'),
      'utf8',
    );
    // The canonical interpreter owns the reading — no second parser.
    expect(src).toMatch(/interpret\(/);
    expect(src, 'the airing redirect must carry the subject').toMatch(/params\.set\('q'/);
  });

  it('the guide page consumes it', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'app', 'app', 'tv', 'page.tsx'),
      'utf8',
    );
    expect(src).toMatch(/\bq\?\:/);
  });
});
