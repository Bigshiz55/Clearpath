import { describe, it, expect } from 'vitest';
import {
  assessEnglishAudio, englishDubAvailable, isForeignOriginal, originLine, isEnglish,
  discoverInternational, audioFromEnglishAvailability, type DiscoveryCandidate, type TitleLang,
} from './international';

const T = (o: Partial<TitleLang> & { title: string }): TitleLang => ({
  countryOfOrigin: [], originalLanguage: null, availableAudioLanguages: [], availableSubtitleLanguages: [], ...o,
});

describe('audio vs subtitle contract (verified English AUDIO, not original language)', () => {
  it('Danish original + English dub → INCLUDE', () => {
    const t = T({ title: 'The Killing (Forbrydelsen)', countryOfOrigin: ['Denmark'], originalLanguage: 'Danish', availableAudioLanguages: ['Danish', 'English'] });
    const a = assessEnglishAudio(t, { requireEnglishAudio: true });
    expect(a.eligible).toBe(true);
    expect(a.englishDubAvailable).toBe(true);
    expect(a.foreignOriginal).toBe(true);
  });
  it('Spanish original + English dub → INCLUDE', () => {
    const a = assessEnglishAudio(T({ title: 'Money Heist', countryOfOrigin: ['Spain'], originalLanguage: 'Spanish', availableAudioLanguages: ['Spanish', 'English'] }), { requireEnglishAudio: true });
    expect(a.eligible).toBe(true);
    expect(a.englishDubAvailable).toBe(true);
  });
  it('French original + English dub → INCLUDE', () => {
    const a = assessEnglishAudio(T({ title: 'Lupin', countryOfOrigin: ['France'], originalLanguage: 'French', availableAudioLanguages: ['French', 'English'] }), { requireEnglishAudio: true });
    expect(a.eligible).toBe(true);
    expect(a.englishDubAvailable).toBe(true);
  });
  it('foreign-language show is NOT rejected for having a non-English original', () => {
    // German original, English audio present → eligible; foreign original is fine.
    const a = assessEnglishAudio(T({ title: 'Dark', originalLanguage: 'German', availableAudioLanguages: ['German', 'English'] }), { requireEnglishAudio: true });
    expect(a.eligible).toBe(true);
    expect(isForeignOriginal('German')).toBe(true);
  });
  it('subtitle-only foreign show is EXCLUDED when English audio is required', () => {
    const t = T({ title: 'Call My Agent!', countryOfOrigin: ['France'], originalLanguage: 'French', availableAudioLanguages: ['French'], availableSubtitleLanguages: ['English'] });
    const a = assessEnglishAudio(t, { requireEnglishAudio: true });
    expect(a.eligible).toBe(false);
    expect(a.exclusionReason).toBe('English subtitles available, but no English audio track verified');
  });
  it('subtitle-only foreign show is INCLUDED when English audio is NOT required', () => {
    const a = assessEnglishAudio(T({ title: 'Parasite', originalLanguage: 'Korean', availableAudioLanguages: ['Korean'], availableSubtitleLanguages: ['English'] }), { requireEnglishAudio: false });
    expect(a.eligible).toBe(true);
  });
  it('englishDubAvailable requires a foreign original (an English original is not a "dub")', () => {
    expect(englishDubAvailable({ originalLanguage: 'English', availableAudioLanguages: ['English'] })).toBe(false);
    expect(englishDubAvailable({ originalLanguage: 'Danish', availableAudioLanguages: ['Danish', 'English'] })).toBe(true);
  });
});

describe('UI origin line', () => {
  it('says "Originally in Spanish — English audio available"', () => {
    expect(originLine('Spanish', true)).toBe('Originally in Spanish — English audio available');
  });
  it('marks subtitle-only foreign titles', () => {
    expect(originLine('French', false)).toBe('Originally in French — subtitles only');
  });
  it('English original', () => { expect(originLine('English', false)).toBe('Originally in English'); });
});

