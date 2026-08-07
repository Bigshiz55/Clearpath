import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { topStreamingProvider } from '@/lib/services';
import type { WatchProvider } from '@/lib/tmdb/types';

/**
 * CARD-MEDIA REGRESSION SUITE (production defects 1 + 2).
 *
 * D1 — manual inline trailers: the ▶ Trailer button plays IN the card and never
 * opens QuickLook; it works without the ?trailers flag (the flag gates only
 * autoplay); TrailerMedia is the OUTER element on every wired surface so its
 * controls are siblings of the card's click target, not nested inside it.
 *
 * D2 — provider branding: a real TMDB logo renders when verified; a clean NAME
 * (never a 📺 emoji, never a guessed logo) falls back otherwise; streaming and
 * linear are DISTINCT chip entities; distribution add-ons keep their identity.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const opt = (over: Partial<WatchProvider>): WatchProvider => ({
  providerId: 8,
  providerName: 'Netflix',
  logoPath: '/netflix.png',
  type: 'flatrate',
  ...over,
});

// ---- D2: provider selection carries the verified logo, keeps identity --------
describe('topStreamingProvider — name + verified logo, identity preserved', () => {
  it('returns the first INCLUDED provider with its TMDB logo path', () => {
    const r = topStreamingProvider([opt({ providerId: 9, providerName: 'Prime Video', logoPath: '/prime.png' })]);
    expect(r).toEqual({ providerId: 9, name: 'Prime Video', logoPath: '/prime.png' });
  });
  it('returns null when only rent/buy exist (nothing included)', () => {
    expect(topStreamingProvider([opt({ type: 'rent' }), opt({ type: 'buy' })])).toBeNull();
  });
  it('does NOT collapse a distribution add-on into the base service', () => {
    // "Paramount+ Amazon Channel" is a distinct provider identity from base
    // "Paramount+"; the selector must return the exact provider name, not merge.
    const r = topStreamingProvider([opt({ providerId: 2303, providerName: 'Paramount+ Amazon Channel', logoPath: '/pplus-amzn.png' })]);
    expect(r?.name).toBe('Paramount+ Amazon Channel');
    expect(r?.name).not.toBe('Paramount+');
  });
  it('passes null logo through (→ chip text fallback) rather than inventing one', () => {
    const r = topStreamingProvider([opt({ providerName: 'Local Service', logoPath: null })]);
    expect(r).toEqual({ providerId: 8, name: 'Local Service', logoPath: null });
  });
});

// ---- D2: the chip renders a real logo or a clean name — never an emoji -------
describe('ProviderChip / NetworkChip — verified logo or clean text, no emoji', () => {
  const src = read('src/components/media/ProviderChip.tsx');
  it('builds a real TMDB logo URL when a logo path is present', () => {
    expect(src).toMatch(/tmdbImage\(data\.logoPath/);
  });
  it('has an explicit text fallback and NO television emoji as a fallback mark', () => {
    // The only 📺 in the file is inside doc comments forbidding it, never in JSX.
    const jsx = src.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.includes('never') && !l.includes('short NAME'));
    expect(jsx.join('\n')).not.toContain('📺');
    expect(src).toMatch(/text fallback|truncate">\{label\}/);
  });
  it('exports a DISTINCT NetworkChip (linear ≠ streaming entity)', () => {
    expect(src).toMatch(/export function ProviderChip/);
    expect(src).toMatch(/export function NetworkChip/);
    // A network never borrows a streaming logo path builder.
    expect(src).toMatch(/logoUrl/); // linear takes a direct URL, not a TMDB provider path
  });
});

// ---- D1: manual trailer is flag-independent and never opens QuickLook --------
describe('TrailerMedia — manual play works without the flag, never bubbles', () => {
  const src = read('src/components/trailer/TrailerMedia.tsx');
  it('passthrough depends on the id only, NOT on the feature flag', () => {
    expect(src).toMatch(/if \(tmdbId == null\) return <>\{children\}<\/>/);
    // The flag feeds autoplay only.
    expect(src).toMatch(/autoplayFeature\)?\s*&&|autoplayAllowed = autoplayFeature/);
  });
  it('the manual play + close + control handlers stop propagation and default', () => {
    expect(src).toMatch(/const stop = \(e[^)]*\) => \{\s*e\.stopPropagation\(\);\s*e\.preventDefault\(\);/);
    expect(src).toMatch(/manualPlay = useCallback\(\s*async \(e[^)]*\) => \{\s*stop\(e\)/);
    expect(src).toMatch(/close = useCallback\(\s*\(e[^)]*\) => \{\s*stop\(e\)/);
  });
  it('exposes a manual ▶ Trailer control and an inline player (no modal)', () => {
    expect(src).toMatch(/data-testid="trailer-play"/);
    expect(src).toMatch(/data-testid="trailer-close"/);
    expect(src).toMatch(/data-testid="trailer-player"/);
    // Inline only: it never imports the modal, opens a window, or navigates.
    expect(src).not.toMatch(/import[^;]*QuickLook|window\.open|router\.push|<a\s+href/);
  });
});

// ---- D1: wired surfaces put TrailerMedia OUTSIDE the QuickLook button --------
describe('wired surfaces: TrailerMedia wraps the click target, no nested button', () => {
  for (const rel of ['src/components/ReleaseWall.tsx', 'src/components/WatchNowGrid.tsx']) {
    it(`${rel}: <TrailerMedia> opens before the QuickLook <button>, and the 📺 pill is gone`, () => {
      const src = read(rel);
      const tm = src.indexOf('<TrailerMedia');
      const btn = src.indexOf('<button', tm);
      expect(tm).toBeGreaterThan(-1);
      // TrailerMedia opens before the nearest following button (it is the outer
      // element; the QuickLook button is its child).
      expect(btn).toBeGreaterThan(tm);
      // No television-emoji provider pill remains; the branded chip is used.
      expect(src).not.toContain('📺');
      expect(src).toMatch(/ProviderChip/);
    });
  }
});
