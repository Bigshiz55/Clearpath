import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * PUBLIC DISCOVERY PLATFORM E2E — every template rendered in a real browser,
 * with metadata, canonical URLs, structured data, internal links, CTAs,
 * sitemap inclusion/exclusion, admin protection and responsive layout verified
 * against the running application.
 */

const SHOTS = 'test-results/discovery';

const EDITORIAL = [
  { path: '/compare/imdb', h1: 'WatchVerd1ct vs IMDb' },
  { path: '/compare/letterboxd', h1: 'WatchVerd1ct vs Letterboxd' },
  { path: '/compare/criticker', h1: 'WatchVerd1ct vs Criticker' },
  { path: '/compare/rottentomatoes', h1: 'WatchVerd1ct vs Rotten Tomatoes' },
  { path: '/for/couples', h1: 'A movie picker for couples' },
  { path: '/for/families', h1: 'Family movie night, decided' },
  { path: '/for/date-night', h1: 'Date night, sorted in a minute' },
  { path: '/for/movie-night', h1: 'What should I watch tonight?' },
  { path: '/for/personalized-ratings', h1: 'Personalised ratings, not crowd averages' },
  { path: '/guides/why-average-ratings-fail', h1: 'Why average ratings fail' },
  { path: '/guides/how-watchverd1ct-works', h1: 'How WatchVerd1ct works' },
  { path: '/guides/how-viewer-dna-works', h1: 'How Viewer DNA works' },
  { path: '/guides/how-court-works', h1: 'How Court decides for a group' },
  { path: '/guides/critics-vs-audiences', h1: 'Critics vs audiences' },
  { path: '/guides/how-personalised-ratings-work', h1: 'How personalised ratings work' },
  { path: '/discover/movies-under-90-minutes', h1: 'Movies under 90 minutes' },
  { path: '/discover/fast-thrillers', h1: 'Fast thrillers' },
  { path: '/discover/non-supernatural-thrillers', h1: 'Thrillers without the supernatural' },
  { path: '/discover/movies-for-couples', h1: 'Movies for two people' },
];

async function jsonLdTypes(page: Page): Promise<string[]> {
  return page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.flatMap((n) => {
      try {
        const parsed = JSON.parse(n.textContent ?? '{}');
        return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => String(p['@type']));
      } catch {
        return ['INVALID_JSON'];
      }
    }),
  );
}

test.describe('every template renders with complete, unique metadata', () => {
  for (const p of EDITORIAL) {
    test(`${p.path} renders`, async ({ page }) => {
      const res = await page.goto(p.path);
      expect(res?.status(), `${p.path} must return 200`).toBe(200);

      // Exactly one H1, matching the page heading.
      const h1s = page.locator('h1');
      await expect(h1s).toHaveCount(1);
      await expect(h1s).toHaveText(p.h1);

      // Metadata present and non-trivial.
      const title = await page.title();
      expect(title.length, `${p.path} title length`).toBeGreaterThan(14);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc?.length ?? 0, `${p.path} description length`).toBeGreaterThan(69);

      // Canonical URL points at this exact page.
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical, `${p.path} canonical`).toContain(p.path);

      // Open Graph + Twitter cards.
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1);

      // Structured data: Article + FAQPage + BreadcrumbList, all valid JSON.
      const types = await jsonLdTypes(page);
      expect(types, `${p.path} structured data`).toContain('Article');
      expect(types).toContain('FAQPage');
      expect(types).toContain('BreadcrumbList');
      expect(types).not.toContain('INVALID_JSON');
      // We never fabricate review schema.
      expect(types).not.toContain('Review');
      expect(types).not.toContain('AggregateRating');

      // Required page furniture.
      await expect(page.getByTestId('discovery-faq')).toBeVisible();
      await expect(page.getByTestId('discovery-related')).toBeVisible();
      await expect(page.getByTestId('cta-primary')).toBeVisible();
      await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeVisible();
    });
  }

  test('titles and descriptions are unique across every page', async ({ page }) => {
    test.setTimeout(180_000);
    const titles = new Set<string>();
    const descs = new Set<string>();
    for (const p of EDITORIAL) {
      await page.goto(p.path);
      const t = await page.title();
      const d = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
      expect(titles.has(t), `duplicate title on ${p.path}: ${t}`).toBe(false);
      expect(descs.has(d), `duplicate description on ${p.path}`).toBe(false);
      titles.add(t);
      descs.add(d);
    }
    expect(titles.size).toBe(EDITORIAL.length);
  });
});

test.describe('CTAs and internal links', () => {
  test('the CTA points into the product and is tagged for analytics', async ({ page }) => {
    await page.goto('/for/couples');
    const cta = page.getByTestId('cta-primary');
    await expect(cta).toHaveAttribute('href', '/start');
    // The analytics attribute identifies which page produced the conversion.
    await expect(cta).toHaveAttribute('data-cta', 'for:couples');
  });

  test('every related link on every page resolves to a real page', async ({ page }) => {
    test.setTimeout(180_000);
    const broken: string[] = [];
    for (const p of EDITORIAL) {
      await page.goto(p.path);
      const hrefs = await page.getByTestId('discovery-related').locator('a').evaluateAll((as) =>
        as.map((a) => a.getAttribute('href') ?? ''),
      );
      for (const href of hrefs) {
        const res = await page.request.get(href);
        if (res.status() !== 200) broken.push(`${p.path} → ${href} (${res.status()})`);
      }
    }
    expect(broken, `broken internal links: ${broken.join(', ')}`).toEqual([]);
  });
});

