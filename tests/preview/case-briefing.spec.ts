import { test, expect } from '@playwright/test';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * RELEASE-GATE CANARY · TODAY'S CASE BRIEFING — on the real preview.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The briefing has exactly TWO honest faces, and this spec accepts either
 * while rejecting every dishonest middle state:
 *
 *   REAL EDITION      imported coverage is live for today → masthead, the
 *                     channel rail, and at least one data-backed section —
 *                     and any Lead Case wears a real engine score.
 *   HONEST ABSENCE    no proven schedule for today → the exact owner-facing
 *                     sentence, and NOTHING that looks like listings.
 *
 * What it must never do: render a briefing with no coverage behind it, show
 * a lead without a score, or leave the page blank with neither state.
 */

const BASE_URL = process.env.BASE_URL ?? '';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';
const LOGIN_SECRET = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';

async function authedPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  });
  const page = await context.newPage();
  await page.goto('/newuser');
  const landed = await page.waitForURL(/\/app(?:$|[/?#])/, { timeout: 20_000 }).then(() => true).catch(() => false);
  if (!landed) {
    const login = await context.request.post('/api/preview-test-login', {
      headers: { 'x-preview-test-secret': LOGIN_SECRET },
    });
    expect(login.status(), 'preview test login must mint a session').toBe(200);
  }
  return { context, page };
}

test.describe('LIVE TV BRIEFING canary', () => {
  test.skip(!BASE_URL, 'BASE_URL (the exact-SHA preview) is required');

  test('the briefing shows a real stored-schedule edition or the exact honest absence — never a fake middle', async ({ browser }) => {
    const { context, page } = await authedPage(browser);
    await page.goto('/app/tv/briefing');
    await expect(page.getByTestId('briefing-masthead')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('briefing-masthead')).toContainText('Today’s Case Briefing');

    const empty = page.getByTestId('briefing-empty');
    const rail = page.getByTestId('briefing-rail');
    await expect(empty.or(rail).first()).toBeVisible({ timeout: 30_000 });

    if (await empty.count()) {
      // HONEST ABSENCE — the exact sentence, and no listings-like content.
      const reason = await empty.getAttribute('data-reason');
      expect(['no-coverage', 'no-rows']).toContain(reason);
      if (reason === 'no-coverage') {
        await expect(empty).toContainText(
          'Today’s briefing isn’t available yet because the current TV schedule hasn’t been loaded.',
        );
      }
      await expect(page.getByTestId('briefing-item')).toHaveCount(0);
      await expect(page.getByTestId('briefing-rail')).toHaveCount(0);
      console.log(`BRIEFING STATE: honest absence (${reason})`);
    } else {
      // REAL EDITION — stored rows behind every pixel.
      await expect(page.getByTestId('briefing-rail-all')).toBeVisible();
      expect(await page.getByTestId('briefing-item').count()).toBeGreaterThan(0);
      // A Lead Case, when present, wears a real engine score — by construction
      // it exists only for scored rows; a scoreless lead is a fabrication.
      if (await page.getByTestId('briefing-lead').count()) {
        await expect(page.getByTestId('briefing-lead').getByTestId('briefing-score')).toBeVisible();
      }
      console.log('BRIEFING STATE: real stored-schedule edition');
    }
    await context.close();
  });

  test('the briefing is first-class: reachable from the Live TV views nav', async ({ browser }) => {
    const { context, page } = await authedPage(browser);
    await page.goto('/app/tv');
    const nav = page.getByTestId('tv-views');
    await expect(nav).toBeVisible({ timeout: 30_000 });
    const link = nav.getByRole('link', { name: 'Today’s Case Briefing' });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(/\/app\/tv\/briefing/, { timeout: 30_000 });
    await expect(page.getByTestId('briefing-masthead')).toBeVisible({ timeout: 30_000 });
    await context.close();
  });
});
