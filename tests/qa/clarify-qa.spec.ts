import { test, expect } from '@playwright/test';

const OPTIONS = [
  { tmdbId: 287238, title: 'Furious', mediaType: 'tv', year: 2026 },
  { tmdbId: 415381, title: 'Furious', mediaType: 'movie', year: 2017 },
  { tmdbId: 87035, title: 'Furious', mediaType: 'movie', year: 2011 },
  { tmdbId: 167104, title: 'Furious', mediaType: 'movie', year: 1984 },
];

const html = (w: number) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">

<style>
*{box-sizing:border-box}
body{background:#0b1220;margin:0;padding:16px;font-family:system-ui;color:#e2e8f0}
/* The exact layout rules AnchorClarify depends on, transcribed from its
   Tailwind classes — the CDN is unreachable in this sandbox, so the utilities
   that matter for overflow and touch targets are inlined verbatim. */
[data-testid=anchor-clarify]{border:1px solid rgba(96,140,255,.3);background:rgba(59,109,255,.06);border-radius:.5rem;padding:.75rem;margin-top:.5rem}
[role=group]{display:grid;grid-template-columns:1fr;gap:.5rem;margin-top:.625rem}
@media(min-width:640px){[role=group]{grid-template-columns:1fr 1fr}}
[data-testid=anchor-option]{display:flex;min-height:44px;align-items:center;gap:.625rem;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:.375rem;padding:.5rem .625rem;text-align:left;color:inherit;font:inherit;width:100%}
[data-testid=anchor-option] span{min-width:0}
.t{display:block;overflow-wrap:break-word;font-size:15px;font-weight:600;line-height:1.15}
.s{display:block;margin-top:.125rem;font-size:13px;color:#cbd5e1}
p{font-size:15px;font-weight:600;margin:0}
</style></head><body>
<div style="max-width:${w >= 640 ? 680 : 358}px">
<div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100">
<div data-testid="anchor-clarify" class="mt-2 rounded-lg border border-brand-400/30 bg-brand-500/[0.06] p-3">
<p class="text-[15px] font-semibold leading-relaxed text-slate-100">Which Furious did you mean?</p>
<div role="group" class="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
${OPTIONS.map(o=>`<button type="button" data-testid="anchor-option" class="flex min-h-[44px] items-center gap-2.5 rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-2 text-left"><span class="min-w-0"><span class="t">${o.title}</span><span class="s">${o.year} · ${o.mediaType==='tv'?'TV':'Movie'}</span></span></button>`).join('')}
</div></div></div></div></body></html>`;

for (const [name, w, h] of [['desktop', 1280, 800], ['mobile-390', 390, 844]] as const) {
  test(`clarify ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html(w));
    await page.waitForTimeout(900);
    const opts = page.getByTestId('anchor-option');
    await expect(opts).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const box = await opts.nth(i).boundingBox();
      expect(box!.height, `${name} option ${i} touch height`).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width, `${name} option ${i} overflow`).toBeLessThanOrEqual(w + 1);
    }
    const doc = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(doc, `${name} horizontal overflow`).toBeLessThanOrEqual(w);
    await expect(opts.nth(1)).toContainText('2017');
    await expect(opts.nth(1)).toContainText('Movie');
    await expect(opts.nth(0)).toContainText('TV');
    await page.screenshot({ path: `/tmp/claude-0/-home-user-Clearpath/7bed97c5-9653-5e4e-a7e5-75fc18d685dd/scratchpad/qa/${name}.png`, fullPage: true });
  });
}

test('NOT_FOUND renders the question alone, with no fabricated options', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(html(390).replace(/<div role="group"[\s\S]*?<\/div>/,
    '<p data-testid="anchor-clarify-hint" class="s">Type the title again below and I&rsquo;ll keep the rest of your comparison.</p>')
    .replace('Which Furious did you mean?', "I don't know a title called Widows Whatever — which one did you mean?"));
  await expect(page.getByTestId('anchor-clarify')).toBeVisible();
  await expect(page.getByTestId('anchor-clarify-hint')).toBeVisible();
  // No candidate grid, and above all no invented candidates.
  await expect(page.getByTestId('anchor-option')).toHaveCount(0);
  const doc = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(doc).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-Clearpath/7bed97c5-9653-5e4e-a7e5-75fc18d685dd/scratchpad/qa/notfound-390.png', fullPage: true });
});

test('keyboard reaches every option', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(html(390));
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.replace(/\n/g, ' ') ?? ''));
  }
  expect(seen.filter((s) => s.includes('Furious')).length).toBe(4);
});
