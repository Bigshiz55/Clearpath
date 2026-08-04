import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AVAILABILITY_STATES, isIncluded, stateFromLegacyType, PRIME_STATES,
  type AvailabilityState,
} from './cardAvailability';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0042_canonical_availability.sql'), 'utf8');

describe('canonical states', () => {
  it('has exactly the twelve required states', () => {
    expect(new Set(AVAILABILITY_STATES)).toEqual(new Set([
      'buy', 'coming_soon', 'free_with_ads', 'included_with_addon',
      'included_with_base_subscription', 'included_with_premium_tier',
      'included_with_prime', 'library_access', 'leaving_soon', 'rent',
      'unavailable', 'unverified',
    ]));
    expect(AVAILABILITY_STATES).toHaveLength(12);
  });

  it('free_with_ads is NOT inclusion — conflating them is how false "included" claims start', () => {
    expect(isIncluded('free_with_ads')).toBe(false);
    expect(isIncluded('rent')).toBe(false);
    expect(isIncluded('buy')).toBe(false);
    expect(isIncluded('unverified')).toBe(false);
    expect(isIncluded('included_with_prime')).toBe(true);
    expect(isIncluded('library_access')).toBe(true);
  });
});

describe('legacy migration mapping — every existing value is preserved', () => {
  it('maps all four legacy source_type values to a real state', () => {
    expect(stateFromLegacyType('subscription')).toBe('included_with_base_subscription');
    expect(stateFromLegacyType('free')).toBe('free_with_ads');
    expect(stateFromLegacyType('rent')).toBe('rent');
    expect(stateFromLegacyType('buy')).toBe('buy');
  });

  it('never guesses — anything unrecognised becomes unverified', () => {
    expect(stateFromLegacyType('mystery')).toBe('unverified');
    expect(stateFromLegacyType('')).toBe('unverified');
  });

  it('legacy subscription never asserts premium, add-on or Prime inclusion', () => {
    const s: AvailabilityState = stateFromLegacyType('subscription');
    expect(s).not.toBe('included_with_premium_tier');
    expect(s).not.toBe('included_with_addon');
    expect(s).not.toBe('included_with_prime');
  });

  it('the SQL backfill mirrors the TS mapping exactly, so they cannot drift', () => {
    expect(sql).toMatch(/when 'subscription' then 'included_with_base_subscription'/);
    expect(sql).toMatch(/when 'free'\s+then 'free_with_ads'/);
    expect(sql).toMatch(/else 'unverified'/);
  });
});

describe('migration safety', () => {
  it('is additive — source_type is never altered or dropped', () => {
    expect(sql).not.toMatch(/drop column if exists source_type/);
    expect(sql).not.toMatch(/alter column source_type/);
    expect(sql).toMatch(/add column if not exists availability_state/);
  });

  it('defaults to unverified so nothing is asserted without evidence', () => {
    expect(sql).toMatch(/alter column availability_state set default 'unverified'/);
  });

  it('constrains to the twelve states', () => {
    for (const s of AVAILABILITY_STATES) expect(sql).toContain(`'${s}'`);
  });

  it('carries every provenance field a claim must retain', () => {
    for (const c of ['source_url', 'retrieved_at', 'last_verified_at', 'confidence', 'evidence_trace', 'watch_link', 'addon_name', 'service_name']) {
      expect(sql, c).toMatch(new RegExp(`add column if not exists ${c}`));
    }
  });

  it('has a rollback that loses no data', () => {
    const rb = readFileSync(join(process.cwd(), 'supabase/migrations/rollback/0042_canonical_availability_rollback.sql'), 'utf8');
    expect(rb).toMatch(/drop column if exists availability_state/);
    // The point is that source_type is never dropped or altered — the file's
    // own comment mentions it by name, so assert on the statements, not the prose.
    expect(rb).not.toMatch(/drop column if exists source_type/);
    expect(rb).not.toMatch(/alter column source_type/);
  });

  it('is registered so it actually runs', () => {
    const pending = readFileSync(join(process.cwd(), 'src/lib/pendingMigrations.ts'), 'utf8');
    expect(pending).toContain('0042_canonical_availability');
  });
});

describe('Prime Video states stay separated', () => {
  it('keeps inclusion, add-on, ads, rent, buy and unavailable distinct', () => {
    for (const s of ['included_with_prime', 'included_with_addon', 'free_with_ads', 'rent', 'buy', 'unavailable', 'unverified'] as AvailabilityState[]) {
      expect(PRIME_STATES.has(s), s).toBe(true);
    }
    // Base/premium subscription are not Prime concepts — never collapse into them.
    expect(PRIME_STATES.has('included_with_base_subscription')).toBe(false);
  });
});
