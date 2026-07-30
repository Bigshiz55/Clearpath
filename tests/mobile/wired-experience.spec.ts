import { test, expect, type Page, type Route } from '@playwright/test';
import path from 'node:path';

/**
 * WIRED-EXPERIENCE E2E — the mission's TESTS A/B/E/F, run against the REAL
 * FinderUI on /dev/finder. The /api/finder responses are intercepted with
 * payloads in the exact shape the real route serializes (explain + household
 * are produced server-side by buildItemExplanation/assembleHousehold, which
 * are unit-tested; here we prove the interface renders and reacts end to end).
 */

const HARNESS = '/dev/finder';
const SHOTS = 'test-results/wired';

function itemWith(over: Record<string, unknown>) {
  return {
    id: 1, mediaType: 'movie', title: 'The Night Detective', year: 2023, posterPath: null, posterUrl: null,
    matchScore: 88, generalScore: 78, primaryCall: 'STREAM IT', reason: 'A fast, twisty investigation.',
    where: 'Netflix', receipts: ['Your 88', '118m', '2023'], deciderUrl: '/x',
    explain: {
      rose: ['Strong personal fit (88 match).', 'Fast investigative storytelling'],
      heldBack: ['Darker than your usual weeknight choice'],
      requirements: [
        { label: 'Movie', satisfied: true, evidence: 'feature film' },
        { label: 'Under 100 min', satisfied: true, evidence: '96 min' },
      ],
      availability: { text: 'Netflix · Included with subscription', confidence: 'likely' },
      confidence: { level: 'high', because: ['Personal taste signal available.'] },
    },
    household: null,
    ...over,
  };
}

async function mock(page: Page, handler: (route: Route, body: Record<string, unknown>) => unknown) {
  await page.route('**/api/finder', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await handler(route, body);
  });
}

test.describe('TEST A — Why this Verd1ct? on real result cards', () => {
  test('explanation opens with real positive/negative factors, requirements, availability, confidence', async ({ page }) => {
    await mock(page, (route) => route.fulfill({ json: { items: [itemWith({})], scoredFor: 'Your match', relaxed: null } }));
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    await finder.getByRole('textbox').first().fill('a fast mystery under 100 minutes');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();

    const why = page.getByTestId('why-verdict');
    await expect(why).toBeVisible();
    await why.locator('summary').first().click();
    // Three NAMED sections, in decision order.
    await expect(why).toContainText('Why it matched');
    await expect(why).toContainText('Fast investigative storytelling');
    await expect(why).toContainText('Things to know');
    await expect(why).toContainText('Darker than your usual weeknight choice');
    await expect(why).toContainText('Your requirements');
    await expect(why).toContainText('✓ Under 100 min');
    await expect(why).toContainText('Netflix · Included with subscription');
    await expect(why).toContainText('likely');
    await expect(why).toContainText(/Confidence: high/i);

    // THE MATHS IS KEPT, ONE LAYER DOWN. "(88 match)" is off the reason and
    // behind the details toggle — not deleted.
    await expect(why.getByTestId('why-matched')).toContainText('Strong personal fit');
    await expect(why.getByTestId('why-matched')).not.toContainText('88 match');
    const details = why.getByTestId('scoring-details');
    await expect(details).toBeVisible();
    await details.locator('summary').click();
    await expect(details).toContainText('88 match');

    await page.screenshot({ path: path.join(SHOTS, 'A-why-verdict-open-desktop.png'), fullPage: false });

    // Close works too.
    await why.locator('summary').first().click();
    await expect(why.getByText('Why it matched')).not.toBeVisible();
  });

  test('the reasons are body type, not caption type', async ({ page }) => {
    await mock(page, (route) => route.fulfill({ json: { items: [itemWith({})], scoredFor: 'Your match', relaxed: null } }));
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    await finder.getByRole('textbox').first().fill('a fast mystery');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();

    const why = page.getByTestId('why-verdict');
    await why.locator('summary').first().click();
    // The whole panel rendered at 12px slate-300 — caption type, for the one
    // block whose entire job is to be read at a glance.
    const line = why.getByTestId('why-matched').locator('p').first();
    const style = await line.evaluate((el) => {
      const c = getComputedStyle(el);
      const rgb = /rgba?\(([^)]+)\)/.exec(c.color)![1]!.split(',').map((n) => Number(n.trim()));
      return { size: parseFloat(c.fontSize), bright: Math.min(rgb[0]!, rgb[1]!, rgb[2]!) };
    });
    expect(style.size, 'reason text is still caption-sized').toBeGreaterThanOrEqual(14);
    expect(style.bright, `reason text is still dim (${style.bright})`).toBeGreaterThanOrEqual(200);
  });

  test('a close button at the BOTTOM folds the panel — no scroll back to the summary', async ({ page }) => {
    await mock(page, (route) => route.fulfill({ json: { items: [itemWith({})], scoredFor: 'Your match', relaxed: null } }));
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    await finder.getByRole('textbox').first().fill('a fast mystery');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();

    const why = page.getByTestId('why-verdict');
    await why.locator('summary').first().click();
    await expect(why).toContainText('Why it matched');

    const close = why.getByTestId('why-close');
    await expect(close).toBeVisible();
    // At the bottom of the open panel, below the last content — where the eye
    // finishes reading.
    const closeBox = (await close.boundingBox())!;
    const matched = (await why.getByTestId('why-matched').boundingBox())!;
    expect(closeBox.y).toBeGreaterThan(matched.y + matched.height);

    await close.click();
    await expect(why.getByText('Why it matched')).not.toBeVisible();
    // And it can be reopened — closing did not break the summary toggle.
    await why.locator('summary').first().click();
    await expect(why).toContainText('Why it matched');
  });
});

