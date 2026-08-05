import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WatchNowList } from './WatchNowList';
import type { WatchNowResult, WatchNowItem } from '@/lib/tv/platform/query';

/**
 * RENDERED MARKUP, NOT INTENTIONS.
 *
 * `/app/what-to-watch` lives behind the auth gate, so an unauthenticated HTTP
 * request to it is a redirect and proves nothing about the page. Rendering the
 * component to static markup proves what a signed-in user actually receives —
 * and keeps proving it, which a one-off screenshot would not.
 *
 * The assertions are the promises this surface makes: every row states its
 * provenance, generated data is visibly badged, and the offer wording comes
 * from the shared resolver rather than from here.
 */

function item(over: Partial<WatchNowItem> = {}): WatchNowItem {
  return {
    kind: 'streaming',
    titleKey: 'fx-title-000001',
    title: 'The Silent Harbour',
    year: 2019,
    serviceSlug: 'netflix',
    serviceName: 'Netflix',
    offerType: 'subscription',
    priceCents: null,
    isDirect: true,
    viaServiceSlug: null,
    sourceSlug: 'fixture',
    supportStage: 'fixture_tested',
    coverageLevel: 'national',
    confidence: 1,
    lastSeenUtc: '2026-03-01T00:00:00.000Z',
    isFixture: true,
    attribution: null,
    ...over,
  };
}

function result(items: WatchNowItem[], over: Partial<WatchNowResult> = {}): WatchNowResult {
  return {
    status: 'ok',
    message: null,
    dataMode: 'fixture',
    generatedAtUtc: '2026-03-01T00:00:00.000Z',
    items,
    coverage: {
      sources: [{ slug: 'fixture', stage: 'fixture_tested', lastSeenUtc: '2026-03-01T00:00:00.000Z' }],
      stalestUtc: '2026-03-01T00:00:00.000Z',
      totalBeforeFiltering: items.length,
      filteredOutUnverified: 0,
      filteredOutFixtureInProduction: 0,
    },
    ...over,
  };
}

describe('WatchNowList renders', () => {
  it('renders a streaming row with its provenance', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([item()])} />);
    expect(html).toContain('data-testid="watch-now-list"');
    expect(html).toContain('The Silent Harbour');
    expect(html).toContain('2019');
    expect(html).toContain('data-testid="watch-now-source"');
    expect(html).toContain('source: fixture');
    expect(html).toContain('data-testid="watch-now-stage"');
    expect(html).toContain('fixture_tested');
    expect(html).toContain('checked 2026-03-01');
  });

  it('badges generated data visibly, never silently', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([item()])} />);
    expect(html).toContain('data-testid="watch-now-fixture-badge"');
    expect(html).toContain('TEST DATA');
  });

  it('omits the badge for a real row', () => {
    const html = renderToStaticMarkup(
      <WatchNowList result={result([item({ isFixture: false, sourceSlug: 'tvmaze', supportStage: 'verified' })])} />);
    expect(html).not.toContain('TEST DATA');
    expect(html).toContain('source: tvmaze');
  });

  it('takes its offer wording from the shared resolver', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([item()])} />);
    // "Included with Netflix" is the resolver's phrasing for
    // `included_with_base_subscription`. This component never spells it.
    expect(html).toContain('Included with Netflix');
  });

  it('labels a rental as a rental, never as included', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([
      item({ offerType: 'rent', priceCents: 499, serviceName: 'Apple TV (Store)', serviceSlug: 'apple-tv-store' }),
    ])} />);
    expect(html).toContain('rent');
    expect(html).toContain('$4.99');
    expect(html).not.toContain('Included with Apple TV (Store)');
  });

  it('distinguishes an add-on bought through a carrier from one bought direct', () => {
    const direct = renderToStaticMarkup(<WatchNowList result={result([
      item({ offerType: 'addon', serviceName: 'Acorn TV', serviceSlug: 'acorn-tv', isDirect: true, viaServiceSlug: null }),
    ])} />);
    const via = renderToStaticMarkup(<WatchNowList result={result([
      item({ offerType: 'addon', serviceName: 'Acorn TV', serviceSlug: 'acorn-tv', isDirect: false, viaServiceSlug: 'prime-video' }),
    ])} />);
    // Both mention Acorn TV; only the carrier route names the carrier. They
    // are different products and the markup must not read identically.
    expect(direct).toContain('Acorn TV');
    expect(via).toContain('Acorn TV');
    expect(via).toContain('prime-video');
    expect(via).not.toBe(direct);
  });

  it('renders an unmatched linear programme using the source title', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([
      item({
        kind: 'linear', title: 'Untitled Local Programme', serviceSlug: undefined,
        serviceName: 'Fx Network 3', networkSlug: 'fx-net-3', offerType: undefined,
        startUtc: '2026-03-01T01:00:00.000Z', endUtc: '2026-03-01T02:00:00.000Z',
        confidence: 0.4, lastSeenUtc: null,
      }),
    ])} />);
    expect(html).toContain('Untitled Local Programme');
    expect(html).toContain('On TV');
    // A low-confidence match says so rather than presenting itself as certain.
    expect(html).toContain('match 40%');
  });

  it('renders the configuration error instead of an empty list', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([], {
      status: 'configuration_error',
      message: 'DATA_MODE is not set on this production deployment.',
      dataMode: null,
    })} />);
    expect(html).toContain('data-testid="watch-now-config-error"');
    expect(html).toContain('DATA_MODE is not set');
    expect(html).not.toContain('data-testid="watch-now-list"');
  });

  it('explains an empty result rather than showing a blank panel', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([], {
      status: 'no_verified_sources',
      message: 'No source has reached the verified stage for this surface yet.',
    })} />);
    expect(html).toContain('data-testid="watch-now-empty"');
    expect(html).toContain('verified stage');
  });

  it('keeps long titles wrappable so a narrow phone cannot clip them', () => {
    const html = renderToStaticMarkup(<WatchNowList result={result([
      item({ title: 'The Extraordinarily Long Midnight Confession Lighthouse Reunion Special' }),
    ])} />);
    expect(html).toContain('break-words');
    expect(html).toContain('min-w-0');
  });
});
