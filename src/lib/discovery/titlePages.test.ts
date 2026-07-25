import { describe, it, expect } from 'vitest';
import { buildTitlePages, type CachedTitle } from './titlePages';
import { screenPage, buildCorpus, isPublishable } from './qualityGate';

const NOW = new Date('2026-07-25T12:00:00Z');

const ANALYSIS =
  'A tightly constructed whodunnit that keeps handing the audience new information rather than withholding it, which is why it plays so well with a group who all want to guess. WatchVerd1ct rates it strongly for viewers whose profile leans toward fast, plot-forward mysteries with a comic edge. ';

/** A fully-editorialised, fully-evidenced cached title — the publishable case. */
function completeTitle(over: Partial<CachedTitle> = {}): CachedTitle {
  return {
    slug: 'a-test-film-2019',
    tmdbId: 1,
    mediaType: 'movie',
    title: 'A Test Film',
    year: 2019,
    runtimeMinutes: 130,
    genres: ['Mystery', 'Comedy'],
    posterUrl: 'https://image.tmdb.org/t/p/w500/x.jpg',
    providers: ['Netflix'],
    ratings: [{ source: 'IMDb', value: '7.9' }, { source: 'TMDB audience', value: '78%' }],
    overview: 'A detective investigates.',
    verdictSummary: ANALYSIS.repeat(2),
    whoItIsFor: ANALYSIS.repeat(2),
    whoShouldSkip: 'If you dislike ensemble casts talking at speed, or you want atmosphere rather than plot mechanics, this will feel busy. '.repeat(3),
    characteristics: ['Fast, plot-forward pacing', 'Ensemble cast', 'Comic tone'],
    contentNotes: ['Mild violence'],
    similar: [{ slug: 'another-film-2021', label: 'Another Film', kind: 'movie' }],
    cachedAt: '2026-07-20',
    ...over,
  };
}

describe('title page generation', () => {
  it('a complete, evidenced title produces a publishable page', () => {
    const [page] = buildTitlePages([completeTitle()]);
    expect(page!.kind).toBe('movie');
    expect(page!.slug).toBe('a-test-film-2019');
    expect(page!.heading).toBe('A Test Film (2019)');
    const corpus = buildCorpus([page!]);
    const r = screenPage(page!, corpus);
    expect(r.issues.map((i) => i.rule), JSON.stringify(r.issues)).toEqual([]);
    expect(isPublishable(page!, corpus, NOW)).toBe(true);
  });

  it('the page carries the required sections, FAQ, links and CTA', () => {
    const [page] = buildTitlePages([completeTitle()]);
    const headings = page!.sections.map((s) => s.heading);
    expect(headings).toContain('The WatchVerd1ct take');
    expect(headings).toContain('Why people like it');
    expect(headings).toContain('Who should skip it');
    expect(headings).toContain('Where to watch');
    expect(page!.faq.length).toBeGreaterThanOrEqual(3);
    expect(page!.related.length).toBeGreaterThanOrEqual(3);
    expect(page!.cta.href).toBe('/start');
  });

  it('a TV title becomes a show page with season and episode facts', () => {
    const [page] = buildTitlePages([
      completeTitle({ slug: 'a-test-series-2010', mediaType: 'tv', title: 'A Test Series', seasons: 4, episodes: 13, seriesStatus: 'Ended' }),
    ]);
    expect(page!.kind).toBe('show');
    expect(page!.standfirst).toContain('4 seasons');
    expect(page!.standfirst).toContain('13 episodes');
    expect(page!.faq.some((f) => f.answer.includes('Ended'))).toBe(true);
  });
});

describe('the gate blocks thin auto-generated title pages', () => {
  it('no availability and no ratings → cannot publish', () => {
    const [page] = buildTitlePages([completeTitle({ providers: [], ratings: [] })]);
    const corpus = buildCorpus([page!]);
    const rules = screenPage(page!, corpus).issues.map((i) => i.rule);
    expect(rules).toContain('availability_known');
    expect(rules).toContain('evidence_present');
    expect(isPublishable(page!, corpus, NOW)).toBe(false);
  });

  it('no editorial analysis → too thin to publish, even with full metadata', () => {
    const [page] = buildTitlePages([
      completeTitle({ verdictSummary: '', whoItIsFor: '', whoShouldSkip: '', characteristics: [], contentNotes: [] }),
    ]);
    const corpus = buildCorpus([page!]);
    const rules = screenPage(page!, corpus).issues.map((i) => i.rule);
    expect(rules).toContain('substantial_body');
    expect(isPublishable(page!, corpus, NOW)).toBe(false);
  });

  it('honest language when availability is unknown — never an invented claim', () => {
    const [page] = buildTitlePages([completeTitle({ providers: [] })]);
    const where = page!.sections.find((s) => s.heading === 'Where to watch')!;
    expect(where.body.join(' ')).toMatch(/no verified streaming availability/i);
    expect(where.body.join(' ')).not.toMatch(/available on Netflix/i);
  });

  it('honest language when no rating evidence exists', () => {
    const [page] = buildTitlePages([completeTitle({ ratings: [] })]);
    const take = page!.sections.find((s) => s.heading === 'The WatchVerd1ct take')!;
    expect(take.body.join(' ')).toMatch(/no independent rating sources/i);
  });

  it('an empty cache yields no title pages at all (no placeholder URLs)', () => {
    expect(buildTitlePages([])).toEqual([]);
  });
});
