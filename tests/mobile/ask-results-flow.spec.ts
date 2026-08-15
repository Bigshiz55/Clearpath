import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * ASK RESULTS RENDER IN THE PAGE, NEVER IN A BOX THAT SCROLLS ITSELF.
 *
 * The reported production defect: the answer to an Ask rendered inside the
 * chat card — a fixed-height (56vh/620px) container whose message area is
 * `overflow-y-auto` — so real results appeared as a cramped column inside a
 * NESTED VERTICAL SCROLL VIEWPORT, at 85% of a chat bubble's width, on a page
 * that was otherwise empty. This suite drives the EXACT AskTheJudge component
 * (via /dev/judge-harness, MOBILE_HARNESS-gated) with /api/ask mocked, and
 * asserts the layout CONTRACT on the real DOM:
 *
 *   • results live in normal document flow — the PAGE scrolls, the results
 *     container never does (scrollHeight === clientHeight, no overflow-y
 *     auto/scroll on it or any ancestor that isn't the document scroller);
 *   • every returned title renders as the canonical PosterCard, and all of
 *     them are reachable — none clipped away by a fixed/max height;
 *   • the grid is responsively multi-column: 1 per row on a phone, 2 on a
 *     tablet, 3–4 on a desktop;
 *   • the conversation controls (thread, chips, input) never overlap a card.
 *
 * These are browser-level measurements, not fixture assertions — the numbers
 * come from getBoundingClientRect/scrollHeight on the rendered page.
 */

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1440, height: 900 };

/** Eight titles — enough to force wrapping at every viewport. */
const TITLES = Array.from({ length: 8 }, (_, i) => ({
  id: 91000 + i,
  title: `Ringside Story ${i + 1}`,
  year: 2015 + i,
}));

function askPayload(query: string) {
  return {
    kind: 'search',
    requestId: `req-flow-${query.replace(/\s+/g, '-')}`,
    appliedText: query,
    conversation: { subjects: [query] },
    chips: [{ id: `subj:${query}`, label: query }],
    interpretation: [`Required subject: ${query} (central).`],
    scoredFor: 'Your match',
    relaxed: null,
    userKey: 'test-user-key',
    items: TITLES.map((t, i) => ({
      id: t.id,
      mediaType: 'movie',
      title: t.title,
      year: t.year,
      posterUrl: null,
      posterPath: null,
      matchScore: 90 - i,
      primaryCall: 'WATCH IT',
      reason: `${query} is central to this title`,
      where: 'Netflix',
      deciderUrl: '#',
    })),
  };
}

