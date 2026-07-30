import { describe, it, expect } from 'vitest';
import { screenPage, buildCorpus, isPublishable, screenSite } from './qualityGate';
import { EDITORIAL_PAGES, buildRegistry, duplicateSlugs, allPages } from './registry';
import type { DiscoveryPage } from './types';

const NOW = new Date('2026-07-25T12:00:00Z');

/** A page that passes everything — the baseline we then break in each test. */
function goodPage(over: Partial<DiscoveryPage> = {}): DiscoveryPage {
  const para = 'This is a substantial paragraph of original editorial writing that carries real explanatory value for a reader arriving from search, rather than repeating metadata that already exists elsewhere on the internet. '.repeat(3);
  return {
    kind: 'guide',
    slug: 'a-test-page',
    title: 'A Perfectly Reasonable Page Title Here',
    description:
      'A meta description of a realistic length that describes what the page actually contains and gives a searcher a genuine reason to click through to it.',
    heading: 'A test page',
    standfirst: 'One line.',
    status: 'published',
    updated: '2026-07-01',
    sections: [
      { heading: 'Why people like it', body: [para] },
      { heading: 'Who should skip it', body: [para] },
      { heading: 'The WatchVerd1ct take', body: [para] },
    ],
    faq: [
      { question: 'Is this a question?', answer: 'This is an answer long enough to be genuinely useful to a reader.' },
      { question: 'And another?', answer: 'This is a second answer that also clears the minimum length requirement.' },
    ],
    related: [
      { href: '/a', label: 'A' },
      { href: '/b', label: 'B' },
      { href: '/c', label: 'C' },
    ],
    cta: { label: 'Get your personal Verd1ct', href: '/start' },
    ...over,
  };
}

describe('quality gate — thin pages cannot publish', () => {
  it('a complete page passes and is publishable', () => {
    const page = goodPage();
    const corpus = buildCorpus([page]);
    expect(screenPage(page, corpus).ok).toBe(true);
    expect(isPublishable(page, corpus, NOW)).toBe(true);
  });

  it('too little body copy is blocked', () => {
    const page = goodPage({ sections: [{ heading: 'Why people like it', body: ['Short.'] }, { heading: 'Who should skip it', body: ['Also short but long enough to count as a section body here.'] }] });
    const r = screenPage(page, buildCorpus([page]));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.rule)).toContain('substantial_body');
    // A failing page is DEMOTED, never published.
    expect(r.status).toBe('draft');
    expect(isPublishable(page, buildCorpus([page]), NOW)).toBe(false);
  });

  it('missing "why people like it" or "who should skip it" is blocked', () => {
    const para = 'A long and genuinely substantial paragraph of editorial writing repeated to clear the word count threshold comfortably. '.repeat(6);
    const onlyPositive = goodPage({ sections: [{ heading: 'Why people like it', body: [para] }, { heading: 'The WatchVerd1ct take', body: [para] }] });
    const rules = screenPage(onlyPositive, buildCorpus([onlyPositive])).issues.map((i) => i.rule);
    expect(rules).toContain('why_people_skip_it');
  });

  it('no WatchVerd1ct explanation is blocked', () => {
    const para = 'Generic filler writing about films in general that never once explains this product or its position. '.repeat(6);
    const page = goodPage({
      sections: [
        { heading: 'Why people like it', body: [para] },
        { heading: 'Who should skip it', body: [para] },
      ],
    });
    expect(screenPage(page, buildCorpus([page])).issues.map((i) => i.rule)).toContain('watchverdict_explanation');
  });

  it('duplicate titles and descriptions across the corpus are blocked', () => {
    const a = goodPage({ slug: 'a' });
    const b = goodPage({ slug: 'b' });
    const corpus = buildCorpus([a, b]);
    const rules = screenPage(a, corpus).issues.map((i) => i.rule);
    expect(rules).toContain('unique_title');
    expect(rules).toContain('unique_description');
  });

  it('too few internal links, too few FAQs, and a broken CTA are each blocked', () => {
    const page = goodPage({
      related: [{ href: '/a', label: 'A' }],
      faq: [{ question: 'Only one?', answer: 'Yes and this is a sufficiently long answer to count.' }],
      cta: { label: '', href: 'https://external.example' },
    });
    const rules = screenPage(page, buildCorpus([page])).issues.map((i) => i.rule);
    expect(rules).toContain('internal_links');
    expect(rules).toContain('faq');
    expect(rules).toContain('cta');
  });

  it('title and description length bounds are enforced', () => {
    const short = goodPage({ title: 'Too short', description: 'Too short.' });
    const rules = screenPage(short, buildCorpus([short])).issues.map((i) => i.rule);
    expect(rules).toContain('title_length');
    expect(rules).toContain('description_length');
  });

  it('a movie page with no availability and no rating evidence cannot publish', () => {
    const page = goodPage({
      kind: 'movie',
      slug: 'some-film',
      title_data: {
        tmdbId: 1, mediaType: 'movie', year: 2020, runtimeMinutes: 100,
        genres: ['Drama'], posterUrl: null, providers: [], ratings: [],
      },
    });
    const rules = screenPage(page, buildCorpus([page])).issues.map((i) => i.rule);
    expect(rules).toContain('availability_known');
    expect(rules).toContain('evidence_present');
    expect(isPublishable(page, buildCorpus([page]), NOW)).toBe(false);
  });
});

