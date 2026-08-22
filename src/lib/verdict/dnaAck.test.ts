/**
 * THE ACKNOWLEDGEMENT NEVER CLAIMS MORE THAN IS TRUE.
 *
 * The whole reason this exists: a For/Against ruling must confirm what it
 * actually taught, and — crucially — must NOT fabricate a learned preference to
 * look clever. These tests pin the honesty boundary.
 */
import { describe, it, expect } from 'vitest';
import { ruleAck, signalsForReason } from '@/lib/verdict/dnaAck';

describe('a FOR is an honest "more like this"', () => {
  it('confirms the positive without inventing an axis', () => {
    const ack = ruleAck('for');
    expect(ack.line).toBe('Got it — more like this');
    expect(ack.specific).toBe(false);
  });
});

describe('an AGAINST with no reason states only the title-level truth', () => {
  it('says "fewer like this" — never a fabricated axis claim', () => {
    const ack = ruleAck('against', []);
    expect(ack.line).toBe('Noted — fewer like this');
    expect(ack.specific).toBe(false);
  });

  it('a reason that maps to no taste axis stays honest (no specific claim)', () => {
    // "Too long" is recorded, but maps to runtime, not one of the taste axes —
    // so we must NOT claim to have learned a taste axis from it.
    const signals = signalsForReason('too_long');
    expect(signals).toHaveLength(0);
    expect(ruleAck('against', signals).specific).toBe(false);
  });
});

describe('an AGAINST with a reason names exactly what moved', () => {
  it('"too slow" → less slow pacing', () => {
    const ack = ruleAck('against', signalsForReason('too_slow'));
    expect(ack.specific).toBe(true);
    expect(ack.line).toMatch(/less slow pacing/);
  });

  it('"too dark" → a lighter tone', () => {
    const ack = ruleAck('against', signalsForReason('too_dark'));
    expect(ack.specific).toBe(true);
    expect(ack.line).toMatch(/lighter tone/);
  });

  it('a multi-axis reason lists what it learned', () => {
    // "too serious" nudges darkness down AND humor up.
    const ack = ruleAck('against', signalsForReason('too_serious'));
    expect(ack.specific).toBe(true);
    expect(ack.line).toMatch(/lighter tone/);
    expect(ack.line).toMatch(/more comedy/);
    expect(ack.line).toMatch(/ and /);
  });
});
