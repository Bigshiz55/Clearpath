import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * CONTROL CLICK-THROUGH SUITE — drives the REAL FinderUI + ReleaseWall on the
 * /dev/finder harness with intercepted API responses, proving the full loop
 * the release mission mandates: interaction → application state → issued
 * request (with the right parameters) → validated render → refinement
 * staleness → Update results → latest-request-wins under a race.
 */

const HARNESS = '/dev/finder';

function finderItem(id: number, title: string, mediaType: 'movie' | 'tv' = 'movie') {
  return {
    id, mediaType, title, year: 2023, posterPath: null, posterUrl: null,
    matchScore: 88, generalScore: 80, primaryCall: 'STREAM IT', reason: 'Fixture verdict.',
    where: 'Netflix', receipts: ['On Netflix'], deciderUrl: `/app/title/${mediaType}/${id}`,
  };
}

async function mockFinder(page: Page, handler: (route: Route, body: Record<string, unknown>) => Promise<void> | void) {
  await page.route('**/api/finder', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await handler(route, body);
  });
}

test.describe('FinderUI — refinement pipeline', () => {
  test('search → results → slider change → staleness banner → Update results → confirmation', async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    await mockFinder(page, (route, body) => {
      requests.push(body);
      return route.fulfill({
        json: {
          items: requests.length === 1
            ? [finderItem(1, 'First Wave'), finderItem(2, 'Second Wind')]
            : [finderItem(3, 'Refined Cut')],
          scoredFor: 'Your match', relaxed: null,
        },
      });
    });
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');

    // 1) Type the mandated regression ask and submit.
    await finder.getByRole('textbox').first().fill('Family movie night');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();
    await expect(page.locator('#finder-results')).toBeVisible();
    await expect(page.getByText('First Wave')).toBeVisible();
    expect(requests[0]!.text).toBe('Family movie night');
    // English audio must be OFF by default — nothing in this ask requests it.
    expect((requests[0]!.query as Record<string, unknown>).englishAudioOnly).toBe(false);
    // No hidden runtime cap rides along with a neutral ask.
    expect((requests[0]!.query as Record<string, unknown>).maxRuntime).toBeNull();

    // 2) With results showing, the CTA reads "Update results", not "Find titles".
    await expect(finder.getByRole('button', { name: /Update results/ }).first()).toBeVisible();

    // 3) Move the IMDb slider → results are now stale → banner appears.
    await finder.locator('input[type=range]').nth(3).fill('7');
    const banner = page.getByTestId('filters-changed');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/don’t reflect/);

    // 4) Click the banner's Update results → new request carries the refinement…
    await banner.getByRole('button', { name: 'Update results' }).click();
    await expect(page.getByText('Refined Cut')).toBeVisible();
    expect(requests).toHaveLength(2);
    expect((requests[1]!.query as Record<string, unknown>).minImdb).toBe(7);

    // …the old result set is replaced atomically, the banner clears, and the
    // visible confirmation + active-filter chips appear.
    await expect(page.getByText('First Wave')).toHaveCount(0);
    await expect(banner).toHaveCount(0);
    await expect(page.getByTestId('results-updated')).toBeVisible();
    await expect(page.getByTestId('active-filters')).toContainText('IMDb 7.0+');
  });

  test('latest-request-wins: a slow first response never overwrites a newer one', async ({ page }) => {
    let call = 0;
    await mockFinder(page, async (route, body) => {
      call += 1;
      if (call === 1) {
        // The FIRST request is slow and stale…
        await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({ json: { items: [finderItem(1, 'Stale Result')], scoredFor: 'Your match', relaxed: null } }).catch(() => {});
      }
      // …the SECOND (refined) request answers fast.
      void body;
      return route.fulfill({ json: { items: [finderItem(2, 'Fresh Result')], scoredFor: 'Your match', relaxed: null } });
    });
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    const ask = finder.getByRole('textbox').first();
    await ask.fill('crime thrillers');
    // Rapid double-submit via Enter (the button disables while loading, but a
    // user can always hit Enter again — the exact stale-overwrite hazard).
    await ask.press('Enter');
    await page.waitForTimeout(150);
    await ask.press('Enter');

    await expect(page.getByText('Fresh Result')).toBeVisible();
    // Give the stale response time to land — it must NOT replace the fresh set.
    await page.waitForTimeout(1800);
    await expect(page.getByText('Fresh Result')).toBeVisible();
    await expect(page.getByText('Stale Result')).toHaveCount(0);
  });

  test('failure state: API error shows retry copy, not a dead end', async ({ page }) => {
    await mockFinder(page, (route) => route.fulfill({ status: 500, json: { error: 'boom' } }));
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    await finder.getByRole('textbox').first().fill('anything');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();
    await expect(page.getByText(/Couldn’t run that search/)).toBeVisible();
  });
});

