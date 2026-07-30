import { describe, it, expect } from 'vitest';
import { labelEvidence, tally, type TitleEvidence } from './labels';

describe('live-audit evidence labels (honesty rules)', () => {
  it('verifies origin from production_countries', () => {
    const e: TitleEvidence = { originCountries: ['ES'], originalLanguage: 'es' };
    expect(labelEvidence(e, { kind: 'origin_country', target: 'ES' }).label).toBe('verified');
  });

  it('only INFERS origin when country is absent but language points to it', () => {
    const e: TitleEvidence = { originCountries: ['MX'], originalLanguage: 'es' };
    expect(labelEvidence(e, { kind: 'origin_country', target: 'ES' }).label).toBe('inferred');
  });

  it('marks origin UNAVAILABLE when the source omitted the field entirely', () => {
    const e: TitleEvidence = { present: { originCountries: false } };
    expect(labelEvidence(e, { kind: 'origin_country', target: 'ES' }).label).toBe('unavailable');
  });

  it('verifies a runtime ceiling only when within the cap', () => {
    expect(labelEvidence({ runtimeMinutes: 118 }, { kind: 'runtime_max', target: 120 }).label).toBe('verified');
    expect(labelEvidence({ runtimeMinutes: 140 }, { kind: 'runtime_max', target: 120 }).label).toBe('unknown');
  });

  it('NEVER verifies English audio without a real audio-track source (TMDB cannot prove dubs)', () => {
    // No audio source → unavailable, never verified.
    expect(labelEvidence({}, { kind: 'english_audio', target: 'en' }).label).toBe('unavailable');
    // A real audio source listing English → verified.
    expect(labelEvidence({ audioLanguages: ['es', 'en'], present: { audio: true } }, { kind: 'english_audio', target: 'en' }).label).toBe('verified');
    // A real audio source without English → unknown (not a false negative claim).
    expect(labelEvidence({ audioLanguages: ['es'], present: { audio: true } }, { kind: 'english_audio', target: 'en' }).label).toBe('unknown');
  });

  it('verifies a platform only when watch/providers lists it for the region', () => {
    expect(labelEvidence({ providerIds: [8, 9] }, { kind: 'platform', target: 8 }).label).toBe('verified');
    expect(labelEvidence({ providerIds: [15] }, { kind: 'platform', target: 8 }).label).toBe('unknown');
    expect(labelEvidence({ present: { providers: false } }, { kind: 'platform', target: 8 }).label).toBe('unavailable');
  });

  it('tallies labels', () => {
    const rs = [
      labelEvidence({ originCountries: ['ES'] }, { kind: 'origin_country', target: 'ES' }),
      labelEvidence({}, { kind: 'english_audio', target: 'en' }),
    ];
    const t = tally(rs);
    expect(t.verified).toBe(1);
    expect(t.unavailable).toBe(1);
    expect(t.total).toBe(2);
  });
});
