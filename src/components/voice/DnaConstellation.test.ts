import { describe, it, expect } from 'vitest';
import { constellationNodes } from './DnaConstellation';
import { createInterview, advance, TASTE_CATEGORIES, type TasteSignal } from '@/lib/voice/interview';

/**
 * The constellation is driven entirely by `constellationNodes(state)`. It must
 * return exactly one node per axis, lift confidence where the interview has
 * heard something, and sign the disposition the way the user leaned — so the
 * live visual can never contradict the engine.
 */
function signal(over: Partial<TasteSignal>): TasteSignal {
  return {
    id: 't', turn: 1, kind: 'genre', subject: 'x', sentiment: 'neutral', strength: 1, categories: [], ...over,
  };
}

describe('constellationNodes', () => {
  it('returns one node per taste axis', () => {
    const nodes = constellationNodes(createInterview('u', 0));
    expect(nodes).toHaveLength(TASTE_CATEGORIES.length);
    expect(nodes.every((n) => n.confidence === 0 && n.disposition === 0)).toBe(true);
  });

  it('lifts confidence and signs a loved axis positive', () => {
    const state = advance(createInterview('u', 0), [signal({ subject: 'horror', sentiment: 'love', categories: ['horrorTolerance'] })], 1);
    const node = constellationNodes(state).find((n) => n.category === 'horrorTolerance')!;
    expect(node.confidence).toBeGreaterThan(0);
    expect(node.disposition).toBeGreaterThan(0);
  });

  it('signs an avoided axis negative', () => {
    const state = advance(createInterview('u', 0), [signal({ subject: 'musicals', sentiment: 'hate', categories: ['musicals'] })], 1);
    const node = constellationNodes(state).find((n) => n.category === 'musicals')!;
    expect(node.disposition).toBeLessThan(0);
  });
});
