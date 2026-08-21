/**
 * SLICES B + C — the Verdict Room, the Docket verdict, and the Subscription
 * Check become graph objects: decision runs with the same provenance, edges
 * and invariants every other decision already carries.
 *
 * THE STATE THIS ENDS (audited at 975938f):
 *   - The court verdict was computed CLIENT-side and stored nowhere; the
 *     shortlist build discarded its gate rejections, so "why not X" was
 *     unanswerable and INV-8 unprovable over any court decision.
 *   - The docket's deliverVerdict returned ruledOut WITH reasons — ready-made
 *     rejection evidence — and dropped it on the floor of a React state.
 *   - The Subscription Check made per-service worth/cancel claims from price
 *     + watch data and recorded nothing.
 *
 * INV-9 — GROUP EVIDENCE NEVER LEAKS INTO DURABLE INDIVIDUAL TASTE — was
 * documented, asserted in SQL comments, currently TRUE by inspection, and
 * enforced by nothing. It is now BOTH an executable invariant over runs from
 * these surfaces and an architectural source test over their modules.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCourtRun,
  buildDocketVerdictRun,
  buildSubscriptionRun,
} from './decisionRun';
import { checkRunInvariants, inv9GroupNeverDurable } from './invariants';

const CREATED = '2026-08-21T01:00:00.000Z';
const ROOT = join(__dirname, '..', '..', '..');

describe('the court shortlist is a decision run', () => {
  const run = buildCourtRun({
    runId: 'court-1',
    roomCode: 'ABQX',
    memberCount: 3,
    tonight: { avoid: ['horror'], runtimeCapMinutes: 120, mediaType: 'movie' },
    rejected: [
      { key: 'movie-100', title: 'It', reason: 'excluded genre: horror' },
      { key: 'movie-200', title: 'Lawrence of Arabia', reason: 'over the 120m cap' },
    ],
    finalists: [
      { key: 'movie-300', title: 'Heat', fit: 82 },
      { key: 'movie-400', title: 'Rocky', fit: 78 },
    ],
    createdAt: CREATED,
  });

  it('carries the combined constraints as hard edges', () => {
    expect(run.entryPoint).toBe('court');
    expect(run.intent.persistence).toBe('session');
    expect(run.edges.some((e) => e.predicate === 'excludes_genre' && e.object === 'horror')).toBe(true);
    expect(run.edges.some((e) => e.predicate === 'max_runtime' && e.object === '120')).toBe(true);
    expect(run.edges.some((e) => e.predicate === 'requires_media' && e.object === 'movie')).toBe(true);
  });

  it('records the gate rejections it used to discard — with their reasons', () => {
    const rejected = run.edges.filter((e) => e.predicate === 'rejected');
    expect(rejected.map((e) => e.object)).toEqual(['excluded genre: horror', 'over the 120m cap']);
  });

  it('records the finalists as returned + scored', () => {
    expect(run.edges.filter((e) => e.predicate === 'returned').length).toBe(2);
    expect(run.edges.some((e) => e.predicate === 'scored' && e.object === '82')).toBe(true);
  });

  it('a rejected candidate never appears as a finalist (INV-8 is now provable here)', () => {
    expect(checkRunInvariants(run).filter((v) => v.invariant === 'INV-8')).toEqual([]);
  });
});

describe('the docket verdict is a decision run', () => {
  const run = buildDocketVerdictRun({
    runId: 'docket-1',
    winner: { key: 'movie-1', title: 'Heat', score: 78 },
    backup: { key: 'movie-2', title: 'Ronin', score: 71 },
    alsoRan: [{ key: 'tv-3', title: 'The Wire', score: 66 }],
    ruledOut: [{ key: 'movie-4', title: 'Unstreamable', reason: 'not watchable on your services tonight' }],
    createdAt: CREATED,
  });

  it('is request_only — the docket is explicitly ephemeral', () => {
    expect(run.entryPoint).toBe('verdict');
    expect(run.intent.persistence).toBe('request_only');
  });

  it('keeps the ruled-out reasons that were dropped in React state', () => {
    const rejected = run.edges.filter((e) => e.predicate === 'rejected');
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.object).toBe('not watchable on your services tonight');
  });

  it('winner, backup and also-rans are returned in order, scored', () => {
    const returned = run.edges.filter((e) => e.predicate === 'returned');
    expect(returned.length).toBe(3);
    expect(run.edges.filter((e) => e.predicate === 'scored').length).toBe(3);
  });
});

describe('the subscription check is a decision run', () => {
  const run = buildSubscriptionRun({
    runId: 'subs-1',
    services: [
      { name: 'Netflix', verdict: 'worth', estPrice: 15.49, watched: 9 },
      { name: 'Hulu', verdict: 'cancel', estPrice: 9.99, watched: 0 },
      { name: 'Kanopy', verdict: 'free', estPrice: 0, watched: 2 },
    ],
    windowDays: 120,
    createdAt: CREATED,
  });

  it('each worth/cancel claim is a scored edge that names its basis', () => {
    const scored = run.edges.filter((e) => e.predicate === 'scored');
    expect(scored.length).toBe(3);
    const hulu = scored.find((e) => e.subject.includes('Hulu'))!;
    expect(hulu.object).toBe('cancel');
    expect(hulu.detail?.watched).toBe(0);
    expect(hulu.detail?.estPrice).toBe(9.99);
    expect(hulu.detail?.windowDays).toBe(120);
    /* The price is an ESTIMATE from a hardcoded table, and the claim says so —
       calculated provenance, never presented as an observed fact. */
    expect(hulu.provenance?.source).toBe('calculated');
    expect(hulu.provenance?.observedAt).toBe(CREATED);
  });

  it('is request_only: a value snapshot, not a durable belief about the user', () => {
    expect(run.intent.persistence).toBe('request_only');
  });
});