describe('international discovery — seek foreign, verified audio, diverse, taste-first', () => {
  const cands: DiscoveryCandidate[] = [
    { id: 'us1', title: '24 clone', countryOfOrigin: ['USA'], originalLanguage: 'English', availableAudioLanguages: ['English'], tasteScore: 95 },
    { id: 'us2', title: 'US thriller', countryOfOrigin: ['USA'], originalLanguage: 'English', availableAudioLanguages: ['English'], tasteScore: 90 },
    { id: 'dk1', title: 'The Killing', countryOfOrigin: ['Denmark'], originalLanguage: 'Danish', availableAudioLanguages: ['Danish', 'English'], tasteScore: 88 },
    { id: 'es1', title: 'Money Heist', countryOfOrigin: ['Spain'], originalLanguage: 'Spanish', availableAudioLanguages: ['Spanish', 'English'], tasteScore: 86 },
    { id: 'fr1', title: 'Lupin', countryOfOrigin: ['France'], originalLanguage: 'French', availableAudioLanguages: ['French', 'English'], tasteScore: 84 },
    { id: 'de1', title: 'Dark', countryOfOrigin: ['Germany'], originalLanguage: 'German', availableAudioLanguages: ['German', 'English'], tasteScore: 82 },
    { id: 'kr1', title: 'Stranger', countryOfOrigin: ['Korea'], originalLanguage: 'Korean', availableAudioLanguages: ['Korean', 'English'], tasteScore: 80 },
    { id: 'fr2', title: 'Subs-only FR', countryOfOrigin: ['France'], originalLanguage: 'French', availableAudioLanguages: ['French'], availableSubtitleLanguages: ['English'], tasteScore: 92 },
  ];

  it('excludes subtitle-only titles and includes foreign dubs; foreign original never a reason to exclude', () => {
    const { results, excluded } = discoverInternational(cands, { requireEnglishAudio: true, foreignPrioritized: true, limit: 6 });
    expect(excluded.map((e) => e.id)).toContain('fr2');
    expect(results.every((r) => r.availableAudioLanguages.some((l) => /english|en/i.test(l)))).toBe(true);
    expect(results.some((r) => r.id === 'dk1')).toBe(true);
  });

  it('originally-English titles do NOT dominate a foreign-prioritized request', () => {
    const { results } = discoverInternational(cands, { requireEnglishAudio: true, foreignPrioritized: true, limit: 6, maxEnglishOriginalShare: 0.25 });
    const englishOriginal = results.filter((r) => !r.foreignOriginal);
    expect(englishOriginal.length).toBeLessThanOrEqual(Math.floor(6 * 0.25));
    expect(results.filter((r) => r.foreignOriginal).length).toBeGreaterThanOrEqual(4);
  });

  it('returns a useful MIX of countries/languages when qualified matches exist', () => {
    const { results } = discoverInternational(cands, { requireEnglishAudio: true, foreignPrioritized: true, limit: 5 });
    const langs = new Set(results.filter((r) => r.foreignOriginal).map((r) => r.originalLanguage));
    expect(langs.size).toBeGreaterThanOrEqual(4); // Danish, Spanish, French, German/Korean…
  });

  it('every result carries country + original language + a dub flag', () => {
    const { results } = discoverInternational(cands, { requireEnglishAudio: true, foreignPrioritized: true, limit: 4 });
    for (const r of results) {
      expect(r.originalLanguage).toBeTruthy();
      expect(r.countryOfOrigin.length).toBeGreaterThan(0);
      expect(typeof r.englishDubAvailable).toBe('boolean');
      expect(r.originLine).toMatch(/Originally in/);
    }
  });

  it('does NOT force a weak match just for variety (taste + audio win)', () => {
    const weakForeign: DiscoveryCandidate[] = [
      { id: 'strong-us', title: 'US', countryOfOrigin: ['USA'], originalLanguage: 'English', availableAudioLanguages: ['English'], tasteScore: 95 },
      { id: 'weak-pl', title: 'Weak Polish', countryOfOrigin: ['Poland'], originalLanguage: 'Polish', availableAudioLanguages: ['Polish', 'English'], tasteScore: 20 },
    ];
    const { results } = discoverInternational(weakForeign, { requireEnglishAudio: true, foreignPrioritized: true, limit: 2, minTasteForDiversity: 55 });
    // the weak Polish match may appear (it's the only foreign option) but is ranked
    // below the strong match by taste — diversity never promotes it above a strong one.
    expect(results[0]!.tasteScore).toBeGreaterThanOrEqual(results[results.length - 1]!.tasteScore);
  });

  it('without a foreign preference, foreign titles are included (not filtered) and ranked purely by taste', () => {
    const { results } = discoverInternational(cands, { requireEnglishAudio: true, foreignPrioritized: false, limit: 3 });
    expect(results[0]!.id).toBe('us1'); // highest taste, eligible (has English audio)
    expect(results.some((r) => r.foreignOriginal)).toBe(true);
  });
});

describe('bridge from the app’s englishAvailability heuristic', () => {
  it('maps available → English audio track; subtitles → subtitle-only', () => {
    expect(audioFromEnglishAvailability('available', 'Danish').availableAudioLanguages.some(isEnglish)).toBe(true);
    const subs = audioFromEnglishAvailability('subtitles', 'French');
    expect(subs.availableAudioLanguages.some(isEnglish)).toBe(false);
    expect(subs.availableSubtitleLanguages).toContain('en');
  });
});
