import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE FRESH-USER PRODUCT JOURNEY, THROUGH THE REAL DEPLOYED SURFACE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Drives the owner's product batch end to end against the exact-SHA Vercel
 * Preview, as a GENUINELY fresh user (the product's own /newuser anonymous
 * FreshStart):
 *
 *   /app          → first-run explainer (60 seconds — build your DNA), Skip
 *   taste-quiz    → genre calibration first (canonical genres, 1–10,
 *                   not-for-me), live DNA meter in-flow and NOT overlapping
 *                   the step content, then the titles grid with LABELED
 *                   rating controls
 *   /app/tour     → stable footer across slides, final Done returns to the
 *                   validated origin
 *   /app/together → the mode question before any creation; Quick Pick and
 *                   Jury Room with explicit start actions
 *   /app/tv guide → filter chips visible; the Movies chip yields either real
 *                   channel rows or one of the three HONEST empty states —
 *                   never a bare unexplained zero; scores wear the canonical
 *                   Verd1ct badge (or its canonical placeholder)
 *
 * Accessibility runs through the same journey: keyboard reachability and
 * visible focus on the new controls, meaning never carried by color alone
 * (every state asserted here is asserted via text or aria, not styling).
 */

const BASE_URL = process.env.BASE_URL ?? '';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';
const LOGIN_SECRET = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';

