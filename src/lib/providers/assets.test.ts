import { describe, it, expect } from 'vitest';
import { PROVIDER_ASSETS, assetForProvider, providerAssetKey } from './assets';
import { resolveProviderBrand, officialProviderName } from './brand';
import { STREAMING_SERVICES } from '@/lib/services';

/**
 * The asset table is the thing that lets a surface which knows only "Netflix"
 * render Netflix's mark. These tests pin the two properties that make that
 * safe: it resolves without the caller holding anything, and it never hands a
 * brand's mark to a different product.
 */
describe('verified provider assets', () => {
  it('resolves a mark from a NAME ALONE, with no caller-supplied logo', () => {
    for (const name of ['Netflix', 'Prime Video', 'Disney+', 'Max', 'Hulu', 'Paramount+', 'Peacock', 'Apple TV+']) {
      const b = resolveProviderBrand({ name });
      expect(b.logoPath, name).toBeTruthy();
      expect(b.textOnly, name).toBe(false);
    }
  });

  it('resolves from TMDB’s spelling too, because the name is canonicalized first', () => {
    expect(resolveProviderBrand({ name: 'Paramount Plus' }).logoPath).toBe(assetForProvider('Paramount+'));
    expect(resolveProviderBrand({ name: 'Amazon Prime Video' }).logoPath).toBe(assetForProvider('Prime Video'));
  });

  it('resolves by canonical provider id even when the name is unfamiliar', () => {
    expect(assetForProvider('Netflix basic with Ads', 8)).toBe(assetForProvider('Netflix'));
  });

  it('gives a PLAN of a brand the brand’s mark', () => {
    // "Peacock Premium" is Peacock. Same company, same logo.
    expect(assetForProvider('Peacock Premium')).toBe(assetForProvider('Peacock'));
    expect(assetForProvider('Paramount+ Premium')).toBe(assetForProvider('Paramount+'));
  });

  it('NEVER gives a distribution route the base service’s mark', () => {
    // Bought through Amazon, it is a different product with a different app
    // and a different cancellation. It must not wear Paramount+'s logo.
    expect(assetForProvider('Paramount+ Amazon Channel')).toBeNull();
    expect(assetForProvider('Starz Apple TV Channel')).toBeNull();
    expect(providerAssetKey('Paramount+ Amazon Channel')).not.toBe(providerAssetKey('Paramount+'));
  });

  it('returns null — never a guess — for a brand we hold no asset for', () => {
    expect(assetForProvider('Some Regional Service')).toBeNull();
    expect(resolveProviderBrand({ name: 'Some Regional Service' }).textOnly).toBe(true);
  });

  it('a caller’s own verified logo always wins over the table', () => {
    const b = resolveProviderBrand({ name: 'Netflix', logoPath: '/from-this-exact-row.jpg' });
    expect(b.logoPath).toBe('/from-this-exact-row.jpg');
  });

  it('every asset path is a plausible TMDB logo_path, and unique per brand', () => {
    const paths = new Set<string>();
    for (const a of PROVIDER_ASSETS) {
      expect(a.logoPath, a.name).toMatch(/^\/[A-Za-z0-9]+\.(?:jpg|png|svg)$/);
      expect(paths.has(a.logoPath), `${a.name} reuses another brand's asset`).toBe(false);
      paths.add(a.logoPath);
    }
  });

  /**
   * COVERAGE IS REPORTED, NOT ASSERTED AT 100%.
   *
   * The remaining catalogue services have no verified asset yet — TMDB's
   * provider list needs the server key, and nothing goes in the table until it
   * has been looked at (see scripts/syncProviderLogos.ts). This test fails only
   * if coverage goes DOWN, so the honest number is visible and cannot silently
   * regress while the gap is closed.
   */
  it('reports catalogue coverage and never loses ground', () => {
    const covered = STREAMING_SERVICES.filter((s) => assetForProvider(officialProviderName(s.name), s.id) != null);
    const missing = STREAMING_SERVICES.filter((s) => assetForProvider(officialProviderName(s.name), s.id) == null);
    // Visible in the test output rather than buried in a number.
    expect(
      covered.length,
      `catalogue coverage ${covered.length}/${STREAMING_SERVICES.length}; still text-only: ${missing.map((m) => m.name).join(', ')}`,
    ).toBeGreaterThanOrEqual(8);
  });
});
