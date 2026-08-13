/**
 * THERE IS ONE BRAND REGISTRY, AND NOTHING ELSE DECIDES BRAND IDENTITY.
 *
 * The defect this whole area exists to prevent was two components disagreeing
 * about one company — a Fubo logo in the availability strip and "📺 fuboTV" in
 * the panel two rows below it. That was possible because brand identity was
 * decided in whichever file happened to be rendering. The fix is only durable
 * if a second map cannot quietly grow back.
 *
 * So this is a source-level audit for every shape a competing registry takes:
 * an inline logo path, a hardcoded image host, a name→glyph table, a
 * name→name table, or a network→logo table living outside
 * `src/lib/providers/`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

/** THE registry. These files are allowed to hold brand data; nothing else is. */
const REGISTRY = ['src/lib/providers/brand.ts', 'src/lib/providers/assets.ts'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Source with comment bodies blanked — line numbers preserved. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
}

const FILES = walk(SRC).map((f) => ({ rel: f.slice(ROOT.length + 1), src: code(f) }));

describe('single-source brand identity', () => {
  it('no component or lib hardcodes a logo asset path', () => {
    // A TMDB `logo_path` literal ("/abc123.jpg") anywhere but the asset table
    // IS a second registry, however small.
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      if (REGISTRY.includes(rel)) continue;
      src.split('\n').forEach((line, i) => {
        if (/\b(?:logo|logoPath|logo_path|logoUrl|logo_url)\s*[:=]\s*['"]\/[A-Za-z0-9]{8,}\.(?:jpg|png|svg)['"]/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders, `inline logo paths outside the registry:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no file builds an image host URL by hand', () => {
    // `tmdbImage()` is the one builder; a hand-built host is how a second
    // sizing/CDN convention starts.
    const allowed = new Set(['src/lib/tmdb/image.ts', 'src/lib/tmdb/client.ts']);
    const offenders = FILES.filter((f) => !allowed.has(f.rel) && /image\.tmdb\.org/.test(f.src)).map((f) => f.rel);
    expect(offenders, `hand-built TMDB image hosts:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no second name→glyph table stands in for a brand mark', () => {
    // The curated catalogue's `emoji` field was exactly this and is gone.
    expect(code(join(SRC, 'lib', 'services.ts'))).not.toMatch(/^\s*emoji\s*:/m);
    const offenders = FILES.filter((f) => /emoji\s*:\s*string/.test(f.src) && /provider|service|network|channel/i.test(f.rel)).map(
      (f) => f.rel,
    );
    expect(offenders, `provider/service glyph tables:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no second provider-renaming table exists outside the registry', () => {
    // A rename map is recognisable by mapping one brand spelling to another.
    // Two or more of these pairs in one file is a competing OFFICIAL_NAMES.
    const BRANDS = /(['"])(?:fuboTV|Paramount Plus|Amazon Prime Video|Apple TV Plus|Disney Plus|AMC Plus|Tubi TV)\1\s*:/g;
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      if (REGISTRY.includes(rel)) continue;
      const hits = src.match(BRANDS) ?? [];
      if (hits.length >= 2) offenders.push(`${rel} (${hits.length} brand keys)`);
    }
    expect(offenders, `competing rename tables:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the network chip is the only linear-brand renderer, and it takes verified data', () => {
    const chip = code(join(SRC, 'components', 'media', 'ProviderChip.tsx'));
    expect(chip).toMatch(/export function NetworkChip/);
    // It renders an image ONLY from a URL it is handed — there is no network
    // name→logo table anywhere, by design (see the coverage report in
    // BACKLOG.md: no source in the stack licenses one).
    expect(chip).toMatch(/if \(logoUrl\)/);
    const offenders = FILES.filter(
      (f) => f.rel !== 'src/components/media/ProviderChip.tsx' && /NETWORK_LOGOS|networkLogos\s*[:=]\s*\{/.test(f.src),
    ).map((f) => f.rel);
    expect(offenders, `network logo maps:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every brand renderer reads the registry rather than deciding for itself', () => {
    for (const rel of [
      'src/components/media/ProviderChip.tsx',
      'src/components/watch/ProviderLogos.tsx',
      'src/lib/availability/providerBrand.ts',
      'src/lib/verdictExplain.ts',
    ]) {
      expect(FILES.find((f) => f.rel === rel)?.src, rel).toMatch(/@\/lib\/providers\/brand/);
    }
  });

  /**
   * ONE DOCUMENTED EXCEPTION, AND IT IS NOT A BRAND REGISTRY.
   *
   * `lib/tv/channelNames.ts` maps a raw grid call sign to a channel's display
   * NAME plus a monogram and a hue. It decides no brand identity and holds no
   * asset — it exists precisely because we ship nobody's logo, and it names
   * only what the call sign itself proves. It must never gain a logo field.
   */
  it('the channel-name helper stays a naming helper, never an asset map', () => {
    const src = code(join(SRC, 'lib', 'tv', 'channelNames.ts'));
    expect(src).not.toMatch(/logo/i);
    expect(src).not.toMatch(/image\.tmdb\.org|https?:\/\//);
  });
});