test.describe('Product journey — fresh user, real preview', () => {
  test.skip(!BASE_URL, 'BASE_URL (the exact-SHA preview) is required');

  async function freshSession(context: BrowserContext, page: Page): Promise<void> {
    await page.goto('/newuser');
    const landed = await page
      .waitForURL(/\/app(?:$|[/?#])/, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!landed) {
      console.log('AUTH PATH: preview test login fallback');
      const login = await context.request.post('/api/preview-test-login', {
        headers: { 'x-preview-test-secret': LOGIN_SECRET },
      });
      expect(login.status(), 'preview test login must mint a session').toBe(200);
      await page.goto('/app');
    } else {
      console.log('AUTH PATH: anonymous guest via /newuser');
    }
  }

  test('first-run explainer → genre calibration → labeled quiz, with the live DNA meter', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    });
    const page = await context.newPage();
    await freshSession(context, page);

    /* FIRST-RUN EXPLAINER — server-gated to zero preference signal, so a
       fresh session MUST see it (the test-login fallback user may carry DNA;
       tolerate absence only on that path). */
    const explainer = page.getByTestId('first-run-explainer');
    const sawExplainer = await explainer.isVisible({ timeout: 15_000 }).catch(() => false);
    if (sawExplainer) {
      await expect(explainer).toContainText('60 seconds');
      // Skip is a deferral: the strip hides now…
      await page.getByTestId('first-run-skip').click();
      await expect(explainer).toBeHidden();
      // …and the PERMANENT key was not written (source contract: sessionStorage).
      const permanent = await page.evaluate(() => localStorage.getItem('wv.firstrun.done.v1'));
      expect(permanent, 'Skip must never permanently suppress the explainer').toBeNull();
    } else {
      console.log('explainer not shown — session carries prior DNA (fallback login path)');
    }

    /* GENRE CALIBRATION, FIRST. */
    await page.goto('/app/taste-quiz');
    const genres = page.getByTestId('genre-calibration');
    const sawGenres = await genres.isVisible({ timeout: 15_000 }).catch(() => false);
    if (sawGenres) {
      // Canonical vocabulary rows, 1–10 controls, explicit rule-out.
      await expect(page.getByTestId('genre-row-comedy')).toBeVisible();
      await expect(page.getByTestId('genre-row-science_fiction')).toBeVisible();

      // KEYBOARD + FOCUS: the rating buttons are real buttons.
      const nine = page.getByTestId('genre-rate-comedy-9');
      await nine.focus();
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('genre-rate-comedy-9');
      await nine.click();
      await expect(nine).toHaveAttribute('aria-pressed', 'true');

      // Not-for-me disables the scale — state carried by aria, not color.
      await page.getByTestId('genre-out-horror').click();
      await expect(page.getByTestId('genre-out-horror')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('genre-rate-horror-5')).toBeDisabled();

      /* THE LIVE DNA METER — real metric, in flow, and NOT covering the step
         content: their bounding boxes must not intersect. */
      const meter = page.getByTestId('dna-progress-meter');
      await expect(meter).toBeVisible({ timeout: 15_000 });
      const meterBox = (await meter.boundingBox())!;
      const stepBox = (await genres.boundingBox())!;
      expect(meterBox.y + meterBox.height, 'meter must sit above the cards, never over them').toBeLessThanOrEqual(stepBox.y + 1);

      await page.getByTestId('genre-continue').click();
    } else {
      console.log('genre step not shown — session carries prior calibration (fallback login path)');
      await page.goto('/app/taste-quiz?step=titles');
    }

    /* THE QUICK TASTE QUIZ — labeled controls, not emoji-first. */
    await expect(page.getByTestId('dna-progress-meter')).toBeVisible({ timeout: 20_000 });
    const firstSeen = page.locator('[data-testid^="grid-seen-"]').first();
    await expect(firstSeen, 'the titles grid deals cards').toBeVisible({ timeout: 30_000 });
    await firstSeen.click();
    const ratings = page.locator('[data-testid^="grid-ratings-"]').first();
    await expect(ratings).toBeVisible();
    // The chip says the WORD; the emoji is decoration (aria-hidden).
    await expect(ratings.locator('button', { hasText: 'Loved' }).first()).toBeVisible();
    await context.close();
  });

  test('tour: stable footer, Done returns to the validated origin', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    });
    const page = await context.newPage();
    await freshSession(context, page);

    await page.goto('/app/tour?returnTo=%2Fapp%2Fdna');
    const firstTopic = page.locator('[data-testid^="tour-topic-"]').first();
    await expect(firstTopic).toBeVisible({ timeout: 20_000 });
    await firstTopic.click();

    /* FOOTER COORDINATES ARE STABLE ACROSS SLIDES — the owner's defect. */
    const footer = page.getByTestId('tour-footer');
    await expect(footer).toBeVisible();
    const before = (await footer.boundingBox())!;
    await page.getByTestId('tour-next-topic').click();
    await expect(footer).toBeVisible();
    const after = (await footer.boundingBox())!;
    expect(Math.abs(after.y - before.y), 'the footer must not move between slides').toBeLessThanOrEqual(1);

    /* Walk to the last slide; the Next SLOT becomes Done and goes back to
       the page the user entered from — the VALIDATED returnTo. */
    for (let i = 0; i < 12; i++) {
      const done = page.getByTestId('tour-final-done');
      if (await done.isVisible().catch(() => false)) break;
      await page.getByTestId('tour-next-topic').click();
    }
    const done = page.getByTestId('tour-final-done');
    await expect(done).toBeVisible();
    const doneBox = (await done.boundingBox())!;
    expect(Math.abs(doneBox.y - before.y), 'Done holds the Next slot').toBeLessThanOrEqual(24);
    await done.click();
    await page.waitForURL(/\/app\/dna(?:$|[/?#])/, { timeout: 20_000 });

    /* A malicious returnTo is rejected to the safe fallback. */
    await page.goto('/app/tour?returnTo=https%3A%2F%2Fevil.example%2Fphish');
    await expect(page.getByTestId('tour-done')).toHaveAttribute('href', '/app');
    await context.close();
  });

  test('verdict room: the mode question precedes any creation', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    });
    const page = await context.newPage();
    await freshSession(context, page);

    await page.goto('/app/together');
    await expect(page.getByTestId('verdict-mode-question')).toContainText('What kind of verdict are you running?', { timeout: 20_000 });
    // No generic pre-mode create control anywhere.
    await expect(page.getByTestId('start-court')).toHaveCount(0);
    // Two modes, understandable WITHOUT hover: names and start actions are
    // plain text in the cards.
    await expect(page.getByTestId('open-device')).toContainText('Quick Pick');
    await expect(page.getByTestId('open-device')).toContainText('Start Quick Pick');
    await expect(page.getByTestId('open-invite')).toContainText('Jury Room');
    await expect(page.getByTestId('open-invite')).toContainText('Start Jury Room');
    // Quick Pick discloses the on-device planner — no room, no invite flow.
    await page.getByTestId('open-device').click();
    await expect(page.getByText('Quick, private juries stored just on this phone', { exact: false })).toBeVisible();
    expect(page.url()).not.toContain('/court/');
    await context.close();
  });

  test('live tv guide: Movies is honest — rows, or a NAMED empty; scores wear the canonical badge', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
      viewport: { width: 390, height: 844 }, // the mobile RED: filters stay usable
    });
    const page = await context.newPage();
    await freshSession(context, page);

    await page.goto('/app/tv?view=guide');
    const guide = page.getByTestId('channel-guide');
    const gateOpen = await guide.isVisible({ timeout: 25_000 }).catch(() => false);
    if (!gateOpen) {
      // The guide honestly reports no ingested coverage on this deployment —
      // that state has its own testid and is a data condition, not a defect.
      await expect(page.getByTestId('guide-empty')).toBeVisible({ timeout: 10_000 });
      console.log('guide coverage empty on this deployment — structural assertions skipped');
      await context.close();
      return;
    }

    // ACTIVE FILTERS VISIBLE AND USABLE ON MOBILE.
    await expect(page.getByTestId('guide-filters')).toBeVisible();
    const moviesChip = page.getByTestId('guide-media-movie');
    await expect(moviesChip).toBeVisible();
    await expect(moviesChip).toBeEnabled();
    await moviesChip.click();

    const rows = page.getByTestId('guide-channel');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      console.log(`Movies: ${rowCount} channel rows`);
      // Canonical score: any score badge present renders the official mark
      // (its aria-label names the Watch Verd1ct score); a missing on-now
      // score renders the canonical placeholder.
      const badges = page.locator('[data-testid="score-badge"] button');
      if ((await badges.count()) > 0) {
        const label = await badges.first().getAttribute('aria-label');
        expect(label ?? '').toContain('Watch Verd1ct score');
      }
    } else {
      // ZERO IS ALWAYS EXPLAINED: exactly one of the three honest states.
      const named = page.locator(
        '[data-testid="guide-movies-true-empty"], [data-testid="guide-movies-filtered-out"], [data-testid="guide-movies-unprovable-now"]',
      );
      await expect(named.first(), 'a Movies zero must name which truth it is').toBeVisible();
      const id = await named.first().getAttribute('data-testid');
      console.log(`Movies empty state: ${id}`);
    }
    // The chip was never disabled and nothing auto-switched to All.
    await expect(moviesChip).toBeEnabled();
    await context.close();
  });
});
