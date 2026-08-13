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
    for (const name of [
      'Netflix', 'Prime Video', 'Disney+', 'Max', 'Hulu', 'Paramount+', 'Peacock', 'Apple TV+',
      'Starz', 'AMC+', 'Fubo', 'Tubi', 'Pluto TV', 'The Roku Channel',
    ]) {
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
   * EVERY CURATED SERVICE RESOLVES, EXCEPT THE ONE UPSTREAM NO LONGER CARRIES.
   *
   * Showtime was folded into "Paramount+ with Showtime" and TMDB's US provider
   * data has no standalone entry for it (checked across nine Showtime
   * originals). Giving it Paramount+'s mark would be the brand merge this
   * registry exists to prevent, so it is named here as a KNOWN, ACCEPTED gap
   * rather than left as a silent hole — and if it ever becomes resolvable the
   * list below is what has to change.
   */
  const UPSTREAM_HAS_NO_MARK = new Set(['Showtime']);

  it('every curated service resolves to a verified mark, bar the documented one', () => {
    const missing = STREAMING_SERVICES.filter((s) => assetForProvider(officialProviderName(s.name), s.id) == null);
    expect(missing.map((m) => m.name)).toEqual([...UPSTREAM_HAS_NO_MARK]);
    const covered = STREAMING_SERVICES.length - missing.length;
    expect(
      covered,
      `catalogue coverage ${covered}/${STREAMING_SERVICES.length}`,
    ).toBe(STREAMING_SERVICES.length - UPSTREAM_HAS_NO_MARK.size);
  });

  it('a distribution route still never inherits a base brand’s new mark', () => {
    for (const route of ['Starz Amazon Channel', 'AMC+ Roku Premium Channel', 'AMC Plus Apple TV Channel']) {
      expect(assetForProvider(route), route).toBeNull();
    }
  });
});
