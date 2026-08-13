import { test, expect } from '@playwright/test';

/**
 * THE VERDICT ROOM — one obvious primary action, two clear secondary cards
 * (Stage 1 acceptance, redesigned). Pins the corrected hierarchy: no
 * duplicated description copy, one bright primary CTA above the fold, the
 * two secondary modes as real tappable cards (not text links, not competing
 * in color with the primary), and a centered column at every desktop width.
 */
const ROUTE = '/dev/together';

test('no phrase from the page description appears twice', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const text = await page.locator('main').innerText();
  // Normalize and look for any repeated 5-word shingle — a stronger check
  // than eyeballing the paragraphs that used to overlap.
  const words = text.toLowerCase().replace(/[^\w\s']/g, ' ').split(/\s+/).filter(Boolean);
  const seen = new Map<string, number>();
  const dupes: string[] = [];
  for (let i = 0; i + 5 <= words.length; i++) {
    const shingle = words.slice(i, i + 5).join(' ');
    const prev = seen.get(shingle);
    if (prev != null && prev < i - 4) dupes.push(shingle);
    if (prev == null) seen.set(shingle, i);
  }
  expect(dupes, `repeated copy: ${[...new Set(dupes)].join(' | ')}`).toEqual([]);
});

test('one obvious primary action, above the fold, with two secondary cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });

  const start = page.getByTestId('start-court');
  await expect(start).toBeVisible();
  await expect(start).toHaveText('Start a Verdict Room');
  // Above the fold at 1440×900.
  const box = await start.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(900);

  // The two secondary options are real tappable cards, not underlined text.
  const device = page.getByTestId('open-device');
  const invite = page.getByTestId('open-invite');
  await expect(device).toBeVisible();
  await expect(invite).toBeVisible();
  // The card LABELS are the contract here — the supporting line was rewritten
  // by the entrance redesign ("Choose together on this phone" → "We're all
  // here…"), and this assertion was still pinning the retired wording. What
  // this test is actually for is that each card names a distinct mode and says
  // which screens it involves, so that is what it checks.
  await expect(device).toContainText('Quick Pick');
  await expect(device).toContainText('one phone');
  await expect(invite).toContainText('Invite the Jury');
  await expect(invite).toContainText('their own phone');

  // Hierarchy: the primary button is the brightest fill on the page; the
  // secondary cards use a distinctly different (navy, not brand-blue) fill so
  // they never compete with it for attention.
  // READ THE FILL, NOT `backgroundColor`. Every surface on this screen is a
  // gradient now, and a gradient lives in `background-image` — so all three
  // controls reported `rgba(0, 0, 0, 0)` and the comparison below was passing
  // transparent against transparent, which is no check at all.
  const colors = await page.evaluate(() => {
    const read = (testId: string) => {
      const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return s.backgroundImage !== 'none' ? s.backgroundImage : s.backgroundColor;
    };
    return { primary: read('start-court'), device: read('open-device'), invite: read('open-invite') };
  });
  expect(colors.primary).not.toBeNull();
  expect(colors.device).not.toBeNull();
  expect(colors.invite).not.toBeNull();
  expect(colors.device, 'secondary card must not reuse the primary fill').not.toBe(colors.primary);
  expect(colors.invite, 'secondary card must not reuse the primary fill').not.toBe(colors.primary);

  // Every card is a comfortable tap target.
  for (const testId of ['start-court', 'open-device', 'open-invite']) {
    const b = await page.getByTestId(testId).boundingBox();
    expect(b!.height, `${testId} tap target`).toBeGreaterThanOrEqual(44);
  }

  // Quick Pick discloses the on-device planner in place. It opens BELOW the
  // stage now rather than inside the `together-secondary` grid, so this looks
  // for the disclosed panel on the page instead of inside that container —
  // the behaviour under test is the disclosure, not where the node hangs.
  await device.click();
  await expect(page.getByRole('region', { name: 'Quick Pick' })).toContainText(
    'stored just on this phone',
  );
});

for (const w of [1440, 1920, 2560]) {
  test(`the content column is horizontally centered @ ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    const box = await page.locator('main > div').first().boundingBox();
    const leftGap = box!.x;
    const rightGap = w - (box!.x + box!.width);
    expect(Math.abs(leftGap - rightGap), `left ${leftGap} vs right ${rightGap}`).toBeLessThanOrEqual(24);
  });
}

test('no custom Back/Home/Forward row anywhere on the page', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Go back to the previous page')).toHaveCount(0);
  await expect(page.getByLabel('Go to the home page')).toHaveCount(0);
});

test('fits a phone with no sideways scroll @ 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('start-court')).toBeVisible();
  await expect(page.getByTestId('open-device')).toBeVisible();
  await expect(page.getByTestId('open-invite')).toBeVisible();
});
