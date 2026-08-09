import { test, expect, type Page } from '@playwright/test';

/**
 * VOICE DNA MUST BE FINDABLE ON A PHONE.
 *
 * The source-level guard (`src/components/nav/voiceDnaDiscoverable.test.ts`)
 * proves the entry is in the menu ARRAY. This proves it actually renders and is
 * tappable at phone size, in a real browser, against the REAL `<Nav>` — the
 * `/dev/visual-qa` harness mounts production chrome rather than a stub list, so
 * what is asserted here is the same component tree production ships.
 *
 * 390×844 is the reported viewport (iPhone 14/15-class), which is where Voice
 * DNA was found to be missing.
 */

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE });

/**
 * Open the BOTTOM-BAR "More" sheet specifically.
 *
 * A loose `name: /more/i` match is wrong here: the header's "⋯" overflow button
 * also carries "more" in its accessible name, and it is first in the DOM — so
 * the loose locator silently opened the wrong menu and the entry looked missing
 * when it was simply never rendered. Match the exact bottom-bar control.
 */
async function openMoreSheet(page: Page): Promise<void> {
  const more = page.getByRole('button', { name: 'More', exact: true });
  await expect(more).toBeVisible();
  await more.click();
}

test.describe('Voice DNA in the mobile More menu', () => {
  test('appears in More, under Your Watch DNA, and links to the real route', async ({ page }) => {
    await page.goto('/dev/visual-qa');

    // The bottom tab bar carries navigation on a phone; "More" opens the sheet.
    await openMoreSheet(page);

    const voice = page.getByRole('link', { name: /Voice DNA/i }).first();
    await expect(voice, 'Voice DNA is not visible in the mobile More sheet').toBeVisible();
    await expect(voice).toHaveAttribute('href', '/voice-dna');

    // Ordering: directly beneath Your Watch DNA, because that is what it builds.
    const watchDna = page.getByRole('link', { name: /Your Watch DNA/i }).first();
    await expect(watchDna).toBeVisible();
    const dnaBox = await watchDna.boundingBox();
    const voiceBox = await voice.boundingBox();
    expect(dnaBox && voiceBox).toBeTruthy();
    expect(voiceBox!.y).toBeGreaterThan(dnaBox!.y);

    // It must be a real tap target on a phone, not a cramped one.
    expect(voiceBox!.height).toBeGreaterThanOrEqual(32);
  });

  test('the entry is inside the viewport, not clipped off-screen', async ({ page }) => {
    await page.goto('/dev/visual-qa');
    await openMoreSheet(page);

    const voice = page.getByRole('link', { name: /Voice DNA/i }).first();
    await voice.scrollIntoViewIfNeeded();
    const box = await voice.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  });

  test('tapping it navigates away from the menu toward /voice-dna', async ({ page }) => {
    await page.goto('/dev/visual-qa');
    await openMoreSheet(page);
    await page.getByRole('link', { name: /Voice DNA/i }).first().click();

    // Wait for the URL to actually change — asserting immediately after the
    // click reads the pre-navigation URL and passes or fails for the wrong
    // reason. In the harness build Supabase is a dummy host, so the guest
    // session cannot be minted and middleware sends an unauthenticated visitor
    // to sign-in WITH `next` pointing back here. That is the correct degraded
    // behaviour (a 200 redirect, not a 500), and it proves the link is live and
    // aimed at the interview.
    await page.waitForURL(/\/voice-dna|\/login/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/voice-dna|\/login/);
    if (page.url().includes('/login')) {
      expect(page.url()).toContain('next=%2Fvoice-dna');
    }
  });
});