async function mockAsk(page: Page) {
  await page.route('**/api/ask', async (route: Route) => {
    const body = route.request().postDataJSON() as { text?: string };
    const q = String(body.text ?? '').trim() || 'boxing';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(askPayload(q)) });
  });
  // The cards hydrate scores/facts from these; empty answers keep the DOM real
  // without a backend.
  await page.route('**/api/dna**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ score: null }) }));
  await page.route('**/api/title-meta**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));
}

const results = (page: Page) => page.getByTestId('ask-results');
const grid = (page: Page) => page.getByTestId('ask-results-grid');
const cards = (page: Page) => page.locator('[data-testid="ask-results-grid"] > *');

async function loadResults(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await mockAsk(page);
  await page.goto('/dev/judge-harness?q=boxing', { waitUntil: 'domcontentloaded' });
  await expect(results(page)).toBeVisible();
  await expect(cards(page)).toHaveCount(TITLES.length);
}

/** Distinct left edges of the grid's tracks = tiles per row. */
async function columnsOf(page: Page): Promise<number> {
  return grid(page).evaluate((g) => {
    const lefts = new Set<number>();
    for (const el of Array.from(g.children)) {
      lefts.add(Math.round((el as HTMLElement).getBoundingClientRect().left));
    }
    return lefts.size;
  });
}

test.describe('the results container never scrolls itself', () => {
  for (const [name, vp] of [['phone', PHONE], ['tablet', TABLET], ['desktop', DESKTOP]] as const) {
    test(`${name}: normal flow — no inner scrollbox, no clipping ancestor`, async ({ page }) => {
      await loadResults(page, vp);

      const flow = await results(page).evaluate((el) => {
        const own = {
          scrolls: el.scrollHeight > el.clientHeight + 1,
          overflowY: getComputedStyle(el).overflowY,
          maxHeight: getComputedStyle(el).maxHeight,
        };
        // Any ancestor that scrolls vertically (other than the document
        // itself) would put the results back inside a nested viewport.
        const offenders: string[] = [];
        for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
          const oy = getComputedStyle(a).overflowY;
          const isDocScroller = a === document.scrollingElement || a === document.body;
          if (!isDocScroller && (oy === 'auto' || oy === 'scroll')) {
            offenders.push(`${a.tagName}.${a.className}`);
          }
        }
        return { own, offenders };
      });

      expect(flow.own.scrolls, 'the results container must not scroll internally').toBe(false);
      expect(['visible', 'clip'].includes(flow.own.overflowY) || flow.own.overflowY === 'visible', `results overflow-y is ${flow.own.overflowY}`).toBe(true);
      expect(flow.own.maxHeight, 'no max-height clipping on results').toBe('none');
      expect(flow.offenders, 'no scrolling ancestor may contain the results').toEqual([]);
    });

    test(`${name}: every returned title is rendered and reachable by PAGE scroll`, async ({ page }) => {
      await loadResults(page, vp);
      // All cards exist in the document at full height (nothing height-clipped)…
      const n = await cards(page).count();
      expect(n).toBe(TITLES.length);
      // …and the LAST card becomes visible by scrolling the PAGE, not an inner box.
      await cards(page).last().scrollIntoViewIfNeeded();
      await expect(cards(page).last()).toBeVisible();
      await expect(cards(page).last().getByText(`Ringside Story ${TITLES.length}`)).toBeVisible();
    });
  }
});

test.describe('tiles per row follow the canonical responsive grid', () => {
  test('phone: one tile per row', async ({ page }) => {
    await loadResults(page, PHONE);
    expect(await columnsOf(page)).toBe(1);
  });

  test('tablet: two tiles per row', async ({ page }) => {
    await loadResults(page, TABLET);
    expect(await columnsOf(page)).toBe(2);
  });

  test('desktop: three to four tiles per row', async ({ page }) => {
    await loadResults(page, DESKTOP);
    const cols = await columnsOf(page);
    expect(cols, `desktop rendered ${cols} columns`).toBeGreaterThanOrEqual(3);
    expect(cols).toBeLessThanOrEqual(4);
  });
});

test.describe('the conversation never overlaps the results', () => {
  for (const [name, vp] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
    test(`${name}: thread, chips and input all sit clear of every card`, async ({ page }) => {
      await loadResults(page, vp);
      const overlaps = await page.evaluate(() => {
        const rect = (el: Element) => el.getBoundingClientRect();
        const intersects = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        // ONLY the conversation card's controls. Result tiles are themselves
        // `.card`s with their own buttons — those legitimately sit on the card.
        const conversation = document.querySelector('textarea')?.closest('.card') ?? null;
        const controls = conversation
          ? [
              ...Array.from(conversation.querySelectorAll('textarea, button')),
              ...Array.from(document.querySelectorAll('[data-testid="conversation-chips"] button')),
            ]
          : [];
        if (!conversation) return ['conversation card not found'];
        const cardEls = Array.from(document.querySelectorAll('[data-testid="ask-results-grid"] > *'));
        const hits: string[] = [];
        for (const c of controls) {
          for (const t of cardEls) {
            if (intersects(rect(c), rect(t))) hits.push(`${c.tagName} overlaps a result card`);
          }
        }
        return hits;
      });
      expect(overlaps).toEqual([]);
    });
  }
});

test('the regression itself: results are NOT inside the conversation card', async ({ page }) => {
  await loadResults(page, PHONE);
  // The chat card is allowed to scroll its own text thread; the results may
  // not be its descendant — that containment IS the production bug.
  const inside = await results(page).evaluate((el) => el.closest('.card') != null);
  expect(inside, 'results rendered inside the chat card again').toBe(false);
});
