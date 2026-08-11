import { describe, it, expect } from 'vitest';
import {
  buildGuideHealth,
  buildProviderHealth,
  PROVIDER_FRESHNESS_MS,
  type ProviderFacts,
} from './providerHealth';

const NOW = Date.UTC(2026, 7, 11, 12, 0);

const tvMedia: ProviderFacts = {
  providerId: 'tv_media',
  name: 'TV Media',
  purpose: 'linear_epg',
  configured: true,
  enabled: false,
  egressPermitted: false,
  egressDenialCode: 'paid_adapter_needs_paid_mode',
  licensing: 'unconfirmed',
  attributionRequired: null,
  lastAttemptAtMs: Date.UTC(2026, 7, 5, 22, 8),
  lastSuccessAtMs: Date.UTC(2026, 7, 5, 17, 46),
  listingCount: 0,
  uniqueLinearChannels: 0,
  coveredFromMs: null,
  coveredToMs: null,
  missingMandatoryChannels: [...['Hallmark Channel', 'Lifetime']],
};

const tvmaze: ProviderFacts = {
  providerId: 'tvmaze',
  name: 'TVmaze',
  purpose: 'supplemental_metadata',
  configured: true,
  enabled: true,
  egressPermitted: true,
  licensing: 'confirmed',
  attributionRequired: true,
  lastAttemptAtMs: NOW - 3_600_000,
  lastSuccessAtMs: NOW - 3_600_000,
  listingCount: 133,
  uniqueLinearChannels: 29,
  coveredFromMs: NOW,
  coveredToMs: NOW + 3 * 86_400_000,
  missingMandatoryChannels: ['Hallmark Channel', 'Hallmark Mystery', 'Hallmark Family', 'Lifetime', 'Lifetime Movie Network'],
};

describe('a supplemental source can never be a full grid', () => {
  it('TVmaze with 133 fresh listings is STILL not full-grid healthy', () => {
    const h = buildProviderHealth(tvmaze, { nowMs: NOW });
    expect(h.listingCount).toBe(133);
    expect(h.dataAgeMs).toBe(3_600_000);
    // Fresh, licensed, enabled, permitted — and still not a grid.
    expect(h.fullGridHealthy, 'a metadata source was reported as a full grid').toBe(false);
    expect(h.degradedReason).toMatch(/supplemental metadata source, not a linear EPG/i);
  });

  it('no row count can promote it — this is the bug the old gridLive had', () => {
    for (const listingCount of [1, 133, 10_000]) {
      expect(buildProviderHealth({ ...tvmaze, listingCount }, { nowMs: NOW }).fullGridHealthy).toBe(false);
    }
  });

  it('and the guide claim follows: partial listings, not full grid', () => {
    const g = buildGuideHealth([tvmaze, tvMedia], { nowMs: NOW });
    expect(g.hasLicensedLinearGrid).toBe(false);
    expect(g.claim).toBe('partial_listings');
  });
});

describe('licensing outranks operational state', () => {
  it('unconfirmed licensing is the reason, even when the flags would allow it', () => {
    const h = buildProviderHealth(
      { ...tvMedia, enabled: true, egressPermitted: true, listingCount: 5000, lastSuccessAtMs: NOW },
      { nowMs: NOW },
    );
    expect(h.fullGridHealthy).toBe(false);
    expect(h.degradedReason).toMatch(/licensing is unconfirmed/i);
  });

  it('rejected is named as rejected, not as a config gap', () => {
    const h = buildProviderHealth(
      { ...tvMedia, name: 'Schedules Direct', licensing: 'rejected', enabled: true, egressPermitted: true },
      { nowMs: NOW },
    );
    expect(h.degradedReason).toMatch(/licensing-rejected .* must not be called/i);
  });

  it('a confirmed, enabled, fresh linear provider IS full-grid healthy', () => {
    const h = buildProviderHealth(
      {
        ...tvMedia,
        licensing: 'confirmed',
        enabled: true,
        egressPermitted: true,
        listingCount: 2802,
        uniqueLinearChannels: 66,
        lastSuccessAtMs: NOW - 3_600_000,
        missingMandatoryChannels: [],
      },
      { nowMs: NOW },
    );
    expect(h.fullGridHealthy).toBe(true);
    expect(h.degradedReason).toBeNull();
    expect(buildGuideHealth([h as never], { nowMs: NOW }).claim).toBe('full_grid');
  });
});

describe('freshness and degradation ordering', () => {
  it('stale data fails even when everything else is right', () => {
    const h = buildProviderHealth(
      {
        ...tvMedia,
        licensing: 'confirmed', enabled: true, egressPermitted: true, listingCount: 10,
        lastSuccessAtMs: NOW - (PROVIDER_FRESHNESS_MS + 3_600_000),
        missingMandatoryChannels: [],
      },
      { nowMs: NOW },
    );
    expect(h.fullGridHealthy).toBe(false);
    expect(h.degradedReason).toMatch(/past the .* freshness window/i);
  });

  it('never-succeeded reports null age rather than a misleading zero', () => {
    const h = buildProviderHealth({ ...tvMedia, lastSuccessAtMs: null }, { nowMs: NOW });
    expect(h.dataAgeMs).toBeNull();
  });

  it('missing mandatory channels are named, not counted away', () => {
    const h = buildProviderHealth(
      {
        ...tvMedia, licensing: 'confirmed', enabled: true, egressPermitted: true,
        listingCount: 10, lastSuccessAtMs: NOW, missingMandatoryChannels: ['Hallmark Channel'],
      },
      { nowMs: NOW },
    );
    expect(h.degradedReason).toContain('Hallmark Channel');
  });
});

describe('attribution applicability', () => {
  it('UNDETERMINED IS NOT PERMISSION — null never shows a credit', () => {
    const h = buildProviderHealth({ ...tvMedia, attributionRequired: null, listingCount: 500 }, { nowMs: NOW });
    expect(h.attributionApplicable).toBe(false);
  });

  it('a required credit shows only while that provider is actually rendering data', () => {
    const rendering = buildProviderHealth({ ...tvmaze, attributionRequired: true, listingCount: 133 }, { nowMs: NOW });
    const silent = buildProviderHealth({ ...tvmaze, attributionRequired: true, listingCount: 0 }, { nowMs: NOW });
    expect(rendering.attributionApplicable).toBe(true);
    expect(silent.attributionApplicable, 'credited a provider that supplied nothing').toBe(false);
  });

  it('a rejected provider is never credited', () => {
    const h = buildProviderHealth({ ...tvMedia, licensing: 'rejected', attributionRequired: true, listingCount: 9 }, { nowMs: NOW });
    expect(h.attributionApplicable).toBe(false);
  });
});

describe('health payloads carry no secrets', () => {
  it('the egress denial code is dropped from the public shape', () => {
    const h = buildProviderHealth(tvMedia, { nowMs: NOW }) as unknown as Record<string, unknown>;
    expect('egressDenialCode' in h).toBe(false);
    // …but the reason still names it, which is the safe half.
    expect(buildProviderHealth({ ...tvMedia, licensing: 'confirmed', enabled: true }, { nowMs: NOW }).degradedReason)
      .toMatch(/paid_adapter_needs_paid_mode/);
  });

  it('serialises without anything key-shaped', () => {
    const json = JSON.stringify(buildGuideHealth([tvmaze, tvMedia], { nowMs: NOW }));
    expect(json).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });
});
