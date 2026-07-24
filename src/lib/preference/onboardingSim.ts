/**
 * Onboarding SIMULATION (pure, deterministic). Drives the finite calibration +
 * the two-metric model end-to-end for a single simulated user, so the whole
 * system can be validated over thousands of runs (PART 11). No I/O, no clock,
 * no Math.random — everything is seeded, so a report is reproducible.
 */
import {
  buildCalibrationPlan,
  calibrationProgress,
  calibrationInvariants,
  CALIBRATION_SIZE,
  CAPS,
  type CalCandidate,
  type CalGenre,
} from './calibration';
import { computeDnaConfidence, emptyTally, type DnaSignalTally } from './dnaConfidence';

/** Tiny seeded PRNG (mulberry32) — deterministic, good enough for sampling. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_GENRES: CalGenre[] = [
  'drama', 'comedy', 'crime', 'thriller', 'action', 'mystery', 'romance',
  'scifi', 'fantasy', 'horror', 'documentary', 'reality', 'soap', 'family', 'animation',
];

export type Scenario = 'broad' | 'animeFlood' | 'realityHeavy' | 'genreSpike' | 'thin';

/** Build a candidate pool for a scenario — deliberately varied and often skewed. */
export function makePool(seed: number, scenario: Scenario): CalCandidate[] {
  const r = rng(seed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)]!;
  const size = scenario === 'thin' ? 22 : 60 + Math.floor(r() * 40);
  const pool: CalCandidate[] = [];

  // Guarantee the rare-but-required buckets exist (as the real sourcing plan does),
  // except in 'thin' where scarcity is the point.
  const seeded: CalCandidate[] =
    scenario === 'thin'
      ? []
      : [
          { key: 'seed:reality1', mediaType: 'tv', genres: ['reality'], year: 2021, country: 'US' },
          { key: 'seed:doc1', mediaType: 'movie', genres: ['documentary'], year: 2019, country: 'US' },
          { key: 'seed:soap1', mediaType: 'tv', genres: ['soap'], year: 2018, country: 'US' },
          { key: 'seed:anime1', mediaType: 'tv', genres: ['animation'], year: 2016, country: 'JP', anime: true },
          { key: 'seed:hallmark1', mediaType: 'movie', genres: ['romance', 'family'], year: 2020, country: 'US', hallmark: true },
          { key: 'seed:intl1', mediaType: 'tv', genres: ['drama'], year: 2019, country: 'KR' },
          { key: 'seed:intl2', mediaType: 'movie', genres: ['drama'], year: 2018, country: 'ES' },
          { key: 'seed:old1', mediaType: 'movie', genres: ['thriller'], year: 1985, country: 'US', prestige: true },
          { key: 'seed:old2', mediaType: 'movie', genres: ['scifi'], year: 1979, country: 'US' },
          { key: 'seed:old3', mediaType: 'tv', genres: ['comedy'], year: 1995, country: 'US' },
        ];
  pool.push(...seeded);

  for (let i = 0; i < size; i++) {
    let genre: CalGenre;
    if (scenario === 'animeFlood') genre = r() < 0.6 ? 'animation' : pick(ALL_GENRES);
    else if (scenario === 'realityHeavy') genre = r() < 0.5 ? 'reality' : pick(ALL_GENRES);
    else if (scenario === 'genreSpike') genre = r() < 0.55 ? 'action' : pick(ALL_GENRES);
    else genre = pick(ALL_GENRES);

    const isAnime = genre === 'animation' && r() < 0.7;
    pool.push({
      key: `t:${scenario}:${i}`,
      mediaType: r() < 0.5 ? 'movie' : 'tv',
      genres: [genre],
      year: r() < 0.25 ? 1970 + Math.floor(r() * 30) : 2006 + Math.floor(r() * 18),
      country: r() < 0.2 ? pick(['JP', 'KR', 'ES', 'FR']) : 'US',
      anime: isAnime,
    });
  }
  return pool;
}

export interface SimResult {
  scenario: Scenario;
  planSize: number;
  answered: number;
  quizPercent: number;
  dnaConfidenceOnboardingOnly: number;
  dnaConfidenceEngaged: number;
  animeCount: number;
  maxGenre: number;
  movies: number;
  tv: number;
  international: number;
  duplicates: boolean;
  capViolations: string[];
  /** All the hard checks — every one must be true. */
  checks: {
    endsAtMost20: boolean;
    quizReaches100WhenFull: boolean;
    confidenceLE100: boolean;
    confidenceIndependent: boolean;
    animeCapped: boolean;
    noGenreDominates: boolean;
    noDuplicates: boolean;
    confidenceGrowsWithSignals: boolean;
  };
}

