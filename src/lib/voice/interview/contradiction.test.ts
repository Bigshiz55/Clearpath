import { describe, it, expect } from 'vitest';
import { detectContradictions, explanationFor } from './contradiction';
import { claimFromSignal } from './memory';
import { categoriesFor } from './categories';
import type { TasteSignal, Claim } from './types';

function sig(over: Partial<TasteSignal> & Pick<TasteSignal, 'id' | 'subject' | 'sentiment'>): TasteSignal {
  return {
    turn: 1,
    kind: 'genre',
    strength: 0.9,
    categories: categoriesFor(over.subject, over.kind ?? 'genre'),
    ...over,
  };
}

describe('detectContradictions', () => {
  it('catches the flagship: hate horror, then love The Silence of the Lambs', () => {
    const earlier: Claim[] = [claimFromSignal(sig({ id: 'a', subject: 'horror', sentiment: 'hate' }))];
    const incoming = sig({ id: 'b', kind: 'title', subject: 'The Silence of the Lambs', sentiment: 'love' });
    const found = detectContradictions(earlier, incoming);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe('category_vs_title');
    expect(found[0]!.earlier.subject).toBe('horror');
    expect(found[0]!.later.subject).toBe('The Silence of the Lambs');
    expect(found[0]!.explanation.toLowerCase()).toContain('horror');
    expect(found[0]!.raised).toBe(false);
    expect(found[0]!.resolved).toBe(false);
  });

  it('catches a sentiment flip: love X then dislike X', () => {
    const earlier: Claim[] = [claimFromSignal(sig({ id: 'a', kind: 'title', subject: 'Inception', sentiment: 'love' }))];
    const incoming = sig({ id: 'b', kind: 'title', subject: 'Inception', sentiment: 'dislike' });
    const found = detectContradictions(earlier, incoming);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe('sentiment_flip');
  });

  it('catches an attribute conflict: subtitles dealbreaker then loving Parasite', () => {
    const earlier: Claim[] = [claimFromSignal(sig({ id: 'a', kind: 'attribute', subject: 'subtitles', sentiment: 'hate' }))];
    const incoming = sig({ id: 'b', kind: 'title', subject: 'Parasite', sentiment: 'love' });
    const found = detectContradictions(earlier, incoming);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe('attribute_conflict');
  });

  it('does not false-positive on unrelated claims', () => {
    const earlier: Claim[] = [claimFromSignal(sig({ id: 'a', subject: 'horror', sentiment: 'hate' }))];
    const incoming = sig({ id: 'b', kind: 'title', subject: 'Prisoners', sentiment: 'love' });
    expect(detectContradictions(earlier, incoming)).toHaveLength(0);
  });

  it('a neutral incoming signal contradicts nothing', () => {
    const earlier: Claim[] = [claimFromSignal(sig({ id: 'a', subject: 'horror', sentiment: 'hate' }))];
    const incoming = sig({ id: 'b', kind: 'title', subject: 'The Silence of the Lambs', sentiment: 'neutral' });
    expect(detectContradictions(earlier, incoming)).toHaveLength(0);
  });
});

describe('explanationFor', () => {
  it('produces a gentle line naming both subjects', () => {
    const earlier: Claim[] = [claimFromSignal(sig({ id: 'a', subject: 'horror', sentiment: 'hate' }))];
    const incoming = sig({ id: 'b', kind: 'title', subject: 'The Silence of the Lambs', sentiment: 'love' });
    const c = detectContradictions(earlier, incoming)[0]!;
    const line = explanationFor(c);
    expect(line).toContain('horror');
    expect(line).toContain('The Silence of the Lambs');
    expect(line.length).toBeGreaterThan(20);
  });
});
