import { describe, expect, it } from 'vitest';
import { extractCaseIdentifiers, normalizeDiacritics, runExtractionBatch, type EpisodeInput } from './extraction';
import fixtures from './fixtures/trueCrimeEpisodes.json';

const episodes = fixtures as EpisodeInput[];

function subjectNamesIn(synopsis: string): string[] {
  return extractCaseIdentifiers({
    tvmazeEpisodeId: 0,
    series: 'test',
    network: 'test',
    title: '',
    airdate: '2020-01-01',
    synopsis,
  }).subjectNames;
}

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

describe('compound and internally-capitalized proper noun forms', () => {
  it('extracts JonBenét (accented, internal capital)', () => {
    const names = subjectNamesIn('The murder of JonBenét Ramsey remains unsolved.');
    expect(names).toContain('JonBenét Ramsey');
  });

  it('extracts JonBenet (unaccented, internal capital)', () => {
    const names = subjectNamesIn('The murder of JonBenet Ramsey remains unsolved.');
    expect(names).toContain('JonBenet Ramsey');
  });

  it('extracts DeAngelo (internal capital, standalone)', () => {
    const names = subjectNamesIn('DeAngelo was arrested decades after the crimes.');
    expect(names).toContain('DeAngelo');
  });

  it('extracts McDonald (internal capital, standalone)', () => {
    const names = subjectNamesIn('McDonald was convicted of murder in 2001.');
    expect(names).toContain('McDonald');
  });

  it('extracts MacArthur (internal capital, standalone)', () => {
    const names = subjectNamesIn('MacArthur testified about the night of the crime.');
    expect(names).toContain('MacArthur');
  });

  it("extracts O'Neill (apostrophe, single-letter initial)", () => {
    const names = subjectNamesIn("O'Neill was the lead detective on the case.");
    expect(names).toContain("O'Neill");
  });

  it("extracts D'Angelo (apostrophe, single-letter initial)", () => {
    const names = subjectNamesIn("D'Angelo confessed to investigators years later.");
    expect(names).toContain("D'Angelo");
  });

  it('extracts Smith-Jones (hyphenated surname)', () => {
    const names = subjectNamesIn('The victim was later identified as Smith-Jones.');
    expect(names).toContain('Smith-Jones');
  });

  it('does not extract plain network acronyms as compound names', () => {
    const names = subjectNamesIn('NBC and CBS both covered the trial.');
    expect(names).toEqual([]);
  });
});

describe('normalizeDiacritics', () => {
  it('strips combining diacritics so accented and unaccented spellings match', () => {
    expect(normalizeDiacritics('JonBenét')).toBe(normalizeDiacritics('JonBenet'));
    expect(normalizeDiacritics('JonBenét').toLowerCase()).toBe('jonbenet');
  });

  it('the two JonBenét spellings resolve to the same entity for matching purposes', () => {
    const accented = subjectNamesIn('The case of JonBenét Ramsey.');
    const plain = subjectNamesIn('The case of JonBenet Ramsey.');
    const normalize = (n: string) => normalizeDiacritics(n.toLowerCase().trim());
    expect(accented.map(normalize)).toEqual(plain.map(normalize));
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
