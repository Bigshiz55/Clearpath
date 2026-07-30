import { describe, expect, it } from 'vitest';
import {
  extractCaseIdentifiers,
  normalizeDiacritics,
  runExtractionBatch,
  CORRESPONDENT_FREQUENCY_THRESHOLD,
  type EpisodeInput,
} from './extraction';
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

function ep(overrides: Partial<EpisodeInput>): EpisodeInput {
  return {
    tvmazeEpisodeId: 0,
    series: 'test',
    network: 'test',
    title: '',
    airdate: '2020-01-01',
    synopsis: '',
    ...overrides,
  };
}

describe('correspondent and narrator suppression', () => {
  it('extracts "Keith Morrison" but excludes it from subjectNames on Dateline NBC (manual stoplist)', () => {
    const episode = ep({
      series: 'Dateline NBC',
      title: 'The Vanishing',
      synopsis: 'A family struggles to understand what happened to their daughter. Keith Morrison reports.',
    });
    const id = extractCaseIdentifiers(episode);
    expect(id.rawSubjectNames).toContain('Keith Morrison');
    expect(id.subjectNames).not.toContain('Keith Morrison');
  });

  it('does not suppress a name that only coincidentally shares a stoplisted correspondent\'s name on a different series', () => {
    // The manual stoplist is keyed by series — "Keith Morrison" is only ever
    // suppressed for the shows it's actually listed against.
    const episode = ep({
      series: 'A Show Not In The Stoplist',
      synopsis: 'Keith Morrison was the prime suspect in the 1994 disappearance.',
    });
    const id = extractCaseIdentifiers(episode);
    expect(id.subjectNames).toContain('Keith Morrison');
  });

  it('auto-suppresses a name appearing in 80% of one series\' episodes, without it being in the manual stoplist', () => {
    const series = 'Synthetic Anthology Show';
    const subjects = [
      'Alice Adams', 'Bob Baker', 'Carla Cruz', 'Derek Diaz', 'Ellen Ellis',
      'Frank Foster', 'Gina Grant', 'Harry Hayes', 'Ivy Irwin', 'Jack Jones',
    ];
    const episodes10: EpisodeInput[] = Array.from({ length: 10 }, (_, i) =>
      ep({
        tvmazeEpisodeId: 9000 + i,
        series,
        title: `Episode ${i}`,
        // 8 of 10 (80%) mention the same recurring on-air name; each also
        // has a distinct real case subject so the two never get confused.
        synopsis:
          i < 8
            ? `Randall Voss reports on the disappearance of ${subjects[i]}.`
            : `A cold case reopens for ${subjects[i]}.`,
      }),
    );
    const report = runExtractionBatch(episodes10);
    for (const r of report.results) {
      expect(r.identifiers.subjectNames).not.toContain('Randall Voss');
    }
    // The frequency safeguard doesn't touch the distinct per-episode case names.
    expect(report.results[0]!.identifiers.subjectNames).toContain('Alice Adams');
  });

  it('does not suppress a name below the frequency threshold', () => {
    const series = 'Synthetic Anthology Show 2';
    // 2 of 10 (20%) — below CORRESPONDENT_FREQUENCY_THRESHOLD (25%).
    expect(CORRESPONDENT_FREQUENCY_THRESHOLD).toBeGreaterThan(0.2);
    const episodes10: EpisodeInput[] = Array.from({ length: 10 }, (_, i) =>
      ep({
        tvmazeEpisodeId: 9100 + i,
        series,
        synopsis: i < 2 ? 'Rare Guest Anchor covers a 2015 murder case.' : `A story about Person${i} unfolds.`,
      }),
    );
    const report = runExtractionBatch(episodes10);
    const withGuestAnchor = report.results.filter((r) => r.identifiers.subjectNames.includes('Rare Guest Anchor'));
    expect(withGuestAnchor.length).toBe(2);
  });

  it('suppression is per-series — a name suppressed on one series is a legitimate subject on another', () => {
    const suppressedOn = 'Series With Recurring Talent';
    const legitOn = 'Series Where They Are A Real Subject';
    const talkingHead = 'Frequent Anchor Person';

    const episodesA: EpisodeInput[] = Array.from({ length: 5 }, (_, i) =>
      ep({
        tvmazeEpisodeId: 9200 + i,
        series: suppressedOn,
        synopsis: `${talkingHead} reports on the case of Victim${i}.`,
      }),
    );
    const episodeB = ep({
      tvmazeEpisodeId: 9300,
      series: legitOn,
      synopsis: `${talkingHead} was accused of embezzlement in 2019.`,
    });

    const report = runExtractionBatch([...episodesA, episodeB]);
    const resultsA = report.results.filter((r) => episodesA.some((e) => e.tvmazeEpisodeId === r.tvmazeEpisodeId));
    const resultB = report.results.find((r) => r.tvmazeEpisodeId === episodeB.tvmazeEpisodeId)!;

    for (const r of resultsA) {
      expect(r.identifiers.subjectNames).not.toContain(talkingHead);
    }
    expect(resultB.identifiers.subjectNames).toContain(talkingHead);
  });
});
