import { describe, it, expect } from 'vitest';
import { computeGeneralScore } from './general';
import { buildVerdict } from './verdict';
import { canonicalScore } from './canonical';
import type { PersonalContext } from './personal';
import type { TitleMetadata } from '@/lib/types';

/**
 * ONE USER + ONE TITLE = ONE HEADLINE SCORE, ON EVERY SURFACE.
 *
 * ── THE PRODUCTION EVIDENCE ───────────────────────────────────────────────
 * Today's Case Briefing showed "Your Verdict 79" for The Golden Girls; tapping
 * the row opened QuickLook, which showed "83 · STREAM IT".
 *
 * ── THE MECHANISM, AND THE RED THIS FILE TOOK ─────────────────────────────
 * Two foundations were in use for the same question:
 *
 *   buildVerdict        computePersonalMatch(meta, general.score, …)
 *   /api/quicklook      general.standardScore ?? general.score
 *   /api/dna            general.standardScore ?? general.score
 *   /api/ratings        general.standardScore ?? general.score
 *   rankByDna           general.standardScore ?? general.score
 *
 * The briefing reads `buildVerdict`, so it started from the legacy blend while
 * every card surface started from the calibrated Standard Score. Measured
 * against the shipped code on the fixture below: `general.score` is 82 and
 * `standardScore` is 87, and `buildVerdict` personalized off 82 — a five-point
 * split with no user-visible cause, reproducing the reported defect exactly.
 */

const GOLDEN_GIRLS: TitleMetadata = {
  id: 1, mediaType: 'tv', title: 'The Golden Girls', year: 1985,
  overview: 'Four older women share a house in Miami.', genres: ['Comedy'], keywords: [],
  posterPath: null, backdropPath: null, runtimeMinutes: null, episodeRuntimeMinutes: 25,
  numberOfSeasons: 7, numberOfEpisodes: 180, status: 'Ended', contentRating: 'TV-PG',
  voteAverage: 8.0, voteCount: 900, popularity: 60, trailerUrl: null, originalLanguage: 'en',
  spokenLanguages: ['English'], originCountries: ['US'], imdbId: 'tt0088526', imdbRating: 8.3,
  rottenTomatoes: 95, metascore: null, rtAudience: 90, episodesAired: null, episodesTotal: null,
  nextEpisodeDate: null, englishAvailability: 'native',
} as TitleMetadata;

const noSignal: PersonalContext = {
  label: 'General Verdict', rules: [], likedFranchiseIds: [], collectionId: null, hasSignal: false,
};

describe('the fixture actually exercises the split (or this file proves nothing)', () => {
  it('general.score and standardScore genuinely differ for this title', () => {
    const g = computeGeneralScore(GOLDEN_GIRLS, null);
    expect(g.standardScore).toBeDefined();
    expect(g.standardScore, 'a fixture where they agree could not catch the bug').not.toBe(g.score);
  });
});

describe('EVERY SURFACE RESOLVES THE SAME HEADLINE NUMBER', () => {
  it('the verdict engine is founded on the Standard Score, not the legacy blend', () => {
    const g = computeGeneralScore(GOLDEN_GIRLS, null);
    const objective = g.standardScore ?? g.score;
    const report = buildVerdict({ meta: GOLDEN_GIRLS, providers: null, personal: noSignal });
    expect(report.personal.baseScore).toBe(objective);
  });

  it('briefing, card/DNA, QuickLook and the full verdict agree to the point', () => {
    const g = computeGeneralScore(GOLDEN_GIRLS, null);

    // The objective foundation every card surface reads.
    const cardObjective = g.standardScore ?? g.score;
    // The canonical contract, given no personal signal.
    const canonical = canonicalScore({ objective: cardObjective });
    // The verdict engine, which the briefing and the title page both consume.
    const report = buildVerdict({ meta: GOLDEN_GIRLS, providers: null, personal: noSignal });

    expect(report.personal.score, 'briefing/full verdict vs the canonical contract').toBe(canonical.score);
    expect(canonical.score, 'canonical contract vs the card/QuickLook objective').toBe(cardObjective);
  });

  it('a firing hard rule reaches every surface as the SAME final number', () => {
    const withRule: PersonalContext = {
      label: 'Scott Match',
      rules: [{ trait: 'supernatural', label: 'Supernatural', weight: -20, requiresDefining: false }],
      likedFranchiseIds: [], collectionId: null, hasSignal: true,
    };
    const spooky: TitleMetadata = { ...GOLDEN_GIRLS, genres: ['Horror'], keywords: ['ghost', 'haunting'] };

    const g = computeGeneralScore(spooky, null);
    const objective = g.standardScore ?? g.score;
    const report = buildVerdict({ meta: spooky, providers: null, personal: withRule });
    const canonical = canonicalScore({ objective, adjustments: report.personal.adjustments });

    expect(report.personal.adjustments.some((a) => a.points !== 0), 'the rule must actually fire').toBe(true);
    expect(report.personal.score, 'the engine and the contract agree once a rule fires').toBe(canonical.score);
    expect(canonical.personalized).toBe(true);
  });
});
