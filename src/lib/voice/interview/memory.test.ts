import { describe, it, expect } from 'vitest';
import { addClaim, claimFromSignal, recall } from './memory';
import type { TasteSignal, Claim } from './types';

function signal(over: Partial<TasteSignal> = {}): TasteSignal {
  return {
    id: 'sig',
    turn: 2,
    kind: 'title',
    subject: 'Prisoners',
    sentiment: 'love',
    strength: 0.9,
    categories: ['crime', 'mystery'],
    raw: 'I loved Prisoners',
    ...over,
  };
}

describe('claimFromSignal', () => {
  it('carries the signal through into a durable claim', () => {
    const c = claimFromSignal(signal());
    expect(c).toMatchObject({
      id: 'claim:sig',
      turn: 2,
      subject: 'Prisoners',
      sentiment: 'love',
      strength: 0.9,
      raw: 'I loved Prisoners',
    });
    expect(c.categories).toEqual(['crime', 'mystery']);
  });

  it('omits raw when the signal had none', () => {
    const c = claimFromSignal(signal({ raw: undefined }));
    expect('raw' in c).toBe(false);
  });
});

describe('recall', () => {
  const claims: Claim[] = [
    claimFromSignal(signal({ id: 'a', subject: 'Prisoners', categories: ['crime'] })),
    claimFromSignal(signal({ id: 'b', subject: 'horror', sentiment: 'hate', categories: ['horrorTolerance'] })),
  ];

  it('recalls by subject case-insensitively', () => {
    expect(recall(claims, { subject: 'prisoners' })).toHaveLength(1);
    expect(recall(claims, { subject: 'prisoners' })[0]!.id).toBe('claim:a');
  });

  it('recalls by category', () => {
    expect(recall(claims, { category: 'horrorTolerance' })[0]!.id).toBe('claim:b');
  });

  it('returns everything with no filter', () => {
    expect(recall(claims, {})).toHaveLength(2);
  });
});

describe('addClaim', () => {
  it('keeps the stronger claim when subject + sentiment collide', () => {
    const weak = claimFromSignal(signal({ id: 'w', strength: 0.3 }));
    const strong = claimFromSignal(signal({ id: 's', strength: 0.9 }));
    let claims = addClaim([], weak);
    claims = addClaim(claims, strong);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.strength).toBe(0.9);
  });

  it('keeps opposite sentiments about the same subject as separate claims', () => {
    let claims = addClaim([], claimFromSignal(signal({ id: 'l', sentiment: 'love' })));
    claims = addClaim(claims, claimFromSignal(signal({ id: 'h', sentiment: 'hate' })));
    expect(claims).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const input: Claim[] = [];
    addClaim(input, claimFromSignal(signal()));
    expect(input).toHaveLength(0);
  });
});
