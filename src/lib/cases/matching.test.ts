import { describe, expect, it } from 'vitest';
import { runExtractionBatch, type EpisodeInput } from './extraction';
import { scoreMatch, proposeMatches, PROPOSAL_THRESHOLD, type EpisodeExtraction } from './matching';
import { computePrecisionRecall, type GroundTruthRow } from './evaluate';
import fixtures from './fixtures/trueCrimeEpisodes.json';
import groundTruth from './fixtures/groundTruth.json';

const episodes = fixtures as EpisodeInput[];
const labels = groundTruth as GroundTruthRow[];

/**
 * Goes through the real batch entry point (not `extractCaseIdentifiers`
 * directly) so evaluation reflects BOTH suppression layers: the per-episode
 * manual correspondent stoplist and the batch-level, per-series frequency
 * safeguard — the latter only runs at the batch level, since it needs stats
 * across a whole series.
 */
function extractAll(eps: EpisodeInput[]): EpisodeExtraction[] {
  const report = runExtractionBatch(eps);
  const byId = new Map(eps.map((e) => [e.tvmazeEpisodeId, e]));
  return report.results.map((r) => ({ episode: byId.get(r.tvmazeEpisodeId)!, identifiers: r.identifiers }));
}

describe('scoreMatch', () => {
  it('scores a shared subject name above the proposal threshold on its own', () => {
    const a = { subjectNames: ['Jane Doe'], location: null, year: null, crimeType: null };
    const b = { subjectNames: ['Jane Doe'], location: null, year: null, crimeType: null };
    const { confidence } = scoreMatch(a, b);
    expect(confidence).toBeGreaterThanOrEqual(PROPOSAL_THRESHOLD);
  });

  it('matches "JonBenét Ramsey" against "JonBenet Ramsey" (diacritics normalized for comparison only)', () => {
    const a = { subjectNames: ['JonBenét Ramsey'], location: null, year: null, crimeType: null };
    const b = { subjectNames: ['JonBenet Ramsey'], location: null, year: null, crimeType: null };
    const { confidence, reasons } = scoreMatch(a, b);
    expect(confidence).toBeGreaterThanOrEqual(PROPOSAL_THRESHOLD);
    // Original spellings are preserved in the reason, not silently rewritten.
    expect(reasons.join(' ')).toContain('JonBenét Ramsey');
  });

  it('does not score two unrelated episodes sharing only a crime type above the threshold', () => {
    const a = { subjectNames: ['Alice Anders'], location: null, year: null, crimeType: 'murder' };
    const b = { subjectNames: ['Bob Baker'], location: null, year: null, crimeType: 'murder' };
    const { confidence } = scoreMatch(a, b);
    expect(confidence).toBeLessThan(PROPOSAL_THRESHOLD);
  });
});

describe('proposeMatches — real fixture set', () => {
  const extractions = extractAll(episodes);
  const candidates = proposeMatches(extractions);

  it('proposes at least one candidate pair from two episodes of DIFFERENT series covering the same real case', () => {
    const byId = new Map(episodes.map((e) => [e.tvmazeEpisodeId, e]));
    const crossSeriesMatch = candidates.find((c) => {
      const a = byId.get(c.episodeAId)!;
      const b = byId.get(c.episodeBId)!;
      return a.series !== b.series;
    });
    expect(crossSeriesMatch).toBeDefined();
    const a = byId.get(crossSeriesMatch!.episodeAId)!;
    const b = byId.get(crossSeriesMatch!.episodeBId)!;
    expect(a.series).not.toBe(b.series);
  });

  it('every proposed candidate meets the proposal threshold', () => {
    for (const c of candidates) {
      expect(c.confidence).toBeGreaterThanOrEqual(PROPOSAL_THRESHOLD);
    }
  });
});

describe('precision and recall against the hand-labeled fixture programmes', () => {
  it('has at least 50 ground-truth labels, all pointing at real fixture episodes', () => {
    expect(labels.length).toBeGreaterThanOrEqual(50);
    const fixtureIds = new Set(episodes.map((e) => e.tvmazeEpisodeId));
    for (const row of labels) {
      expect(fixtureIds.has(row.tvmazeEpisodeId)).toBe(true);
    }
  });

  it('computes precision and recall as numbers', () => {
    const extractions = extractAll(episodes);
    const candidates = proposeMatches(extractions);
    const report = computePrecisionRecall(candidates, labels);

    expect(typeof report.precision).toBe('number');
    expect(typeof report.recall).toBe('number');
    expect(report.precision).toBeGreaterThanOrEqual(0);
    expect(report.precision).toBeLessThanOrEqual(1);
    expect(report.recall).toBeGreaterThanOrEqual(0);
    expect(report.recall).toBeLessThanOrEqual(1);
    // Ground truth has real multi-episode Case groups — there must be true pairs to measure against.
    expect(report.groundTruthPairCount).toBeGreaterThan(0);
  });
});

/**
 * Regression: the two defects that produced a real false positive in
 * production — an unrelated Storage Wars episode auto-linked to a true-crime
 * show about Orange County murders.
 */
describe('production false-positive regressions', () => {
  const base = { subjectNames: [] as string[], location: null, year: null, crimeType: null };

  it('an air-year coincidence is not evidence', () => {
    // Every programme in a listings window shares an air year. Crediting that
    // handed a free +0.15 to every pair in the corpus.
    const a = { ...base, year: 2026, yearFromText: false };
    const b = { ...base, year: 2026, yearFromText: false };
    expect(scoreMatch(a, b).confidence).toBe(0);
  });

  it('a year the text actually states still counts', () => {
    const a = { ...base, year: 1996, yearFromText: true };
    const b = { ...base, year: 1996, yearFromText: true };
    expect(scoreMatch(a, b).reasons).toContain('same year: 1996');
  });

  it('circumstantial agreement alone stays under the auto-link bar', () => {
    // Same place, same year, same crime type, no shared person: 0.4.
    const a = { ...base, location: 'California', year: 2019, yearFromText: true, crimeType: 'murder' };
    const b = { ...base, location: 'California', year: 2019, yearFromText: true, crimeType: 'murder' };
    const { confidence, reasons } = scoreMatch(a, b);
    expect(confidence).toBeLessThan(0.75);
    expect(reasons.some((r) => r.startsWith('shared subject:'))).toBe(false);
  });
});
