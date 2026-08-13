import { describe, it, expect } from 'vitest';
import {
  normalizeProviderName,
  officialProviderName,
  providerBrandKey,
  resolveProviderBrand,
} from './brand';

/**
 * THE REGISTRY'S BEHAVIOUR WHEN THERE IS NO PROVIDER IDENTITY TO RESOLVE.
 *
 * This module already promises it "never invents a logo" and "never merges
 * different services". The promise it was missing is the one that matters most
 * at a rendering boundary: it must never THROW. Every entry point here reached
 * `name.trim()` on the first line, so `undefined`, `null` or a blank string
 * crashed the caller — and the nearest caller was a React component, which
 * meant the crash took the whole page down rather than one chip.
 *
 * Absent identity is a legitimate state, not a programming error: this data
 * arrives as deserialized JSON from an API whose payload has changed shape over
 * time. The registry's answer is "no brand" — a text-only result with an empty
 * name, which a caller renders as nothing. What it must never be is a guess.
 *
 * Written to FAIL against the code as shipped.
 */

describe('the provider registry tolerates absent identity', () => {
  const absent = [undefined, null, '', '   ', '\t\n'] as const;

  it('normalizeProviderName returns an empty key rather than throwing', () => {
    for (const v of absent) {
      expect(() => normalizeProviderName(v as unknown as string)).not.toThrow();
      expect(normalizeProviderName(v as unknown as string)).toBe('');
    }
  });

  it('officialProviderName returns an empty name rather than throwing', () => {
    for (const v of absent) {
      expect(() => officialProviderName(v as unknown as string)).not.toThrow();
      expect(officialProviderName(v as unknown as string)).toBe('');
    }
  });

  it('providerBrandKey is stable and non-throwing for absent identity', () => {
    for (const v of absent) {
      expect(() => providerBrandKey(v as unknown as string, null)).not.toThrow();
    }
    // Two nameless rows are the SAME non-brand, so a dedupe does not multiply
    // them into a row of empty tiles.
    expect(providerBrandKey(undefined as unknown as string, null)).toBe(
      providerBrandKey('  ' as unknown as string, null),
    );
  });

  it('a verified logo still identifies a brand even with no name', () => {
    // The logo is the strongest key the registry has; a row that carries one
    // is a real brand whatever its name field is doing.
    expect(providerBrandKey(undefined as unknown as string, '/netflix.jpg')).toBe('logo:/netflix.jpg');
  });

  it('resolveProviderBrand returns a text-only non-brand rather than throwing', () => {
    for (const v of absent) {
      expect(() => resolveProviderBrand({ name: v as unknown as string })).not.toThrow();
      const b = resolveProviderBrand({ name: v as unknown as string });
      expect(b.name).toBe('');
      // NEVER a guessed asset for an identity we do not have.
      expect(b.logoPath).toBeNull();
      expect(b.textOnly).toBe(true);
    }
  });

  it('still resolves real brands exactly as before', () => {
    expect(resolveProviderBrand({ name: 'Netflix' }).name).toBe('Netflix');
    expect(resolveProviderBrand({ name: 'Paramount Plus' }).name).toBe('Paramount+');
    expect(resolveProviderBrand({ name: '  Netflix  ' }).name).toBe('Netflix');
    expect(officialProviderName('Amazon Prime Video')).toBe('Prime Video');
  });
});
