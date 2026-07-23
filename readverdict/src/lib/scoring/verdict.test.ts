import { describe, it, expect } from 'vitest';
import {
  buildVerdict,
  tierFromScore,
  primaryCallFromTier,
} from './verdict';
import { classicBook, emptyBook, weakBook } from './fixtures';

const NOW = '2026-07-23T00:00:00.000Z';
const OPTS = { now: NOW, refYear: 2026 };

describe('tierFromScore', () => {
  it('maps score bands to tiers', () => {
    expect(tierFromScore(90)).toBe('Must Read');
    expect(tierFromScore(78)).toBe('Strong Read');
    expect(tierFromScore(66)).toBe('Worth Reading');
    expect(tierFromScore(55)).toBe('Possible Read');
    expect(tierFromScore(40)).toBe('Low Priority');
    expect(tierFromScore(10)).toBe('Skip');
  });

  it('maps tiers to a headline call', () => {
    expect(primaryCallFromTier('Must Read')).toBe('READ IT');
    expect(primaryCallFromTier('Worth Reading')).toBe('MAYBE');
    expect(primaryCallFromTier('Skip')).toBe('SKIP IT');
  });
});

describe('buildVerdict', () => {
  it('gives a strong classic a READ IT call and free-reading option', () => {
    const v = buildVerdict({ meta: classicBook(), ...OPTS });
    expect(v.primaryCall).toBe('READ IT');
    expect(v.reasonsFor.length).toBeGreaterThan(0);
    const free = v.readingOptions.find((o) => o.kind === 'read-free');
    expect(free).toBeDefined();
    expect(free?.href).toContain('openlibrary.org/works/OL45804W');
  });

  it('flags a weak, print-only doorstop honestly in reasons against', () => {
    const v = buildVerdict({ meta: weakBook(), ...OPTS });
    const against = v.reasonsAgainst.join(' ');
    expect(against).toMatch(/long read|print copy|thinly sampled|Middling/i);
  });

  it('never invents availability: an unknown book gets a find-a-copy fallback', () => {
    const v = buildVerdict({ meta: emptyBook(), ...OPTS });
    expect(v.readingOptions.some((o) => o.label === 'Find a copy')).toBe(true);
    expect(v.readingOptions.some((o) => o.kind === 'read-free')).toBe(false);
  });

  it('always includes Length, Era, Availability, Editions and Language signals', () => {
    const v = buildVerdict({ meta: classicBook(), ...OPTS });
    const labels = v.signals.map((s) => s.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Length', 'Era', 'Availability', 'Editions', 'Language']),
    );
  });

  it('is deterministic when now and refYear are injected', () => {
    const a = buildVerdict({ meta: classicBook(), ...OPTS });
    const b = buildVerdict({ meta: classicBook(), ...OPTS });
    expect(a).toEqual(b);
    expect(a.generatedAt).toBe(NOW);
  });

  it('reports a reading-time estimate in the Length signal', () => {
    const v = buildVerdict({ meta: classicBook({ pageCount: 279 }), ...OPTS });
    const length = v.signals.find((s) => s.label === 'Length');
    expect(length?.note).toMatch(/≈/);
    expect(length?.note).toContain('279 pages');
  });
});
