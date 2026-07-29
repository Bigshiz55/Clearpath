import { describe, expect, it } from 'vitest';
import { extractCaseIdentifiers, runExtractionBatch, type EpisodeInput } from './extraction';
import fixtures from './fixtures/trueCrimeEpisodes.json';

const episodes = fixtures as EpisodeInput[];

describe('extractCaseIdentifiers', () => {
  it('extracts a subject name, location, year, and crime type from a real synopsis', () => {
    const id = extractCaseIdentifiers({
      tvmazeEpisodeId: 1,
      series: 'test',
      network: 'test',
      title: 'The Murder of John Smith',
      airdate: '2019-05-01',
      synopsis: 'In 2018, John Smith was murdered in Memphis, Tennessee. Investigators pursued the case for years.',
    });
    expect(id.subjectNames).toContain('John Smith');
    expect(id.year).toBe(2018);
    expect(id.crimeType).toBe('murder');
    expect(id.location === 'Tennessee' || id.location === 'Memphis').toBe(true);
  });

  it('falls back to the airdate year when no year is mentioned in the text', () => {
    const id = extractCaseIdentifiers({
      tvmazeEpisodeId: 2,
      series: 'test',
      network: 'test',
      title: 'A Cold Case',
      airdate: '2021-03-01',
      synopsis: 'A cold case investigation reopens after new evidence surfaces.',
    });
    expect(id.year).toBe(2021);
    expect(id.crimeType).toBe('cold case');
  });

  it('returns null fields honestly when nothing matches, rather than guessing', () => {
    const id = extractCaseIdentifiers({
      tvmazeEpisodeId: 3,
      series: 'test',
      network: 'test',
      title: 'Untitled',
      airdate: '',
      synopsis: 'lowercase text with no proper nouns at all here',
    });
    expect(id.subjectNames).toEqual([]);
    expect(id.location).toBeNull();
    expect(id.crimeType).toBeNull();
  });
});

describe('runExtractionBatch', () => {
  it('has at least 200 real fixture episodes across at least three distinct networks and series', () => {
    expect(episodes.length).toBeGreaterThanOrEqual(200);
    const networks = new Set(episodes.map((e) => e.network));
    const series = new Set(episodes.map((e) => e.series));
    expect(networks.size).toBeGreaterThanOrEqual(3);
    expect(series.size).toBeGreaterThanOrEqual(3);
  });

  it('runs over the full fixture set in one batch and reports cost per 1000 programmes', () => {
    const report = runExtractionBatch(episodes);
    expect(report.count).toBe(episodes.length);
    expect(report.results).toHaveLength(episodes.length);
    expect(report.method).toBe('rule-based');
    // Rule-based, no external API calls — genuinely $0, not an omitted metric.
    expect(report.costUsd).toBe(0);
    expect(report.costUsdPer1000).toBe(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('extracts at least one identifier field for the large majority of real episodes', () => {
    const report = runExtractionBatch(episodes);
    const withSomething = report.results.filter(
      (r) => r.identifiers.subjectNames.length > 0 || r.identifiers.location || r.identifiers.crimeType,
    );
    expect(withSomething.length / report.results.length).toBeGreaterThan(0.5);
  });
});
