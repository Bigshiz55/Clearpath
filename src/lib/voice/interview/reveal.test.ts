import { describe, it, expect } from 'vitest';
import { buildDnaReveal } from './reveal';
import { advance, createInterview } from './director';
import { categoriesFor } from './categories';
import type { TasteSignal } from './types';

function sig(over: Partial<TasteSignal> & Pick<TasteSignal, 'id' | 'subject' | 'sentiment'>): TasteSignal {
  return {
    turn: 1,
    kind: 'title',
    strength: 0.9,
    categories: categoriesFor(over.subject, over.kind ?? 'title'),
    ...over,
  };
}

function build() {
  let s = createInterview('u', 0);
  s = advance(s, [sig({ id: 'a', subject: 'The Silence of the Lambs', sentiment: 'love', strength: 1 })], 1);
  s = advance(s, [sig({ id: 'b', kind: 'genre', subject: 'musicals', sentiment: 'hate', strength: 0.9 })], 2);
  s = advance(s, [sig({ id: 'c', kind: 'title', subject: 'Prisoners', sentiment: 'love', strength: 0.8 })], 3);
  return s;
}

describe('buildDnaReveal', () => {
  it('summarises top axes, must-haves and dealbreakers', () => {
    const reveal = buildDnaReveal(build());
    expect(reveal.topCategories.length).toBeGreaterThan(0);
    expect(reveal.topCategories.length).toBeLessThanOrEqual(8);
    // sorted by confidence x |disposition| descending
    for (let i = 1; i < reveal.topCategories.length; i++) {
      const prev = reveal.topCategories[i - 1]!;
      const cur = reveal.topCategories[i]!;
      expect(prev.confidence * Math.abs(prev.disposition)).toBeGreaterThanOrEqual(cur.confidence * Math.abs(cur.disposition));
    }
    expect(reveal.mustHaves).toContain('The Silence of the Lambs');
    expect(reveal.dealBreakers).toContain('musicals');
  });

  it('leaves catalogue-resolved fields empty (no fabricated titles)', () => {
    const reveal = buildDnaReveal(build());
    expect(reveal.predictedLoves).toEqual([]);
    expect(reveal.predictedHates).toEqual([]);
    expect(reveal.hiddenDiscoveries).toEqual([]);
  });

  it('reports a bounded distinctiveness', () => {
    const reveal = buildDnaReveal(build());
    expect(reveal.distinctiveness).toBeGreaterThanOrEqual(0);
    expect(reveal.distinctiveness).toBeLessThanOrEqual(1);
  });

  it('is empty-safe on a fresh interview', () => {
    const reveal = buildDnaReveal(createInterview('u', 0));
    expect(reveal.topCategories).toEqual([]);
    expect(reveal.dealBreakers).toEqual([]);
    expect(reveal.mustHaves).toEqual([]);
    expect(reveal.distinctiveness).toBe(0);
  });
});