test.describe('public Explore', () => {
  test('lists published pages by section and links to them', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('explore')).toBeVisible();
    for (const kind of ['guide', 'compare', 'for', 'discover']) {
      await expect(page.getByTestId(`explore-${kind}`)).toBeVisible();
    }
    const links = await page.getByTestId('explore').locator('a[href^="/compare/"], a[href^="/guides/"], a[href^="/for/"], a[href^="/discover/"]').count();
    expect(links).toBeGreaterThanOrEqual(EDITORIAL.length);
    await page.screenshot({ path: path.join(SHOTS, 'explore-desktop.png'), fullPage: false });
  });
});

test.describe('sitemap and robots', () => {
  test('the sitemap contains every published page and nothing unpublished', async ({ page }) => {
    const res = await page.request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const p of EDITORIAL) {
      expect(xml, `${p.path} must be in the sitemap`).toContain(p.path);
    }
    // Private and internal surfaces must never appear.
    for (const forbidden of ['/admin', '/dev/', '/app/', '/migrate', '/growth-os']) {
      expect(xml, `${forbidden} must not be in the sitemap`).not.toContain(`<loc>${forbidden}`);
    }
  });

  test('robots.txt disallows the product, admin and harnesses', async ({ page }) => {
    const res = await page.request.get('/robots.txt');
    const txt = await res.text();
    expect(txt).toContain('Sitemap:');
    for (const dis of ['/admin', '/dev/', '/app', '/api/']) {
      expect(txt, `${dis} must be disallowed`).toContain(dis);
    }
  });
});

test.describe('security', () => {
  test('the CMS is not reachable without an admin session', async ({ page }) => {
    const res = await page.request.get('/admin/content');
    expect([401, 403, 404, 307, 302]).toContain(res.status());
  });

  test('a page that does not exist returns 404', async ({ page }) => {
    const res = await page.request.get('/compare/does-not-exist');
    expect(res.status()).toBe(404);
  });
});

test.describe('responsive', () => {
  for (const [label, w] of [['small-phone', 320], ['phone', 375], ['large-phone', 430], ['tablet', 820], ['desktop', 1440]] as const) {
    test(`no overflow at ${label} (${w}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      for (const p of ['/compare/imdb', '/for/couples', '/guides/how-watchverd1ct-works', '/explore']) {
        await page.goto(p);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${p} overflows at ${w}px`).toBeLessThanOrEqual(0);
      }
      if (w === 375) await page.screenshot({ path: path.join(SHOTS, 'compare-mobile.png'), fullPage: true });
      if (w === 1440) await page.screenshot({ path: path.join(SHOTS, 'compare-desktop.png'), fullPage: false });
    });
  }

  test('headings are semantic and ordered', async ({ page }) => {
    await page.goto('/guides/how-watchverd1ct-works');
    const levels = await page.locator('h1, h2, h3').evaluateAll((ns) => ns.map((n) => Number(n.tagName[1])));
    expect(levels[0]).toBe(1);
    // No heading level is ever skipped by more than one.
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('title template (movie/show)', () => {
  test('renders the full page from cached facts: hero, evidence, availability, sections', async ({ page }) => {
    await page.goto('/dev/title-page');
    await expect(page.getByTestId('title-hero')).toBeVisible();
    // Facts from the cache, not a live API call.
    await expect(page.getByTestId('title-hero')).toContainText('2019');
    await expect(page.getByTestId('title-hero')).toContainText('130 min');
    await expect(page.getByTestId('title-hero')).toContainText('Mystery');
    // Rating evidence, each source named.
    await expect(page.getByTestId('title-ratings')).toContainText('IMDb');
    await expect(page.getByTestId('title-ratings')).toContainText('7.9');
    // Availability stated with its source.
    await expect(page.getByTestId('title-availability')).toContainText('Netflix');
    // Required editorial sections.
    const body = await page.locator('body').innerText();
    for (const heading of ['The WatchVerd1ct take', 'Why people like it', 'Who should skip it', 'Where to watch']) {
      expect(body, `missing section: ${heading}`).toContain(heading);
    }
    await expect(page.getByTestId('discovery-faq')).toBeVisible();
    await expect(page.getByTestId('cta-primary')).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'title-template-desktop.png'), fullPage: false });
  });

  test('no overflow at phone width with the hero present', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/dev/title-page');
    await expect(page.getByTestId('title-hero')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, 'title-template-mobile.png'), fullPage: true });
  });

  test('an empty facts cache publishes NO movie or show URLs', async ({ page }) => {
    // The cache ships empty, so these routes must 404 rather than emit
    // placeholder pages — the gate refusing thin content, end to end.
    for (const url of ['/movie/anything', '/show/anything']) {
      const res = await page.request.get(url);
      expect(res.status(), `${url} must 404 with an empty cache`).toBe(404);
    }
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('<loc>/movie/');
    expect(sitemap).not.toContain('<loc>/show/');
  });
});