test.describe('Card action row — FOR → PASS → SAVE on every applicable card', () => {
  test('every card shows all three actions, in order, at usable size', async ({ page }) => {
    await page.goto('/dev/visual-qa');
    const cards = page.getByTestId('qa-grid').locator('.card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(3);
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const forBtn = card.getByRole('button', { name: /For it — more like this/ });
      const passBtn = card.getByRole('button', { name: /Not for me/ });
      const saveBtn = card.getByRole('button', { name: /list|Save/i }).first();
      await expect(forBtn, `card ${i} missing FOR`).toBeVisible();
      await expect(passBtn, `card ${i} missing PASS`).toBeVisible();
      await expect(saveBtn, `card ${i} missing SAVE`).toBeVisible();
      // Order: FOR left of PASS left of SAVE, and 44px tap targets.
      const [f, p, s] = await Promise.all([forBtn.boundingBox(), passBtn.boundingBox(), saveBtn.boundingBox()]);
      expect(f!.x, `card ${i}: FOR must precede PASS`).toBeLessThan(p!.x);
      expect(p!.x, `card ${i}: PASS must precede SAVE`).toBeLessThan(s!.x);
      for (const [name, b] of [['FOR', f], ['PASS', p], ['SAVE', s]] as const) {
        expect(b!.height, `card ${i}: ${name} below 44px tap target`).toBeGreaterThanOrEqual(43);
      }
      // All three stay INSIDE the card border (Safari min-content guard).
      const cb = (await card.boundingBox())!;
      expect(s!.x + s!.width, `card ${i}: SAVE escapes the card`).toBeLessThanOrEqual(cb.x + cb.width + 1);
    }
  });
});

test.describe('ReleaseWall — the Shows+Upcoming+Soonest+Netflix combination', () => {
  test('each control changes the issued request; unsupported combo gets the diagnostic empty state', async ({ page }) => {
    const requests: Record<string, unknown>[] = [];
    await page.route('**/api/releases', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      requests.push(body);
      // Provider + upcoming is the unsupported combination → empty; all else has data.
      const empty = body.window === 'upcoming' && Array.isArray(body.providerIds) && body.providerIds.length > 0;
      await route.fulfill({
        json: {
          items: empty ? [] : [{
            id: 900, mediaType: 'tv', title: 'Wall Fixture', releaseDate: '2099-01-01',
            posterPath: null, posterUrl: null, providers: [], score: null,
          }],
        },
      });
    });
    await page.goto(HARNESS);
    const wall = page.getByTestId('harness-releases');
    await expect(wall.getByText('Wall Fixture').first()).toBeVisible();

    // Click through the EXACT mandated sequence, asserting the request each time.
    await wall.getByRole('button', { name: 'Shows', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.mediaType).toBe('tv');
    await wall.getByRole('button', { name: 'Upcoming', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.window).toBe('upcoming');
    await wall.getByRole('button', { name: 'Soonest', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.sort).toBe('new');
    await wall.getByRole('button', { name: /Netflix/ }).click();
    await expect.poll(() => JSON.stringify(requests.at(-1)?.providerIds)).toBe('[8]');

    // The empty result must render the TRUTHFUL diagnostic, not "no titles".
    const emptyState = page.getByTestId('releases-empty');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toHaveAttribute('data-reason', 'unsupported_upcoming_provider');

    // And its recovery action is a REAL state patch: all-platforms upcoming refetches.
    await emptyState.getByRole('button', { name: /general upcoming/ }).click();
    await expect.poll(() => JSON.stringify(requests.at(-1)?.providerIds)).toBe('[]');
    await expect(wall.getByText('Wall Fixture').first()).toBeVisible();
  });
});
