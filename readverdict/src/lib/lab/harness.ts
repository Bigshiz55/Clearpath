// ReadVerdict evaluation harness (Search Lab foundation). Runs synthetic reader
// archetypes against book fixtures through the real trial engine, computes
// quality metrics, and checks hard constraints so scoring changes can be graded
// against a baseline and regressions rejected. Pure — no I/O, deterministic.

import { inferBookDna } from '@/lib/dna/inferBookDna';
import { computeMatch } from '@/lib/trial/match';
import { predictFinish } from '@/lib/trial/predict';
import { providerBookToWork } from '@/lib/providers/normalize';
import { buildTrial } from '@/lib/trial/trial';
import type { ProviderBook } from '@/lib/providers/types';
import { ARCHETYPES, BOOK_FIXTURES, type Archetype, type BookFixture } from './profiles';

const NOW = '2026-01-01T00:00:00.000Z';

export interface ScenarioResult {
  archetype: string;
  book: string;
  matchScore: number;
  matchConfidence: string;
  finishProbability: number;
  verdictCall: string;
}

function fixtureToProviderBook(b: BookFixture): ProviderBook {
  return {
    source: 'lab',
    sourceId: b.id,
    title: b.title,
    subtitle: null,
    authors: ['Lab Author'],
    firstPublishYear: 2020,
    isbn13: null,
    isbn10: null,
    coverUrl: null,
    subjects: b.subjects,
    languages: ['eng'],
    pageCount: b.pageCount,
    rating: { average: 4.0, count: 500 },
  };
}

export function runScenario(a: Archetype, b: BookFixture): ScenarioResult {
  const book = inferBookDna({ subjects: b.subjects, pageCount: b.pageCount });
  const match = computeMatch(a.dna, book);
  const prediction = predictFinish({ match, book, dna: a.dna, pageCount: b.pageCount });
  const work = providerBookToWork(fixtureToProviderBook(b), NOW);
  if (b.seriesPosition) work.series = { id: 's', name: 'Series', position: b.seriesPosition };
  const trial = buildTrial({ work, dna: a.dna, now: NOW });
  return {
    archetype: a.id,
    book: b.id,
    matchScore: match.score,
    matchConfidence: match.confidence,
    finishProbability: prediction.finishProbability,
    verdictCall: trial.verdict.call,
  };
}

export interface Expectation {
  archetype: string;
  book: string;
  /** Assertions on the result; return a message on failure. */
  check: (r: ScenarioResult) => string | null;
}

/** Hard-constraint expectations — the regression guardrails. */
export const EXPECTATIONS: Expectation[] = [
  {
    archetype: 'fast_thriller_lover',
    book: 'fast_thriller',
    check: (r) => (r.matchScore >= 60 ? null : `expected match >=60, got ${r.matchScore}`),
  },
  {
    archetype: 'fast_thriller_lover',
    book: 'literary_slow',
    check: (r) => (r.finishProbability < 0.7 ? null : `expected elevated DNF risk, finishProb ${r.finishProbability}`),
  },
  {
    archetype: 'literary_patient',
    book: 'literary_slow',
    check: (r) => (r.matchScore >= 55 ? null : `expected match >=55, got ${r.matchScore}`),
  },
  {
    archetype: 'dark_averse',
    book: 'dark_horror',
    check: (r) => (r.verdictCall !== 'READ IT' ? null : `dark-averse reader should not get READ IT for dark horror`),
  },
  {
    archetype: 'audio_first',
    book: 'epic_fantasy',
    check: (r) =>
      r.verdictCall === 'READ THE FIRST BOOK FIRST'
        ? null
        : `series entry #2 should route to READ THE FIRST BOOK FIRST, got ${r.verdictCall}`,
  },
];

export interface LabReport {
  results: ScenarioResult[];
  metrics: {
    scenarios: number;
    verdictDistribution: Record<string, number>;
    avgMatch: number;
  };
  violations: { archetype: string; book: string; message: string }[];
}

export type LabMode = 'smoke' | 'standard' | 'full';

/** Run the lab. 'smoke' runs the expectation set; 'full' runs the full grid. */
export function runLab(mode: LabMode = 'standard'): LabReport {
  const results: ScenarioResult[] = [];
  const violations: LabReport['violations'] = [];

  if (mode === 'full') {
    for (const a of ARCHETYPES) for (const b of BOOK_FIXTURES) results.push(runScenario(a, b));
  }

  for (const exp of EXPECTATIONS) {
    const a = ARCHETYPES.find((x) => x.id === exp.archetype)!;
    const b = BOOK_FIXTURES.find((x) => x.id === exp.book)!;
    const r = runScenario(a, b);
    if (mode !== 'full') results.push(r);
    const msg = exp.check(r);
    if (msg) violations.push({ archetype: exp.archetype, book: exp.book, message: msg });
  }

  const dist: Record<string, number> = {};
  for (const r of results) dist[r.verdictCall] = (dist[r.verdictCall] ?? 0) + 1;
  const avgMatch = results.reduce((s, r) => s + r.matchScore, 0) / (results.length || 1);

  return {
    results,
    metrics: { scenarios: results.length, verdictDistribution: dist, avgMatch: Number(avgMatch.toFixed(1)) },
    violations,
  };
}
