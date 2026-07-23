import { describe, it, expect } from 'vitest';
import { resolveEnglishAudio, type AudioAvailabilityRecord } from './audioAvailability';
import { curatedRecordsFor, heuristicRecord, gatherAudioRecords } from './audioSources';
import { splitByAudio, audioStrictness, type AudioRankedItem } from './audioRecommend';
import { parseForeignAudioRequest } from './foreignAudioQuery';
import { discoverInternational, type DiscoveryCandidate } from './international';

const heur = (o: Partial<Parameters<typeof heuristicRecord>[0]> = {}) =>
  heuristicRecord({ titleId: 'tv:1', mediaType: 'tv', providerId: 'netflix', providerName: 'Netflix', region: 'US', originalLanguage: 'Danish', englishAvailability: 'available', ...o });

describe('1 & 3 — verified only from a verified source; heuristic alone is LIKELY, never VERIFIED', () => {
  it('foreign + verified English dub → VERIFIED', () => {
    const r = resolveEnglishAudio(curatedRecordsFor('tv:71446', 'netflix', 'US'), { providerId: 'netflix', region: 'US' });
    expect(r.status).toBe('VERIFIED_ENGLISH_AUDIO');
    expect(r.verifiedAt).toBeTruthy();
    expect(r.providerName).toBe('Netflix');
  });
  it('TMDB heuristic alone can NEVER produce VERIFIED (only LIKELY)', () => {
    const r = resolveEnglishAudio([heur({ englishAvailability: 'available' })], { providerId: 'netflix', region: 'US' });
    expect(r.status).toBe('LIKELY_ENGLISH_AUDIO');
    expect(r.confidence).toBeLessThanOrEqual(0.4);
  });
});

describe('2 — foreign + English subtitles only → excluded from strict primary', () => {
  it('classifies subtitle-only correctly and keeps it out of strict primary', () => {
    const subOnly: AudioAvailabilityRecord = { titleId: 'tv:9', mediaType: 'tv', seasonNumber: null, providerId: 'primevideo', providerName: 'Prime Video', region: 'US', originalLanguage: 'French', audioLanguages: ['fr'], subtitleLanguages: ['en'], englishAudioStatus: 'unavailable', source: 'curated_registry', verifiedAt: '2024-01-01', confidence: 0.9 };
    const r = resolveEnglishAudio([subOnly], { providerId: 'primevideo', region: 'US' });
    expect(r.status).toBe('ENGLISH_SUBTITLES_ONLY');
    const split = splitByAudio([{ item: 't', audio: r }], { strict: true });
    expect(split.primary).toHaveLength(0);
    expect(split.possibleMatches).toHaveLength(0); // subtitle-only never shown for strict
  });
});

describe('4 — audio verified on one provider does NOT validate another provider', () => {
  it('Netflix-verified does not make a Prime Video result verified', () => {
    const records = curatedRecordsFor('tv:71446', 'netflix', 'US'); // Netflix only
    const r = resolveEnglishAudio(records, { providerId: 'primevideo', region: 'US' });
    expect(r.status).toBe('UNKNOWN');
  });
});

describe('5 — audio verified in another region does NOT validate the US result', () => {
  it('GB-verified does not verify a DE request', () => {
    const records = curatedRecordsFor('tv:71446', 'netflix', 'GB'); // GB verified
    const r = resolveEnglishAudio(records, { providerId: 'netflix', region: 'DE' });
    expect(r.status).toBe('UNKNOWN');
  });
});

describe('6 — season-specific audio availability is represented accurately', () => {
  it('only S1 verified → verified for S1, no data for S2, title-level is flagged uncertain', () => {
    const recs = curatedRecordsFor('tv:80025', 'netflix', 'US'); // The Rain, S1 verified
    expect(resolveEnglishAudio(recs, { providerId: 'netflix', region: 'US', seasonNumber: 1 }).verifiedSeasons).toEqual([1]);
    expect(resolveEnglishAudio(recs, { providerId: 'netflix', region: 'US', seasonNumber: 2 }).status).toBe('UNKNOWN');
    // Money Heist has title-level (season null) verification → uncertain for a specific season.
    const mh = resolveEnglishAudio(curatedRecordsFor('tv:71446', 'netflix', 'US'), { providerId: 'netflix', region: 'US', seasonNumber: 3 });
    expect(mh.status).toBe('VERIFIED_ENGLISH_AUDIO');
    expect(mh.seasonUncertain).toBe(true);
  });
});

describe('7 & 8 — strict never mixes unverified into primary; unknown → possible-matches only', () => {
  const items: AudioRankedItem<string>[] = [
    { item: 'verified', audio: resolveEnglishAudio(curatedRecordsFor('tv:71446', 'netflix', 'US'), { providerId: 'netflix', region: 'US' }) },
    { item: 'likely', audio: resolveEnglishAudio([heur()], { providerId: 'netflix', region: 'US' }) },
    { item: 'unknown', audio: resolveEnglishAudio([], { providerId: 'netflix', region: 'US' }) },
  ];
  it('strict: primary = verified only; likely+unknown in the separated section', () => {
    const s = splitByAudio(items, { strict: true, requested: 5 });
    expect(s.primary.map((x) => x.item)).toEqual(['verified']);
    expect(s.possibleMatches.map((x) => x.item).sort()).toEqual(['likely', 'unknown']);
    expect(s.possibleMatchesLabel).toMatch(/not yet verified/);
  });
});