test.describe('ONE NUMBER PER CARD', () => {
  test('the pill row never restates the score, the year or the runtime', async ({ page }) => {
    // The fixture's receipts are exactly the three repeats that used to render:
    // "Your 88" (a second score, beside a badge showing a different number),
    // "118m" (the facts line says it) and "2023" (the heading says it).
    await mock(page, (route) => route.fulfill({ json: { items: [itemWith({})], scoredFor: 'Your match', relaxed: null } }));
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    await finder.getByRole('textbox').first().fill('a fast mystery');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();

    const pills = page.getByTestId('result-pills');
    await expect(pills).toBeVisible();
    // What survives is the next step, drawn as an affordance.
    await expect(pills).toContainText('Watch on Netflix');
    // And none of the repeats.
    await expect(pills).not.toContainText('Your 88');
    await expect(pills).not.toContainText('118m');
    await expect(pills).not.toContainText('2023');
    await expect(pills.locator('[data-tone="match"]')).toHaveCount(0);
  });

  test('a card with nothing new to say renders no pill row at all', async ({ page }) => {
    await mock(page, (route) =>
      route.fulfill({
        json: { items: [itemWith({ where: null, receipts: ['Your 88', '118m', '2023'] })], scoredFor: 'Your match', relaxed: null },
      }),
    );
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    await finder.getByRole('textbox').first().fill('a fast mystery');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();

    await expect(page.getByTestId('why-verdict')).toBeVisible();
    await expect(page.getByTestId('result-pills')).toHaveCount(0);
  });
});

