import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeProviderName,
  officialProviderName,
  officialProviderNames,
  providerBrandKey,
  resolveProviderBrand,
} from './brand';

/**
 * A MISSING PROVIDER NAME IS A DATA GAP, NOT AN EXCEPTION.
 *
 * `officialProviderName(undefined)` called `.trim()` on it and threw, and
 * because a throw during render unmounts the whole tree rather than one chip,
 * a SINGLE result whose availability carried no resolved service dropped the
 * entire Finder results page into the error boundary — "Something went wrong",
 * no titles at all. That is what these guard.
 */
describe('a provider reference with no name', () => {
  const absent = [undefined, null, '', '   '] as const;

  it('never throws, whatever the payload left out', () => {
    for (const v of absent) {
      expect(() => normalizeProviderName(v)).not.toThrow();
      expect(() => officialProviderName(v)).not.toThrow();
      expect(() => providerBrandKey(v)).not.toThrow();
      expect(() => resolveProviderBrand({ name: v })).not.toThrow();
    }
  });

  it('resolves to "we do not know", never to a guessed brand', () => {
    for (const v of absent) {
      const brand = resolveProviderBrand({ name: v });
      expect(brand.name).toBe('');
      // The empty key must not collide with a real entry in the asset table.
      expect(brand.logoPath).toBeNull();
      expect(brand.textOnly).toBe(true);
    }
  });

  it('still resolves the brand when only an id or a logo identifies it', () => {
    // A row can arrive with no name but a TMDB provider id — that IS an
    // identity, and dropping it would lose a fact we hold.
    expect(resolveProviderBrand({ name: null, providerId: 8 }).logoPath).not.toBeNull();
    expect(resolveProviderBrand({ name: undefined, logoPath: '/x.jpg' }).logoPath).toBe('/x.jpg');
  });
});

describe('the provider-brand registry', () => {
  it('spells a brand the way the brand does', () => {
    expect(officialProviderName('fuboTV')).toBe('Fubo');
    expect(officialProviderName('Paramount Plus')).toBe('Paramount+');
    expect(officialProviderName('Amazon Prime Video')).toBe('Prime Video');
    expect(officialProviderName('MGM Plus')).toBe('MGM+');
    expect(officialProviderName('Apple TV Plus')).toBe('Apple TV+');
  });

  it('leaves an already-official name exactly alone', () => {
    for (const n of ['Netflix', 'Hulu', 'Max', 'Peacock', 'The Roku Channel', 'YouTube TV', 'Tubi']) {
      expect(officialProviderName(n)).toBe(n);
    }
  });

  it('NEVER merges two distinct provider identities', () => {
    // An add-on route is a different way to pay for a different thing. The
    // rename table is exact-match on the whole name for exactly this reason.
    expect(officialProviderName('Paramount+ Amazon Channel')).toBe('Paramount+ Amazon Channel');
    expect(officialProviderName('Paramount Plus Amazon Channel')).toBe('Paramount Plus Amazon Channel');
    expect(officialProviderName('Starz Apple TV Channel')).toBe('Starz Apple TV Channel');
  });

  it('never invents a logo — it is the caller’s, or one we verified by eye', () => {
    // A brand with no entry in the verified table gets nothing, not a guess.
    expect(resolveProviderBrand({ name: 'Some Regional Service' }).logoPath).toBeNull();
    expect(resolveProviderBrand({ name: 'Some Regional Service' }).textOnly).toBe(true);
    // A brand we DO hold an asset for renders it even with no caller logo —
    // that is the whole point of the table (see providers/assets.test.ts).
    expect(resolveProviderBrand({ name: 'Netflix' }).textOnly).toBe(false);
    const withLogo = resolveProviderBrand({ name: 'fuboTV', logoPath: '/fubo.jpg' });
    expect(withLogo.logoPath).toBe('/fubo.jpg');
    expect(withLogo.textOnly).toBe(false);
    expect(withLogo.name).toBe('Fubo');
  });

  it('carries the whole fact in the accessible label', () => {
    const b = resolveProviderBrand({ name: 'Paramount Plus', access: 'Included with subscription' });
    expect(b.alt).toBe('Paramount+ — Included with subscription');
    expect(resolveProviderBrand({ name: 'Hulu' }).alt).toBe('Hulu');
  });

  it('collapses plan variants of one brand, and only those', () => {
    // Same logo → same brand, whatever the plan is called.
    expect(providerBrandKey('Peacock Premium', '/p.jpg')).toBe(providerBrandKey('Peacock Premium Plus', '/p.jpg'));
    // No logo → tier words are stripped, so the plans still collapse…
    expect(providerBrandKey('Peacock Premium', null)).toBe(providerBrandKey('Peacock Premium Plus', null));
    // …but two genuinely different services never do.
    expect(providerBrandKey('Peacock', null)).not.toBe(providerBrandKey('Paramount+', null));
  });

  it('officialProviderNames dedupes by brand and keeps order', () => {
    expect(officialProviderNames(['fuboTV', 'Netflix', 'Fubo', '', '  '])).toEqual(['Fubo', 'Netflix']);
  });

  it('normalizes case and whitespace before looking anything up', () => {
    expect(normalizeProviderName('  FUBO   TV ')).toBe('fubo tv');
    expect(officialProviderName('  fubotv  ')).toBe('Fubo');
  });
});