describe('9 — non-strict "dub preferred" may include LIKELY with clear labelling', () => {
  it('loose mode: verified + likely both primary; unknown separated', () => {
    const items: AudioRankedItem<string>[] = [
      { item: 'verified', audio: resolveEnglishAudio(curatedRecordsFor('tv:71446', 'netflix', 'US'), { providerId: 'netflix', region: 'US' }) },
      { item: 'likely', audio: resolveEnglishAudio([heur()], { providerId: 'netflix', region: 'US' }) },
      { item: 'unknown', audio: resolveEnglishAudio([], { providerId: 'netflix', region: 'US' }) },
    ];
    const s = splitByAudio(items, { strict: false });
    expect(s.primary.map((x) => x.item).sort()).toEqual(['likely', 'verified']);
    expect(s.possibleMatches.map((x) => x.item)).toEqual(['unknown']);
  });
  it('audioStrictness distinguishes strict vs preferred', () => {
    expect(audioStrictness('foreign shows with English audio').strict).toBe(true);
    expect(audioStrictness('dub preferred but ok either way').strict).toBe(false);
    expect(audioStrictness('dub preferred but ok either way').requireEnglishAudio).toBe(true);
  });
});

describe('10 — requested counts are honored honestly, never padded', () => {
  it('3 verified requested but only 1 available → shortfall, not padded', () => {
    const items: AudioRankedItem<string>[] = [
      { item: 'v', audio: resolveEnglishAudio(curatedRecordsFor('tv:71446', 'netflix', 'US'), { providerId: 'netflix', region: 'US' }) },
      { item: 'l', audio: resolveEnglishAudio([heur()], { providerId: 'netflix', region: 'US' }) },
    ];
    const s = splitByAudio(items, { strict: true, requested: 3 });
    expect(s.primary).toHaveLength(1);
    expect(s.shortfall).toBe(true);
    expect(s.verifiedCount).toBe(1); // not padded to 3
  });
});

describe('11 & 12 — Nordic/Spanish/French eligible; English-original does not dominate', () => {
  const cands: DiscoveryCandidate[] = [
    { id: 'us', title: 'US', countryOfOrigin: ['USA'], originalLanguage: 'English', availableAudioLanguages: ['English'], tasteScore: 96 },
    { id: 'dk', title: 'DK', countryOfOrigin: ['Denmark'], originalLanguage: 'Danish', availableAudioLanguages: ['Danish', 'English'], tasteScore: 88 },
    { id: 'es', title: 'ES', countryOfOrigin: ['Spain'], originalLanguage: 'Spanish', availableAudioLanguages: ['Spanish', 'English'], tasteScore: 86 },
    { id: 'fr', title: 'FR', countryOfOrigin: ['France'], originalLanguage: 'French', availableAudioLanguages: ['French', 'English'], tasteScore: 84 },
  ];
  it('Nordic, Spanish, French originals remain eligible with English dubs', () => {
    const { results } = discoverInternational(cands, { requireEnglishAudio: true, foreignPrioritized: true, limit: 4 });
    const langs = results.map((r) => r.originalLanguage);
    expect(langs).toContain('Danish'); expect(langs).toContain('Spanish'); expect(langs).toContain('French');
  });
  it('originally-English titles do not dominate a foreign-prioritized request', () => {
    const { results } = discoverInternational(cands, { requireEnglishAudio: true, foreignPrioritized: true, limit: 4, maxEnglishOriginalShare: 0.25 });
    expect(results.filter((r) => !r.foreignOriginal).length).toBeLessThanOrEqual(1);
  });
});

describe('15 & interpretation — sports excluded; strict foreign+audio request normalizes exactly', () => {
  it('normalizes the strict Nordic/Spanish/French request', () => {
    const q = parseForeignAudioRequest('I like 24 and Mindhunter. What foreign shows in languages like Nordic, Spanish, and French have English audio and would fit my taste?');
    expect(q).toEqual({
      mediaType: 'tv',
      tasteAnchors: ['24', 'Mindhunter'],
      foreignOriginalLanguagePreferred: true,
      internationalOnly: true,
      englishAudioRequired: true,
      englishSubtitlesOnlyAllowed: false,
      desiredRegionsOrLanguages: ['Nordic', 'Spanish', 'French'],
      sportsExcluded: true,
      strict: true,
    });
  });
  it('does not read "English audio" as "originally English"', () => {
    const q = parseForeignAudioRequest('foreign shows with English audio');
    expect(q.englishAudioRequired).toBe(true);
    expect(q.foreignOriginalLanguagePreferred).toBe(true);
  });
  it('gatherAudioRecords includes the curated verified record + a low-confidence heuristic', () => {
    const recs = gatherAudioRecords('tv:71446', { providerId: 'netflix', providerName: 'Netflix', region: 'US' }, { titleId: 'tv:71446', mediaType: 'tv', providerId: 'netflix', providerName: 'Netflix', region: 'US', originalLanguage: 'Spanish', englishAvailability: 'available' });
    expect(recs.some((r) => r.source === 'curated_registry' && r.englishAudioStatus === 'verified')).toBe(true);
    expect(recs.some((r) => r.source === 'tmdb_heuristic')).toBe(true);
    expect(recs.every((r) => !(r.source === 'tmdb_heuristic' && r.englishAudioStatus === 'verified'))).toBe(true);
  });
});
