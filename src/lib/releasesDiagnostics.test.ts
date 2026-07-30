import { describe, it, expect } from 'vitest';
import { releasesEmptyState } from './releasesDiagnostics';

describe('releases empty-state diagnostics — the Netflix+Upcoming failure', () => {
  it('THE headline case: Upcoming + Netflix empty → unsupported combination, not "no titles exist"', () => {
    const s = releasesEmptyState({ window: 'upcoming', providerIds: [8], itemCount: 0 });
    expect(s.reason).toBe('unsupported_upcoming_provider');
    expect(s.message).toMatch(/isn’t published by our current listings source/i);
    expect(s.actions.map((a) => a.label)).toEqual([
      'View general upcoming (all platforms)',
      'View that service’s titles out now',
    ]);
    // The recovery actions are real state patches the UI can apply.
    expect(s.actions[0]!.patch).toEqual({ providerIds: [] });
    expect(s.actions[1]!.patch).toEqual({ window: 'recent' });
  });

  it('distinguishes zero-data from the unsupported combination', () => {
    // Upcoming with NO provider filter → a genuinely empty (but supported) query.
    const s = releasesEmptyState({ window: 'upcoming', providerIds: [], itemCount: 0 });
    expect(s.reason).toBe('no_data');
    expect(s.message).toMatch(/No verified upcoming titles/i);
  });

  it('distinguishes an API error from empty data', () => {
    const s = releasesEmptyState({ window: 'recent', providerIds: [8], itemCount: 0, errored: true });
    expect(s.reason).toBe('api_error');
    expect(s.message).toMatch(/Couldn’t load/i);
  });

  it('returns ok when there are results (no empty state)', () => {
    const s = releasesEmptyState({ window: 'upcoming', providerIds: [8], itemCount: 5 });
    expect(s.reason).toBe('ok');
    expect(s.message).toBe('');
  });

  it('recent + provider empty → plain no-data with an all-platforms escape', () => {
    const s = releasesEmptyState({ window: 'recent', providerIds: [8], itemCount: 0 });
    expect(s.reason).toBe('no_data');
    expect(s.actions.some((a) => a.label === 'Try all platforms')).toBe(true);
  });
});