describe('publication workflow', () => {
  it('only "published" status can be publishable', () => {
    for (const status of ['draft', 'needs_review', 'noindex', 'retired'] as const) {
      const page = goodPage({ status });
      expect(isPublishable(page, buildCorpus([page]), NOW), `${status} must not publish`).toBe(false);
    }
  });

  it('scheduled publication is not live before its date', () => {
    const future = goodPage({ publishAt: '2027-01-01' });
    expect(isPublishable(future, buildCorpus([future]), NOW)).toBe(false);
    const past = goodPage({ publishAt: '2026-01-01' });
    expect(isPublishable(past, buildCorpus([past]), NOW)).toBe(true);
  });

  it('screenSite reports a path and publishable flag for every page', () => {
    const site = screenSite([goodPage(), goodPage({ slug: 'b', status: 'draft', title: 'Another Distinct Page Title Here' })], NOW);
    expect(site).toHaveLength(2);
    expect(site[0]!.path).toBe('/guides/a-test-page');
    expect(site[1]!.publishable).toBe(false);
  });
});

describe('the real shipped content passes its own gate', () => {
  it('every editorial page in the registry is publishable', () => {
    const registry = buildRegistry(NOW);
    const failing = registry.filter((e) => !e.publishable);
    const detail = failing.map((f) => `${f.path}: ${f.quality.issues.map((i) => i.rule).join(', ')}`).join(' | ');
    expect(failing.length, `pages failing the gate → ${detail}`).toBe(0);
  });

  it('every title and description is unique across the whole site', () => {
    const titles = allPages().map((p) => p.title.toLowerCase());
    const descs = allPages().map((p) => p.description.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it('no duplicate slugs exist', () => {
    expect(duplicateSlugs()).toEqual([]);
  });

  it('every internal link points at a page that exists', () => {
    const known = new Set(allPages().map((p) => `/${p.kind === 'guide' ? 'guides' : p.kind}/${p.slug}`));
    // Non-discovery destinations that are real app routes.
    const appRoutes = new Set(['/start', '/explore', '/login', '/app', '/']);
    const broken: string[] = [];
    for (const page of EDITORIAL_PAGES) {
      for (const link of [...page.related, page.cta]) {
        const href = 'href' in link ? link.href : '';
        if (!known.has(href) && !appRoutes.has(href)) broken.push(`${page.kind}/${page.slug} → ${href}`);
      }
    }
    expect(broken, `broken internal links: ${broken.join(', ')}`).toEqual([]);
  });

  it('ships the Phase 1 editorial footprint', () => {
    const counts = EDITORIAL_PAGES.reduce<Record<string, number>>((acc, p) => {
      acc[p.kind] = (acc[p.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.compare).toBeGreaterThanOrEqual(4);
    expect(counts.for).toBeGreaterThanOrEqual(5);
    expect(counts.guide).toBeGreaterThanOrEqual(6);
    expect(counts.discover).toBeGreaterThanOrEqual(4);
  });
});
