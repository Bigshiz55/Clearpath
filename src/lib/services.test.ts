import { describe, it, expect } from 'vitest';
import { isProviderMine, includedServiceNames, tonightAvailability } from './services';
import type { WatchProvider } from './types';

const p = (providerId: number, providerName: string, type: WatchProvider['type']): WatchProvider => ({
  providerId,
  providerName,
  logoPath: null,
  type,
});

describe('my services matching', () => {
  it('matches a provider by its canonical id and its variant ids', () => {
    // Netflix canonical is 8; 1796 is Netflix-with-ads.
    expect(isProviderMine(8, [8])).toBe(true);
    expect(isProviderMine(1796, [8])).toBe(true);
    // Prime Video variants collapse to one subscription.
    expect(isProviderMine(119, [9])).toBe(true);
    expect(isProviderMine(8, [9])).toBe(false);
  });

  it('nothing matches when the user has selected no services', () => {
    expect(isProviderMine(8, [])).toBe(false);
    expect(includedServiceNames([p(8, 'Netflix', 'flatrate')], [])).toEqual([]);
  });

  it('only counts subscription/free options as "included", never rent/buy', () => {
    const opts = [p(8, 'Netflix', 'flatrate'), p(10, 'Amazon Video', 'buy')];
    expect(includedServiceNames(opts, [8])).toEqual(['Netflix']);
    // A title you only own on a rental store is not "included".
    expect(includedServiceNames([p(8, 'Netflix', 'rent')], [8])).toEqual([]);
  });

  it('summarizes tonight availability across the three real cases', () => {
    const included = tonightAvailability([p(8, 'Netflix', 'flatrate')], [8]);
    expect(included.kind).toBe('included');

    const elsewhere = tonightAvailability([p(337, 'Disney+', 'flatrate')], [8]);
    expect(elsewhere.kind).toBe('elsewhere');

    const rentOnly = tonightAvailability([p(10, 'Amazon Video', 'rent')], [8]);
    expect(rentOnly.kind).toBe('rent_buy');

    expect(tonightAvailability([], [8]).kind).toBe('none');
  });
});
