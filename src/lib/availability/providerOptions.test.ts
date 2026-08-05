import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  stateFromTmdbType,
  optionsFromTileProviders,
  mergeProviderOptions,
  providerSummary,
  type TileProviders,
} from './providerOptions';
import {
  optionsFromCardAvailability,
  resolveWatchPresentation,
  type StreamingOption,
} from './watchPresentation';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * THE USER-LEVEL FAILURE THIS SUITE EXISTS FOR:
 * the search preview said availability was "not yet confirmed" for CSI: NY
 * while the full title page, one tap later, listed Hulu, Paramount+ and The
 * Roku Channel. Two systems, one title, two answers.
 */

const CSI_NY_PROVIDERS: TileProviders = {
  region: 'US',
  checkedAt: '2026-08-05T00:00:00.000Z',
  options: [
    { name: 'Hulu', type: 'flatrate', link: null },
    { name: 'Paramount Plus Essential', type: 'flatrate', link: null },
    { name: 'Paramount+ Amazon Channel', type: 'flatrate', link: null },
    { name: 'The Roku Channel', type: 'ads', link: null },
  ],
};

/** What production actually has for this title: no Watchmode rows at all. */
const NO_WATCHMODE = { status: 'unconfirmed' as const, sources: [], checkedAt: null };

describe('an empty enrichment cache does not erase real platform names', () => {
  it('CSI: NY falls back to the providers the title page already shows', () => {
    const merged = mergeProviderOptions(
      optionsFromCardAvailability(NO_WATCHMODE),
      optionsFromTileProviders(CSI_NY_PROVIDERS),
    );
    expect(merged.options.map((o) => (o.kind === 'streaming' ? o.service : ''))).toEqual([
      'Hulu',
      'Paramount Plus Essential',
      'Paramount+ Amazon Channel',
      'The Roku Channel',
    ]);
    // And it is no longer an unknown state, so the card stops saying so.
    const p = resolveWatchPresentation({ options: merged.options, checked: merged.checked });
    expect(p.status).toBe('available');
    expect(p.note).toBeNull();
  });

  it('the preview summary and the resolver name the SAME services', () => {
    const merged = mergeProviderOptions(
      optionsFromCardAvailability(NO_WATCHMODE),
      optionsFromTileProviders(CSI_NY_PROVIDERS),
    );
    const summary = providerSummary(merged.options, 99)!;
    const p = resolveWatchPresentation({ options: merged.options, checked: merged.checked });
    for (const service of summary.split(' · ')) {
      expect(p.lines.some((l) => l.text.includes(service)), service).toBe(true);
    }
  });
});

describe('Watchmode still wins where it exists', () => {
  const watchmode = {
    status: 'available' as const,
    checkedAt: '2026-08-01T00:00:00.000Z',
    sources: [{ name: 'Hulu', type: 'subscription' as const, deeplink: 'https://hulu.example/csi-ny' }],
  };

  it('a cached row beats the TMDB fallback outright', () => {
    const merged = mergeProviderOptions(
      optionsFromCardAvailability(watchmode),
      optionsFromTileProviders(CSI_NY_PROVIDERS),
    );
    expect(merged.options).toHaveLength(1);
    const only = merged.options[0] as StreamingOption;
    expect(only.service).toBe('Hulu');
    // The reason it wins: it carries a real link, and TMDB's row does not.
    expect(only.watchLink).toBe('https://hulu.example/csi-ny');
  });

  it('the two lists are never mixed — one service, one wording', () => {
    const merged = mergeProviderOptions(
      optionsFromCardAvailability(watchmode),
      optionsFromTileProviders(CSI_NY_PROVIDERS),
    );
    const names = merged.options.map((o) => (o.kind === 'streaming' ? o.service : ''));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('provenance is preserved, never laundered', () => {
  it('a TMDB option says so', () => {
    const [first] = optionsFromTileProviders(CSI_NY_PROVIDERS).options;
    expect(first!.provenance).toBe('tmdb');
  });

  it('a Watchmode option says so', () => {
    const [first] = optionsFromCardAvailability({
      status: 'available',
      checkedAt: null,
      sources: [{ name: 'Hulu', type: 'subscription', deeplink: null }],
    }).options;
    expect((first as StreamingOption).provenance).toBe('watchmode');
  });

  it('no TMDB option is ever dressed up as a stronger claim', () => {
    // flatrate is base-subscription inclusion and nothing more. Premium tier,
    // add-on and Prime are separate claims that need their own evidence — a
    // viewer who acts on the wrong one hits a paywall.
    expect(stateFromTmdbType('flatrate')).toBe('included_with_base_subscription');
    for (const t of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
      expect(['included_with_premium_tier', 'included_with_addon', 'included_with_prime']).not.toContain(
        stateFromTmdbType(t),
      );
    }
  });

  it('an unrecognised bucket is unverified, not a guess', () => {
    expect(stateFromTmdbType('mystery-bucket')).toBe('unverified');
  });
});

describe('honest unknown survives', () => {
  it('neither source has anything -> still an unknown state', () => {
    const merged = mergeProviderOptions(
      optionsFromCardAvailability(NO_WATCHMODE),
      optionsFromTileProviders(null),
    );
    expect(merged.checked).toBe(false);
    expect(merged.options).toHaveLength(0);
    const p = resolveWatchPresentation({ options: merged.options, checked: merged.checked });
    expect(p.status).toBe('unknown');
    expect(p.cta.kind).toBe('check_availability');
    expect(providerSummary(merged.options)).toBeNull();
  });

  it('TMDB looked and found nothing -> a RESULT, not ignorance', () => {
    // The distinction the whole availability system is built on: "we never
    // looked" and "we looked and there is nothing" must not read the same.
    const merged = mergeProviderOptions(
      optionsFromCardAvailability(NO_WATCHMODE),
      optionsFromTileProviders({ region: 'US', checkedAt: null, options: [] }),
    );
    expect(merged.checked).toBe(true);
    const p = resolveWatchPresentation({ options: merged.options, checked: merged.checked });
    expect(p.status).toBe('none');
  });
});

describe('the summary is compact and truthful', () => {
  it('lists a few names and counts the rest', () => {
    const { options } = optionsFromTileProviders(CSI_NY_PROVIDERS);
    expect(providerSummary(options, 3)).toBe('Hulu · Paramount Plus Essential · Paramount+ Amazon Channel +1 more');
  });

  it('never repeats a service that appears twice', () => {
    const { options } = optionsFromTileProviders({
      region: 'US',
      checkedAt: null,
      options: [
        { name: 'Hulu', type: 'flatrate', link: null },
        { name: 'Hulu', type: 'rent', link: null },
      ],
    });
    expect(providerSummary(options)).toBe('Hulu');
  });
});

describe('the providers ride the request that already existed', () => {
  it('the ratings route carries them instead of discarding them', () => {
    const route = read('src/app/api/ratings/[type]/[id]/route.ts');
    // getScoringData already returned providers; the response dropped them.
    expect(route).toContain('const { meta, providers } = await getScoringData');
    expect(route).toContain('providers: tileProviders');
  });

  it('no new per-card fetch was introduced', () => {
    // One shared request per title, as before. A grid of twenty results must
    // not become twenty extra provider lookups.
    const row = read('src/components/search/SearchResultRow.tsx');
    expect(row).toContain('loadTileFacts');
    expect(row).not.toMatch(/fetch\(/);
  });
});
