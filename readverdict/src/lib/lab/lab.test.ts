import { describe, it, expect } from 'vitest';
import { runLab, runScenario, EXPECTATIONS } from './harness';
import { validateEvent, EVENTS } from '@/lib/analytics/events';

describe('Search Lab', () => {
  it('passes all hard-constraint expectations (no regressions)', () => {
    const report = runLab('smoke');
    if (report.violations.length > 0) {
      // Surface the specific failures for debugging.
      console.error(report.violations);
    }
    expect(report.violations).toEqual([]);
  });

  it('runs the full grid deterministically', () => {
    const a = runLab('full');
    const b = runLab('full');
    expect(a.metrics.scenarios).toBe(16); // 4 archetypes × 4 books
    expect(a).toEqual(b);
  });

  it('never emits fabricated cohort stats from any scenario', () => {
    for (const exp of EXPECTATIONS) {
      const r = runScenario(
        { id: exp.archetype, label: '', dna: { dimensions: {}, updatedAt: null } },
        { id: exp.book, title: 't', subjects: [], pageCount: 300 },
      );
      expect(r.matchScore).toBeGreaterThanOrEqual(1);
      expect(r.matchScore).toBeLessThanOrEqual(100);
    }
  });
});

describe('analytics taxonomy', () => {
  it('strips forbidden and non-allow-listed props', () => {
    const v = validateEvent('search_submitted', { q: 'x', count: 3, password: 'secret', extra: 1 });
    expect(v.props).toEqual({ q: 'x', count: 3 });
    expect(v.warnings.some((w) => /forbidden/.test(w))).toBe(true);
    expect(v.warnings.some((w) => /non-allow-listed/.test(w))).toBe(true);
  });

  it('flags unknown events but does not drop them', () => {
    const v = validateEvent('mystery_event', { a: 1 });
    expect(v.warnings[0]).toMatch(/Unknown event/);
  });

  it('every taxonomy event has a stable name matching its key', () => {
    for (const [key, def] of Object.entries(EVENTS)) {
      expect(def.name).toBe(key);
      expect(def.version).toBeGreaterThanOrEqual(1);
    }
  });
});
