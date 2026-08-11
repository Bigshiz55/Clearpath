import { test, expect } from '@playwright/test';
import type { TonightEvent } from '@/lib/tonight/analytics';
import { answerOne, currentAct, openFresh, playToReveal } from './drive';

/**
 * WHAT HAPPENS WHEN THE SESSION DOES NOT GO CLEANLY.
 *
 * A refresh, a rejected shortlist, a dead image, a player who has seen nothing.
 * Each of these has a right answer that is not "start again", and each is a
 * place where a taste model quietly corrupts itself if nobody checks.
 */

test.describe('interruption', () => {
  test('a refresh costs no answers and does not double-count them', async ({ page }) => {
    await openFresh(page);
    for (let i = 0; i < 3; i++) await answerOne(page, { index: i });

    const before = await page.getByTestId('tonight-progress').getAttribute('data-interactions');
    expect(Number(before)).toBeGreaterThan(0);

    await page.reload();
    await page.waitForSelector('[data-testid="tonight-progress"]', { timeout: 15_000 });
    const after = await page.getByTestId('tonight-progress').getAttribute('data-interactions');

    // Not "roughly the same": an answer lost is work the player has to redo,
    // and an answer counted twice is evidence they never gave.
    expect(after, 'a refresh changed the answer count').toBe(before);
    // And the session is still playable rather than stranded on a dead screen.
    expect(await currentAct(page)).not.toBeNull();
  });

  test('a resumed session still finishes', async ({ page }) => {
    await openFresh(page);
    for (let i = 0; i < 3; i++) await answerOne(page, { index: i });
    await page.reload();
    await page.waitForSelector('[data-testid="tonight-progress"]', { timeout: 15_000 });

    await playToReveal(page);
    await expect(page.getByTestId('tonight-reveal')).toBeVisible();
  });
});

test.describe('rejection', () => {
  test('"None of these" recovers instead of freezing', async ({ page }) => {
    // REGRESSION. Rejecting a shortlist and then picking from the next one hit
    // the same idempotency key, so the pick was discarded and the session was
    // pinned to the Final Cut forever — every tap doing nothing, no way out.
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await openFresh(page);
    const acts = await playToReveal(page, { rejectFirstFinal: true, maxMoves: 50 });

    expect(acts, 'the run never reached a Final Cut to reject').toContain('finalcut');
    await expect(page.getByTestId('tonight-reveal')).toBeVisible();
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('the Reveal names the film, not its id', async ({ page }) => {
    // REGRESSION. Choosing *Dark* reported "dark" as the result of the session.
    await openFresh(page);
    await playToReveal(page);
    await expect(page.getByTestId('tonight-reveal')).toBeVisible();

    const choice = page.getByTestId('tonight-choice');
    if (await choice.isVisible().catch(() => false)) {
      const text = (await choice.textContent())?.trim() ?? '';
      expect(text.length, 'the chosen title is blank').toBeGreaterThan(0);
      // A slug is lower-case and hyphenated; a title is neither.
      expect(text, `"${text}" looks like an internal id`).not.toMatch(/^[a-z0-9-]+$/);
      expect(text, 'the chosen film has no year').toMatch(/\(\d{4}\)/);
    }
  });
});

test.describe('honesty', () => {
  test('a session of "never heard of it" claims nothing was learned', async ({ page }) => {
    // Ignorance is not dislike. A product that inflates a completeness number
    // after a player recognised nothing is lying to them about its own state.
    await openFresh(page);
    await playToReveal(page, { allUnseen: true, maxMoves: 50 });
    await expect(page.getByTestId('tonight-reveal')).toBeVisible();

    const reveal = page.getByTestId('tonight-reveal');
    const known = Number(await reveal.getAttribute('data-known'));
    const opening = Number(await reveal.getAttribute('data-opening'));
    const evidenced = Number(await reveal.getAttribute('data-evidenced'));

    // The Final Cut pick is a real preference and may teach something; what
    // must never happen is the reel manufacturing evidence out of ignorance.
    expect(evidenced, 'unseen answers produced permanent evidence').toBeLessThanOrEqual(1);
    expect(known, 'completeness rose without evidence').toBeGreaterThanOrEqual(opening);
    if (evidenced === 0) {
      await expect(reveal).toHaveText(/nothing learned/i);
      expect(known, 'the number moved having learned nothing').toBe(opening);
    }
  });

  test('a title with dead artwork is still fully answerable', async ({ page }) => {
    // Artwork must never be able to create a dead zone. Every image request is
    // failed outright, which is strictly worse than the real failure modes.
    await page.route('**/*.{png,jpg,jpeg,webp,avif,svg}', (route) => route.abort());

    await openFresh(page);
    await playToReveal(page, { maxMoves: 40 });
    await expect(page.getByTestId('tonight-reveal')).toBeVisible();
  });

  test('the stimulus always carries what the film is', async ({ page }) => {
    // A poster alone is a memory test. The hook is what makes an unfamiliar
    // title answerable, so it is not allowed to be missing or empty.
    await openFresh(page);

    await playToReveal(page, {
      onMove: async () => {
        if ((await currentAct(page)) !== 'stimulus') return;
        const hook = page.getByTestId('tonight-hook');
        await expect(hook).toBeVisible();
        expect(((await hook.textContent()) ?? '').trim().length).toBeGreaterThan(3);
      },
    });
  });
});

test.describe('analytics', () => {
  test('a real session emits a complete, non-duplicated event stream', async ({ page }) => {
    // Unit tests prove the event builders are right; this proves the component
    // actually calls them, which is the part that rots silently. The dev
    // harness installs a sink into window.__tonightEvents.
    await openFresh(page);
    await playToReveal(page);
    await expect(page.getByTestId('tonight-reveal')).toBeVisible();

    const events = await page.evaluate(() => window.__tonightEvents ?? []);

    expect(events.length, 'no events were emitted at all').toBeGreaterThan(3);
    expect(events[0]?.name).toBe('tonight_started');
    expect(events.at(-1)?.name).toBe('tonight_completed');
    expect(new Set(events.map((e) => e.sessionId)).size, 'the stream spans sessions').toBe(1);

    // One id per answered interaction: a re-render or a StrictMode double-invoke
    // must not look like the player answered twice.
    const answered = events.filter(
      (e) => e.name === 'tonight_move_answered' || e.name === 'tonight_shortlist_rejected',
    );
    const keys = answered.map((e) => `${e.move}:${e.subject}`);
    expect(new Set(keys).size, `duplicate answers reported: ${keys.join(', ')}`).toBe(keys.length);

    // The step counter must advance monotonically, or drop-off cannot be read.
    const steps = answered.map((e) => e.step);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);

    // And the completeness the stream reports must match what the Reveal shows.
    const shown = await page.getByTestId('tonight-reveal').getAttribute('data-known');
    expect(events.at(-1)?.known).toBe(Number(shown));
  });

  test('leaving mid-session is reported, not lost', async ({ page }) => {
    // A session abandoned in the third act is the most interesting thing that
    // can happen and the easiest to never find out about.
    await openFresh(page);
    for (let i = 0; i < 3; i++) await answerOne(page, { index: i });

    const before = await page.evaluate(() => (window.__tonightEvents ?? []).length);
    expect(before).toBeGreaterThan(0);

    // `pagehide` is what fires on mobile Safari, where `beforeunload` does not.
    const left = await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      const events = window.__tonightEvents ?? [];
      return events.filter((e) => e.name === 'tonight_left');
    });
    expect(left.length, 'leaving produced no event').toBe(1);
    expect(left[0]?.step, 'the exit was reported at the wrong point').toBeGreaterThan(0);
  });
});
