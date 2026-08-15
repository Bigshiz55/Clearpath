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

test('the mode question is the entrance, above the fold, with two self-describing mode cards', async ({ page }) => {
  // THE CURRENT ENTRANCE CONTRACT (the mode-selection redesign, documented in
  // VerdictRoomEntrance: "The mode question leads… NOTHING is created until a
  // mode is chosen"). The old generic `start-court` create button is gone on
  // purpose — a room only ever exists as a Jury Room, so it can never be
  // mislabeled. This test used to pin that retired button as the primary; the
  // guarantee it exists for — one obvious way in, above the fold, with the
  // choices as real tappable cards — is asserted against the real entrance.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });

  const question = page.getByTestId('verdict-mode-question');
  await expect(question).toBeVisible();
  await expect(question).toContainText('What kind of verdict are you running?');

  // The two modes are real tappable cards, both above the fold at 1440×900 —
  // they ARE the entrance's actions.
  const device = page.getByTestId('open-device');
  const invite = page.getByTestId('open-invite');
  await expect(device).toBeVisible();
  await expect(invite).toBeVisible();
  for (const card of [device, invite]) {
    const box = await card.boundingBox();
    expect(box!.y + box!.height, 'a mode card sits above the fold').toBeLessThan(900);
  }

  // Each card names a distinct mode, says which screens it involves, and SAYS
  // what pressing it starts — no room is created by ambient copy.
  await expect(device).toContainText('Quick Pick');
  await expect(device).toContainText('one phone');
  await expect(device).toContainText('Start Quick Pick');
  await expect(invite).toContainText('Jury Room');
  await expect(invite).toContainText('their own phone');
  await expect(invite).toContainText('Start Jury Room');

  // Hierarchy: the two modes are deliberately DIFFERENT materials (warm
  // "here" vs cool "apart" — the component's stated design), so a visitor
  // can tell the choices apart at a glance.
  // READ THE FILL, NOT `backgroundColor`. Every surface on this screen is a
  // gradient, and a gradient lives in `background-image` — reading only
  // `backgroundColor` compares transparent against transparent.
  const colors = await page.evaluate(() => {
    const read = (testId: string) => {
      const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return s.backgroundImage !== 'none' ? s.backgroundImage : s.backgroundColor;
    };
    return { device: read('open-device'), invite: read('open-invite') };
  });
  expect(colors.device).not.toBeNull();
  expect(colors.invite).not.toBeNull();
  expect(colors.device, 'the two modes must not share one fill').not.toBe(colors.invite);

  // Every card is a comfortable tap target.
  for (const testId of ['open-device', 'open-invite']) {
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
  await expect(page.getByTestId('verdict-mode-question')).toBeVisible();
  await expect(page.getByTestId('open-device')).toBeVisible();
  await expect(page.getByTestId('open-invite')).toBeVisible();
});