describe('INV-9 — group/ephemeral surfaces never write durable individual taste', () => {
  it('a court run with a wrote_taste edge is a violation', () => {
    const run = buildCourtRun({
      runId: 'court-x',
      roomCode: 'ZZZZ',
      memberCount: 2,
      tonight: { avoid: [], runtimeCapMinutes: null, mediaType: null },
      rejected: [],
      finalists: [],
      createdAt: CREATED,
    });
    run.edges.push({ subject: 'user', predicate: 'wrote_taste', object: 'taste:darkness' });
    const v = inv9GroupNeverDurable(run);
    expect(v.length).toBe(1);
    expect(v[0]!.invariant).toBe('INV-9');
  });

  it('the clean runs above all pass the full suite', () => {
    const clean = buildDocketVerdictRun({
      runId: 'd', winner: null, backup: null, alsoRan: [], ruledOut: [], createdAt: CREATED,
    });
    expect(checkRunInvariants(clean)).toEqual([]);
  });

  it('ARCHITECTURE: no court/docket/subscription module reaches a taste writer', () => {
    /* The map's exhaustive list of durable individual-taste writers. If a
       future change routes any of these through a group surface, this names
       it. Source-reading in the independence.test idiom. */
    const surfaces = [
      'src/lib/court.ts',
      'src/lib/courtRoom.ts',
      'src/lib/householdVerdict.ts',
      'src/lib/subscriptionValue.ts',
      'src/lib/verdict/rank.ts',
      'src/lib/verdict/docket.ts',
      'src/lib/docketStore.ts',
    ];
    for (const f of surfaces) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} references a durable taste store`).not.toMatch(
        /dimension_signals|preference_rules|preference_events|rateQuizTitle|recordEvents\(/,
      );
    }
  });
});

describe('the dead monthly-missions docket is gone', () => {
  it('src/lib/docket.ts (zero importers, name collision with verdict/docket) no longer exists', () => {
    expect(require('node:fs').existsSync(join(ROOT, 'src/lib/docket.ts'))).toBe(false);
  });
});
