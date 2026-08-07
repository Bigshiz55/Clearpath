import { describe, it, expect } from 'vitest';
import { deriveSignal } from './deriveSignal';

/**
 * THE FALLBACK INTERPRETER, PROVEN.
 *
 * `deriveSignal` is the keyless path's whole understanding of a spoken line, so
 * these assertions pin the behaviour the interview leans on: sentiment + strength
 * from the words, the RIGHT subject and kind, and — crucially — the taste axes
 * resolved through the engine's own lexicon so the fallback moves the same
 * confidence dimensions the model would.
 */
describe('deriveSignal', () => {
  it('reads an emphatic title love, with axes resolved from the lexicon', () => {
    const s = deriveSignal('I absolutely loved Prisoners', 1);
    expect(s).not.toBeNull();
    expect(s!.kind).toBe('title');
    expect(s!.subject).toBe('prisoners');
    expect(s!.sentiment).toBe('love');
    expect(s!.strength).toBeGreaterThan(0.9);
    expect(s!.categories).toContain('crime');
    expect(s!.raw).toBe('I absolutely loved Prisoners');
  });

  it('reads a genre hate and resolves its axis', () => {
    const s = deriveSignal('honestly I hate horror', 2);
    expect(s!.sentiment).toBe('hate');
    expect(s!.subject).toBe('horror');
    expect(s!.categories).toContain('horrorTolerance');
    expect(s!.strength).toBeGreaterThan(0.8);
  });

  it('handles negation as a dislike, not a like', () => {
    const s = deriveSignal("I'm not a fan of subtitles", 3);
    expect(s!.sentiment).toBe('dislike');
    expect(s!.subject).toBe('subtitles');
    expect(s!.kind).toBe('attribute');
    expect(s!.categories).toContain('subtitles');
  });

  it('prefers a known title over a bare genre word and tags it title-kind', () => {
    const s = deriveSignal('I really loved The Shining', 4);
    expect(s!.subject).toBe('the shining');
    expect(s!.kind).toBe('title');
    expect(s!.categories).toContain('horrorTolerance');
  });

  it('treats a named subject with no stated feeling as a shallow, mild positive', () => {
    const s = deriveSignal('so, westerns', 5);
    expect(s!.subject).toBe('westerns');
    expect(s!.sentiment).toBe('like');
    expect(s!.strength).toBeLessThan(0.35); // shallow → the director will follow up
    expect(s!.categories).toContain('westerns');
  });

  it('returns null when nothing about taste is said', () => {
    expect(deriveSignal('the weather is lovely today', 6)).toBeNull();
    expect(deriveSignal('   ', 7)).toBeNull();
    expect(deriveSignal('', 8)).toBeNull();
  });

  it('still yields a signal for an unknown subject when a feeling is clear', () => {
    const s = deriveSignal('I loved that one', 9);
    expect(s).not.toBeNull();
    expect(s!.sentiment).toBe('love');
    // Unknown subject → no fabricated axes, but the transcript line is kept.
    expect(s!.categories).toEqual([]);
    expect(s!.raw).toBe('I loved that one');
  });
});
