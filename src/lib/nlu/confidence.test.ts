import { describe, it, expect } from 'vitest';
import { searchConfidence, type SearchSignals } from './confidence';

const base = (p: Partial<SearchSignals>): SearchSignals => ({
  intent: 'discovery', originCountries: [], englishAudioRequired: false, audioVerifiable: false,
  networks: [], platforms: [], runtimeMax: null, reference: null, ambiguities: [], requested: {}, ...p,
});

describe('search confidence', () => {
  it('a fully-captured foreign+audio+platform request is high confidence, no clarify', () => {
    const c = searchConfidence(base({
      intent: 'platform_browse', originCountries: ['ES'], englishAudioRequired: true, audioVerifiable: true,
      platforms: [8], runtimeMax: 120, requested: { origin: true, audio: true, platform: true, runtime: true },
    }));
    expect(c.overall).toBeGreaterThan(0.7);
    expect(c.clarify.needed).toBe(false);
  });

  it('a requested platform we could not resolve → ask ONE follow-up about the service', () => {
    const c = searchConfidence(base({ intent: 'discovery', requested: { platform: true } }));
    expect(c.provider).toBeLessThan(0.5);
    expect(c.clarify.needed).toBe(true);
    expect(c.clarify.question).toMatch(/service|Netflix/i);
  });

  it('a detected contradiction collapses confidence and asks which wins', () => {
    const c = searchConfidence(base({ ambiguities: ['audio: english required AND original-only'] }));
    expect(c.overall).toBeLessThan(0.55);
    expect(c.clarify.needed).toBe(true);
    expect(c.clarify.question).toMatch(/conflict/i);
  });

  it('English audio is only fully trusted once verifiable', () => {
    const off = searchConfidence(base({ englishAudioRequired: true, audioVerifiable: false, requested: { audio: true } }));
    const on = searchConfidence(base({ englishAudioRequired: true, audioVerifiable: true, requested: { audio: true } }));
    expect(on.audio).toBeGreaterThan(off.audio);
  });

  it('a plain request with nothing specific asked is confident (no clarify)', () => {
    const c = searchConfidence(base({ intent: 'personalized_content_discovery' }));
    expect(c.clarify.needed).toBe(false);
  });
});