/** Run one full simulated onboarding for a seed + scenario. */
export function simulateOnboarding(seed: number, scenario: Scenario): SimResult {
  const pool = makePool(seed, scenario);
  const plan = buildCalibrationPlan(pool);
  const r = plan.report;

  // The user answers every planned title (the finite set). Progress is answered/20.
  const answered = plan.items.length;
  const progress = calibrationProgress(answered);

  // DNA Confidence with ONLY onboarding answers.
  const onboardingTally: DnaSignalTally = { ...emptyTally(), calibrationAnswers: answered };
  const confOnboarding = computeDnaConfidence(onboardingTally).percent;

  // DNA Confidence after further, diverse engagement (should be higher).
  const rnd = rng(seed ^ 0x9e3779b9);
  const engagedTally: DnaSignalTally = {
    ...onboardingTally,
    watched: 3 + Math.floor(rnd() * 8),
    ratings: 3 + Math.floor(rnd() * 8),
    saved: 2 + Math.floor(rnd() * 6),
    completed: 2 + Math.floor(rnd() * 5),
    corrections: Math.floor(rnd() * 4),
    recsAccepted: 2 + Math.floor(rnd() * 6),
    recsRejected: 1 + Math.floor(rnd() * 5),
    packAnswers: Math.floor(rnd() * 8),
    searches: Math.floor(rnd() * 6),
  };
  const confEngaged = computeDnaConfidence(engagedTally).percent;

  const maxGenre = Object.values(r.perGenre).reduce((m, n) => Math.max(m, n), 0);
  const duplicates = new Set(plan.items.map((i) => i.key)).size !== plan.items.length;
  const capViolations = calibrationInvariants(plan, false);
  const poolBroad = scenario !== 'thin';

  const checks = {
    endsAtMost20: plan.items.length <= CALIBRATION_SIZE,
    // A broad pool must reach a full 20 → Quiz Progress 100%.
    quizReaches100WhenFull: !poolBroad || (answered === CALIBRATION_SIZE && progress.percent === 100),
    confidenceLE100: confOnboarding <= 100 && confEngaged <= 100,
    // Independent: never equal to Quiz Progress when full (100 vs ~60).
    confidenceIndependent: !poolBroad || confOnboarding !== progress.percent,
    animeCapped: r.anime <= CAPS.anime,
    noGenreDominates: maxGenre <= CAPS.perGenre,
    noDuplicates: !duplicates,
    confidenceGrowsWithSignals: confEngaged >= confOnboarding,
  };

  return {
    scenario,
    planSize: plan.items.length,
    answered,
    quizPercent: progress.percent,
    dnaConfidenceOnboardingOnly: confOnboarding,
    dnaConfidenceEngaged: confEngaged,
    animeCount: r.anime,
    maxGenre,
    movies: r.movies,
    tv: r.tv,
    international: r.international,
    duplicates,
    capViolations,
    checks,
  };
}

export interface SimAggregate {
  runs: number;
  scenarios: Record<Scenario, number>;
  failures: { seed: number; scenario: Scenario; failed: string[] }[];
  avgConfidenceOnboarding: number;
  avgConfidenceEngaged: number;
  avgQuizPercentBroad: number;
  maxAnimeSeen: number;
  maxGenreSeen: number;
  allPassed: boolean;
}

/** Run N simulations across all scenarios and aggregate the results. */
export function runSimulations(runs: number, baseSeed = 1): SimAggregate {
  const scenarios: Scenario[] = ['broad', 'animeFlood', 'realityHeavy', 'genreSpike', 'thin'];
  const counts = { broad: 0, animeFlood: 0, realityHeavy: 0, genreSpike: 0, thin: 0 } as Record<Scenario, number>;
  const failures: SimAggregate['failures'] = [];
  let sumOn = 0, sumEng = 0, sumQuizBroad = 0, broadN = 0, maxAnime = 0, maxGenre = 0;

  for (let i = 0; i < runs; i++) {
    const scenario = scenarios[i % scenarios.length]!;
    const seed = baseSeed + i * 2654435761;
    const res = simulateOnboarding(seed, scenario);
    counts[scenario] += 1;
    sumOn += res.dnaConfidenceOnboardingOnly;
    sumEng += res.dnaConfidenceEngaged;
    if (scenario !== 'thin') { sumQuizBroad += res.quizPercent; broadN += 1; }
    maxAnime = Math.max(maxAnime, res.animeCount);
    maxGenre = Math.max(maxGenre, res.maxGenre);
    const failed = Object.entries(res.checks).filter(([, ok]) => !ok).map(([k]) => k);
    if (failed.length || res.capViolations.length) {
      failures.push({ seed, scenario, failed: [...failed, ...res.capViolations] });
    }
  }

  return {
    runs,
    scenarios: counts,
    failures,
    avgConfidenceOnboarding: sumOn / runs,
    avgConfidenceEngaged: sumEng / runs,
    avgQuizPercentBroad: broadN ? sumQuizBroad / broadN : 0,
    maxAnimeSeen: maxAnime,
    maxGenreSeen: maxGenre,
    allPassed: failures.length === 0,
  };
}
