/**
 * THE LABEL MATCHES THE EVIDENCE — the anti-fake-personalization contract.
 *
 * The bug: a score the taste layer never touched was branded "Your VERD1CT 🧬"
 * just because the account had rated something. These tests pin that the marker
 * is earned by the resolver's `personalized` verdict, not by rating volume.
 */
import { describe, it, expect } from 'vitest';
import { personalizationView } from '@/lib/verdict/personalizationState';

describe('objective — taste did not move this number', () => {
  it('shows Standard Score, no DNA marker, and an honest invitation', () => {
    const v = personalizationView({ personalized: false, sampleSize: 0, confidence: 0 });
    expect(v.state).toBe('objective');
    expect(v.header).toBe('Standard Score');
    expect(v.showDna).toBe(false);
    expect(v.sub).toMatch(/rate a few/i);
  });

  it('STAYS objective even for a user who has rated many titles', () => {
    // The exact fake-personalization case: lots of ratings, but the resolver
    // says taste did not move THIS title — so it must not wear a personal badge.
    const v = personalizationView({ personalized: false, sampleSize: 50, confidence: 0.9 });
    expect(v.state).toBe('objective');
    expect(v.showDna).toBe(false);
    expect(v.header).toBe('Standard Score');
  });
});

describe('learning — taste moved it, evidence still light', () => {
  it('earns the DNA marker and names the state honestly', () => {
    const v = personalizationView({ personalized: true, sampleSize: 3, confidence: 0.3, canonicalLabel: 'Your Verdict' });
    expect(v.state).toBe('learning');
    expect(v.header).toBe('Your Verdict');
    expect(v.showDna).toBe(true);
    expect(v.sub).toMatch(/getting to know you/i);
    expect(v.sub).toContain('3 rated');
  });
});

describe('tuned — taste moved it with real confidence', () => {
  it('by confidence', () => {
    const v = personalizationView({ personalized: true, sampleSize: 4, confidence: 0.7 });
    expect(v.state).toBe('tuned');
    expect(v.sub).toMatch(/squarely your taste/i);
    expect(v.showDna).toBe(true);
  });

  it('by sample volume', () => {
    const v = personalizationView({ personalized: true, sampleSize: 12, confidence: 0.2 });
    expect(v.state).toBe('tuned');
  });
});