test.describe('TEST B — household selection changes the request, scoring and display', () => {
  test('selecting Amy sends watchers[], renders household block; warning variant renders; deselection flags staleness', async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await mock(page, (route, body) => {
      bodies.push(body);
      const solo = !Array.isArray(body.watchers) || (body.watchers as unknown[]).length === 0;
      return route.fulfill({
        json: {
          items: solo
            ? [itemWith({ id: 1, title: 'Solo Pick' })]
            : [
                itemWith({
                  id: 2, title: 'Joint Winner', matchScore: 87,
                  household: {
                    score: 87, call: 'strong',
                    perMember: [{ name: 'You', match: 91 }, { name: 'Amy', match: 84 }],
                    explanation: ['No major objections detected.'],
                  },
                }),
                itemWith({
                  id: 3, title: 'Mismatch Movie', matchScore: 58,
                  household: {
                    score: 58, call: 'warning',
                    perMember: [{ name: 'You', match: 94 }, { name: 'Amy', match: 43 }],
                    explanation: ['Strong mismatch. Better solo recommendation than group recommendation.'],
                  },
                }),
              ],
          scoredFor: solo ? 'Your match' : 'Household match',
          relaxed: null,
        },
      });
    });
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');

    // 1) Solo search first.
    await finder.getByRole('textbox').first().fill('crime thrillers');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();
    await expect(page.getByText('Solo Pick')).toBeVisible();
    expect(bodies[0]!.watchers).toBeUndefined();

    // 2) Add Amy → results flagged stale (selection is part of the query key).
    await finder.getByRole('button', { name: /Amy/ }).click();
    await expect(page.getByTestId('filters-changed')).toBeVisible();

    // 3) Update results → request carries watchers[], household blocks render.
    await page.getByTestId('filters-changed').getByRole('button', { name: 'Update results' }).click();
    await expect(page.getByText('Joint Winner')).toBeVisible();
    const withWatchers = bodies.at(-1)!;
    expect(Array.isArray(withWatchers.watchers)).toBe(true);
    expect((withWatchers.watchers as { name: string }[])[0]!.name).toBe('Amy');

    const blocks = page.getByTestId('household-verdict');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.first()).toContainText('HOUSEHOLD MATCH: 87');
    await expect(blocks.first()).toContainText('You: 91');
    await expect(blocks.first()).toContainText('Amy: 84');
    await expect(blocks.first()).toContainText('No major objections detected.');
    // The mismatch card shows the WARNING variant, not a rosy average.
    await expect(blocks.nth(1)).toContainText('HOUSEHOLD WARNING');
    await expect(blocks.nth(1)).toContainText('Amy: 43');
    await expect(blocks.nth(1)).toContainText('Strong mismatch');
    await page.screenshot({ path: path.join(SHOTS, 'B-household-desktop.png'), fullPage: false });

    // 4) Deselect Amy → staleness banner returns (ranking would change back).
    await finder.getByRole('button', { name: /Amy/ }).click();
    await expect(page.getByTestId('filters-changed')).toBeVisible();
  });
});

test.describe('TEST E — temporary context never contaminates the next request', () => {
  test('a runtime constraint from one ask does not leak into an unrelated ask', async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await mock(page, (route, body) => {
      bodies.push(body);
      return route.fulfill({ json: { items: [itemWith({})], scoredFor: 'Your match', relaxed: null } });
    });
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    const ask = finder.getByRole('textbox').first();

    await ask.fill('a fast mystery movie under 100 minutes');
    await ask.press('Enter');
    await expect(page.getByText('The Night Detective').first()).toBeVisible();
    expect((bodies[0]!.query as Record<string, unknown>).maxRuntime).toBe(100);

    await ask.fill('something funny');
    await ask.press('Enter');
    await expect.poll(() => bodies.length).toBe(2);
    const q2 = bodies[1]!.query as Record<string, unknown>;
    expect(q2.maxRuntime).toBeNull(); // the temporary 100-min cap is gone
    expect(q2.mediaType).toBe('any');
  });
});

test.describe('TEST F — mobile result card', () => {
  test('phone viewport: no overflow, actions usable, Why this Verd1ct opens/closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mock(page, (route) =>
      route.fulfill({
        json: {
          items: [itemWith({
            title: 'An Extraordinarily Long Title That Wraps Across The Card Without Breaking Anything',
            household: {
              score: 84, call: 'strong',
              perMember: [{ name: 'You', match: 88 }, { name: 'Amy', match: 80 }],
              explanation: ['No major objections detected.'],
            },
          })],
          scoredFor: 'Household match', relaxed: null,
        },
      }),
    );
    await page.goto(HARNESS);
    const finder = page.getByTestId('harness-finder');
    await finder.getByRole('textbox').first().fill('family movie night');
    await finder.getByRole('button', { name: /Find titles/ }).first().click();

    const why = page.getByTestId('why-verdict');
    await expect(why).toBeVisible();
    await why.locator('summary').first().click();
    await expect(why).toContainText('Why it matched');

    // No horizontal overflow with the explanation open on a phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontal overflow on phone with card fully expanded').toBeLessThanOrEqual(0);

    // Household block visible and inside the card.
    await expect(page.getByTestId('household-verdict')).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'F-mobile-card-expanded.png'), fullPage: true });

    await why.locator('summary').first().click();
    await expect(why.getByText('Why it matched')).not.toBeVisible();
  });
});
