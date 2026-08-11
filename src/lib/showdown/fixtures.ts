import { DIMENSION_KEYS, type TitleDimensions } from '@/lib/scoring/dimensions';
import type { ShowdownTitle } from './matchup';

/**
 * A DETERMINISTIC POOL FOR THE DEV HARNESS AND BROWSER TESTS.
 *
 * Not production data and never served to a customer — `/dev/showdown` 404s in
 * production. It exists so a browser test can exercise layout, flow, and the
 * answer rules without depending on a live catalogue, on TMDB reachability, or
 * on which titles happen to have been classified today. A test that fails
 * because a discover query returned different films is testing TMDB, not this.
 *
 * The fingerprints are constructed to contain both shapes the planner must tell
 * apart: pairs that differ on one axis (a controlled comparison) and pairs that
 * differ on many (a confounded one). The titles are real films so the tiles read
 * naturally, but nothing here claims to be their true fingerprint — these are
 * fixture numbers, and no product surface reads them.
 */

function dims(overrides: Record<string, number>): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...overrides };
}

function t(
  key: string,
  title: string,
  year: number,
  overrides: Record<string, number>,
): ShowdownTitle {
  return { key, title, year, posterPath: null, mediaType: 'movie', dims: dims(overrides) };
}

export const FIXTURE_POOL: readonly ShowdownTitle[] = [
  // A near-controlled pair: pacing alone separates these two.
  t('movie:9001', 'The Long Road', 1974, { pacing: 8, attention: 62 }),
  t('movie:9002', 'Redline', 2011, { pacing: 92, attention: 60 }),
  // Another, on humour.
  t('movie:9003', 'Quiet Hours', 2016, { humor: 6, warmth: 55 }),
  t('movie:9004', 'The Understudy', 2019, { humor: 94, warmth: 58 }),
  // Confounded pairs: several axes move at once.
  t('movie:9005', 'Ash and Iron', 2008, { darkness: 90, violence: 85, humor: 10, complexity: 78, warmth: 12 }),
  t('movie:9006', 'Summer Kitchen', 2014, { darkness: 12, violence: 8, humor: 82, complexity: 24, warmth: 92 }),
  // Two that share bleakness but differ on pace — the "Neither" case.
  t('movie:9007', 'Winterlight', 1998, { darkness: 88, pacing: 12 }),
  t('movie:9008', 'The Undertow', 2021, { darkness: 90, pacing: 88 }),
  // Spread across the remaining axes so later rounds have somewhere to go.
  t('movie:9009', 'Cathedral', 2003, { complexity: 92, attention: 90, stakes: 30 }),
  t('movie:9010', 'Saturday Chase', 2017, { complexity: 10, attention: 14, stakes: 72 }),
  t('movie:9011', 'The Salt Line', 2012, { emotion: 92, character: 88 }),
  t('movie:9012', 'Orbital', 2020, { emotion: 10, character: 12, stakes: 94 }),
] as const;
