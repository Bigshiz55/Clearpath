import { test, expect } from '@playwright/test';

/**
 * The "State Your Case" quick-start chips (rendered by BuildCaseBox in the harness):
 * tapping the new "3 Prime thrillers" chip populates the prompt with the exact
 * personalized request, and the chip stays balanced in the two-column grid at 390px
 * (identical size to its siblings, label may wrap without changing row height).
 */
test('the "3 Prime thrillers" chip fills the prompt with the exact request @ 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/dev/responsive', { waitUntil: 'networkidle' });

  const chip = page.getByRole('button', { name: /3 Prime thrillers/i });
  await expect(chip).toBeVisible();

  // Identical styling to the sibling chips (same classes → same size/padding/type).
  const siblings = page.locator('button', { hasText: /tonight|Netflix|Prime thrillers|scary|Family/ });
  const classes = await siblings.evaluateAll((els) => els.map((e) => (e as HTMLElement).className));
  const chipClass = await chip.getAttribute('class');
  for (const c of classes) expect(c).toBe(chipClass);

  await chip.click();
  const box = page.locator('textarea[aria-label="Describe what you like to watch"]');
  await expect(box).toHaveValue('Recommend 3 thriller movies currently available on Prime Video that match my taste.');

  // No horizontal overflow at 390px.
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw + 1);
});
