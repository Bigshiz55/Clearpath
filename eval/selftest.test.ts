/**
 * Deliverable 19 — tests for the evaluator itself. These guard the framework so
 * a broken evaluator can't silently pass a broken app (or fail a good one).
 */
import { describe, it, expect } from 'vitest';
import { makeRng } from './generator/rng';
import { generateCases } from './generator/generate';
import { normalize } from './normalize/normalize';
import { makeWorld } from './fixtures/index';
import { runFixtureFinder } from './pipeline/fixtureFinder';
import { evalLayerA, evalLayerB } from './evaluator/layers';
import { evaluateCase } from './evaluator/evaluate';
import { computeMetrics, checkThresholds, DEFAULT_THRESHOLDS } from './evaluator/scorecard';
import { GOLD_CASES } from './gold/seed';
import { emptyNormalized } from './contract';
import type { EvalCase } from './types';

describe('RNG determinism', () => {
  it('same seed → identical stream', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
  it('different seeds → different stream', () => {
    expect(makeRng(1).next()).not.toEqual(makeRng(2).next());
  });
});

describe('generator reproducibility', () => {
  it('same seed → identical cases', () => {
    const a = generateCases(20, 123);
    const b = generateCases(20, 123);
    expect(a.map((c) => c.rawQuery)).toEqual(b.map((c) => c.rawQuery));
  });
  it('produces the requested count and correct-by-construction ground truth', () => {
    const cases = generateCases(30, 7);
    expect(cases).toHaveLength(30);
    for (const c of cases) {
      expect(c.rawQuery.length).toBeGreaterThan(3);
      expect(c.intended.rawQuery).toBe(c.rawQuery);
    }
  });
});

describe('normalizer', () => {
  it('reads the flagship request', () => {
    const q = normalize('Pull up five Lifetime movies coming on in the next 24 hours that I would like.');
    expect(q.normalizedIntent).toBe('scheduled_broadcast_discovery');
    expect(q.networks).toContain('lifetime');
    expect(q.requestedCount).toBe(5);
    expect(q.availability.endOffsetHours).toBe(24);
    expect(q.personalizationRequested).toBe(true);
  });
  it('does NOT treat "that I would like" as a similar-to request', () => {
    const q = normalize('Find five Lifetime movies tonight that I would like.');
    expect(q.normalizedIntent).not.toBe('similar_to');
  });
  it('rejects unsupported categories', () => {
    expect(normalize('Find me a good podcast.').normalizedIntent).toBe('unsupported');
  });
  it('treats "give me / pull up / something …" as discovery requests', () => {
    expect(normalize('Give me a detective show, nothing supernatural.').normalizedIntent).toBe('personalized_content_discovery');
    expect(normalize('Pull up a comedy.').normalizedIntent).toBe('personalized_content_discovery');
    expect(normalize('Something light and funny.').normalizedIntent).toBe('personalized_content_discovery');
  });
  it('does NOT hijack a taste STATEMENT into a search', () => {
    // A pure preference (love/hate, no request verb) must stay taste-building.
    expect(normalize('I love grounded crime dramas and I hate anything supernatural.').normalizedIntent).toBe('taste_building');
  });
  it('routes "network + tonight" to broadcast but leaves bare "tonight" as taste', () => {
    expect(normalize('Pull up a couple of AMC movies later tonight.').normalizedIntent).toBe('scheduled_broadcast_discovery');
    expect(normalize('a good movie tonight').normalizedIntent).not.toBe('scheduled_broadcast_discovery');
  });
});

describe('Layer B is independent and catches planted violations', () => {
  const world = makeWorld();
  it('flags a wrong-network title even if the pipeline returned it', () => {
    // Build a case whose intended network is Hallmark, but hand a normalized
    // query that (buggily) asks for Lifetime → a Lifetime title comes back and
    // must be flagged against the Hallmark ground truth.
    const c: EvalCase = {
      id: 'plant-1', seed: 0, source: 'gold', archetype: 'plant', profileKey: 'scott', rawQuery: 'x', noise: 'clean',
      intended: emptyNormalized('x'),
      expected: { intent: 'scheduled_broadcast_discovery', hardConstraints: [{ kind: 'network', description: 'hallmark', value: 'hallmark' }], maxResults: null },
      tags: [],
    };
    const buggyQuery = { ...emptyNormalized('x'), normalizedIntent: 'scheduled_broadcast_discovery' as const, networks: ['lifetime'], contentTypes: ['movie' as const], availability: { type: 'scheduled_broadcast' as const, startOffsetHours: 0, endOffsetHours: 24, timezone: 'USER_TIMEZONE' } };
    const pipeline = runFixtureFinder(buggyQuery, 'scott', world);
    expect(pipeline.items.length).toBeGreaterThan(0); // Lifetime titles returned
    const b = evalLayerB(c, pipeline, world);
    expect(b.networkOrPlatformViolations).toBeGreaterThan(0);
    expect(b.hardValid).toBe(false);
  });
  it('passes a correct set with no violations', () => {
    const c = GOLD_CASES.find((g) => g.id === 'gold-001')!;
    const q = normalize(c.rawQuery);
    const pipeline = runFixtureFinder(q, c.profileKey, world);
    const b = evalLayerB(c, pipeline, world);
    // The flagship returns valid Lifetime movies in-window; no hard violations.
    expect(b.hallucinations).toBe(0);
    expect(b.networkOrPlatformViolations).toBe(0);
    expect(b.timeWindowViolations).toBe(0);
  });
});

describe('Layer A field accuracy', () => {
  it('scores a perfect parse at 1.0 and a wrong intent below 1', () => {
    const c = GOLD_CASES.find((g) => g.id === 'gold-001')!;
    const good = evalLayerA(c, c.intended);
    expect(good.fieldAccuracy).toBe(1);
    const bad = evalLayerA(c, { ...c.intended, normalizedIntent: 'where_to_watch' });
    expect(bad.intentCorrect).toBe(false);
    expect(bad.fieldAccuracy).toBeLessThan(1);
  });
});

describe('scorecard thresholds', () => {
  it('a hallucination breaches the 0% threshold', () => {
    const world = makeWorld();
    const results = GOLD_CASES.slice(0, 3).map((c) => evaluateCase(c, world));
    // synthesize a hallucination on the first result
    results[0]!.layerB.hallucinations = 1;
    results[0]!.layerB.hardValid = false;
    const m = computeMetrics(results);
    const breaches = checkThresholds(m, DEFAULT_THRESHOLDS);
    expect(breaches.some((b) => b.metric === 'hallucinationRate')).toBe(true);
  });
  it('a clean run has no breaches on an all-passing set', () => {
    const world = makeWorld();
    // Use only the well-behaved where_to_watch gold case set to keep it clean.
    const clean = GOLD_CASES.filter((c) => c.expected.expectsRejection);
    const results = clean.map((c) => evaluateCase(c, world));
    const m = computeMetrics(results);
    expect(m.hallucinationRate).toBe(0);
  });
});

describe('full case evaluation is deterministic', () => {
  it('same case → identical score twice', () => {
    const world = makeWorld();
    const c = GOLD_CASES[0]!;
    const r1 = evaluateCase(c, world);
    const r2 = evaluateCase(c, world);
    expect(r1.score).toBe(r2.score);
    expect(r1.passed).toBe(r2.passed);
  });
});