// ---------------------------------------------------------------------------
// THE SITE-WIDE RULE, ENFORCED AGAINST THE REAL SOURCE.
//
// A provider, network, channel or platform gets its official asset or its
// official NAME. It never gets a television emoji, and there is never a second
// provider-name/logo map competing with this registry.
// ---------------------------------------------------------------------------
const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Files still rendering a television emoji next to something that names a
 * service. The glyph is allowed where it is decoration for a MEDIA TYPE or an
 * empty state ("TV shows", "nothing on your list yet") — it is a picture of a
 * television there, not a stand-in for a company's mark.
 */
const MEDIA_TYPE_DECORATION = new Set([
  'src/components/EasyOnTv.tsx',
  'src/components/EasyQuiz.tsx',
  'src/components/EasyMode.tsx',
  'src/components/UpcomingTvRail.tsx',
  'src/components/landing/PacksSpotlight.tsx',
  'src/components/verdict/ReportExtras.tsx', // episode-count tile + rating-source glyphs
  'src/app/lite/page.tsx',
  'src/app/app/reminders/page.tsx',
  'src/app/app/new/page.tsx',
  'src/app/app/vintage/page.tsx',
  'src/app/app/watchlist/page.tsx',
  'src/app/app/subscriptions/page.tsx',
]);

describe('no component renders a brand as an emoji', () => {
  it('every remaining 📺 is media-type decoration, never a service mark', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(ROOT.length + 1);
      if (MEDIA_TYPE_DECORATION.has(rel)) continue;
      // Comments are stripped first: the doc comments that FORBID the glyph
      // have to quote it, and a rule that trips over its own explanation is
      // useless. Blank the comment bodies rather than deleting them, so the
      // reported line numbers still point at the real source.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/^(\s*)\/\/.*$/gm, '$1');
      src.split('\n').forEach((line, i) => {
        if (!line.includes('📺')) return;
        offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders, `television emoji beside a service:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the availability row in "Why this Verd1ct?" renders the provider chip', () => {
    const src = readFileSync(join(SRC, 'components', 'verdict', 'WhyVerdict.tsx'), 'utf8');
    expect(src).toMatch(/<ProviderChip/);
    expect(src).toMatch(/data-testid="why-availability"/);
    // Access level and confidence survive as their own parts — the distinction
    // between verified and likely is presentation-visible, not flattened away.
    expect(src).toMatch(/availability\.access/);
    expect(src).toMatch(/availability\.confidence === 'verified'/);
  });

  it('there is exactly ONE brand lookup, and the renderers all read it', () => {
    for (const rel of [
      'src/components/media/ProviderChip.tsx',
      'src/components/watch/ProviderLogos.tsx',
      'src/lib/availability/providerBrand.ts',
      'src/lib/verdictExplain.ts',
    ]) {
      expect(readFileSync(join(ROOT, rel), 'utf8'), rel).toMatch(/@\/lib\/providers\/brand/);
    }
    // And the curated subscription catalogue no longer carries a glyph per
    // brand — that was the second, homemade "logo" map.
    expect(readFileSync(join(SRC, 'lib', 'services.ts'), 'utf8')).not.toMatch(/^\s*emoji:/m);
  });
});
