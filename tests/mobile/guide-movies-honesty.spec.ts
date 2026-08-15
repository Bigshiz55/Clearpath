import { test, expect, type Page } from '@playwright/test';

/**
 * THE MOVIES ZERO, RENDERED HONESTLY — browser-level proof on the real
 * ChannelGuide DOM (via /dev/channel-guide, MOBILE_HARNESS-gated).
 *
 * The production incident: the Movies chip over a TVmaze-fed guide said
 * "No listing in this window is classified as a movie… That's the schedule,
 * not missing data" — a certainty the source cannot back. TVmaze is an
 * episode database in which Hallmark, LMN and TCM are absent entirely
 * (measured live: docs/tv-coverage/SOURCE_AND_CHANNEL_REPORT.md), so a
 * movie-free window proves nothing about the schedule. These tests pin the
 * rendered distinction:
 *
 *   • WITHOUT a licensed grid (the production reality): the zero names OUR
 *     coverage as the limit and never claims the schedule is empty;
 *   • WITH one (`?coverage=1`): "that's the schedule" is allowed again;
 *   • in both regimes: ZERO unrelated cards — the guide never pads a movies
 *     question with non-movie channels, and the structured diagnostics ride
 *     the DOM for observability.
 */

const openNoMovies = async (page: Page, coverage: boolean) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/dev/channel-guide?grid=noMovies${coverage ? '&coverage=1' : ''}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('channel-guide')).toBeVisible();
  await page.getByTestId('guide-media-movie').click();
};

test('without a licensed grid, the Movies zero blames coverage — never the schedule', async ({ page }) => {
  await openNoMovies(page, false);
  const state = page.getByTestId('guide-movies-coverage-unprovable');
  await expect(state).toBeVisible();
  await expect(state).toContainText(/limit of our coverage/i);
  await expect(state).toContainText(/not proof of an empty schedule/i);
  // The forbidden certainty must not render anywhere on the screen.
  await expect(page.getByText(/That’s the schedule, not missing data/)).toHaveCount(0);
});

test('with a licensed grid supplying, the same window IS the schedule and may say so', async ({ page }) => {
  await openNoMovies(page, true);
  const state = page.getByTestId('guide-movies-true-empty');
  await expect(state).toBeVisible();
  await expect(state).toContainText(/That’s the schedule, not missing data/);
});

test('the Movies zero shows ZERO unrelated cards, in both coverage regimes', async ({ page }) => {
  for (const coverage of [false, true]) {
    await openNoMovies(page, coverage);
    // No channel rows render under Movies — Bravo/CNN/ESPN never pad the zero.
    await expect(page.getByTestId('guide-channel')).toHaveCount(0);
    await expect(page.getByTestId('channel-guide')).not.toContainText('Below Deck');
    await expect(page.getByTestId('channel-guide')).not.toContainText('Monday Night Football');
  }
});

test('the structured diagnostics ride the empty state for observability', async ({ page }) => {
  await openNoMovies(page, false);
  const box = page.getByTestId('guide-no-match');
  await expect(box).toHaveAttribute('data-coverage', 'episode-db-only');
  await expect(box).toHaveAttribute('data-listings', '3');
  await expect(box).toHaveAttribute('data-movie-listings', '0');
  await expect(box).toHaveAttribute('data-movies-visible', '0');
  await openNoMovies(page, true);
  await expect(page.getByTestId('guide-no-match')).toHaveAttribute('data-coverage', 'licensed-grid');
});

test('the chip is never disabled and the zero never auto-clears the filter', async ({ page }) => {
  await openNoMovies(page, false);
  await expect(page.getByTestId('guide-media-movie')).toBeEnabled();
  await expect(page.getByTestId('guide-media-movie')).toHaveAttribute('aria-pressed', 'true');
  // The user's own escape hatch is present; nothing flipped for them.
  await expect(page.getByTestId('guide-clear')).toBeVisible();
  await page.getByTestId('guide-clear').click();
  await expect(page.getByTestId('guide-channel')).toHaveCount(3);
});
