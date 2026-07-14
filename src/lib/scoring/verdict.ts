import type {
  ContentSignal,
  PersonalMatch,
  PrimaryCall,
  SimilarTitle,
  TitleMetadata,
  VerdictReport,
  VerdictTier,
  WatchlistDisposition,
  WatchProviders,
  WatchVerdictScore,
} from '@/lib/types';
import { computeGeneralScore } from './general';
import { computePersonalMatch, type PersonalContext } from './personal';
import { detectAllTraits } from './traits';

export interface BuildVerdictInput {
  meta: TitleMetadata;
  providers: WatchProviders | null;
  personal: PersonalContext;
  similar?: SimilarTitle[];
  /** ISO timestamp; injected for determinism/testability. */
  now?: string;
}

/** The headline call, derived from the personalized tier. */
export function primaryCallFromTier(tier: VerdictTier): PrimaryCall {
  switch (tier) {
    case 'Must Watch':
    case 'Strong Watch':
      return 'WATCH IT';
    case 'Worth Watching':
    case 'Possible Watch':
      return 'MAYBE';
    case 'Low Priority':
    case 'Skip':
    default:
      return 'SKIP IT';
  }
}

export function tierFromScore(score: number): VerdictTier {
  if (score >= 85) return 'Must Watch';
  if (score >= 75) return 'Strong Watch';
  if (score >= 65) return 'Worth Watching';
  if (score >= 50) return 'Possible Watch';
  if (score >= 35) return 'Low Priority';
  return 'Skip';
}

export function dispositionFromScore(score: number): WatchlistDisposition {
  if (score >= 72) return 'Strict Watchlist';
  if (score >= 50) return 'Possible Watchlist';
  return 'Skip';
}

const kwHas = (meta: TitleMetadata, patterns: string[]) =>
  meta.keywords.some((k) => patterns.some((p) => k.toLowerCase().includes(p)));

const genreHas = (meta: TitleMetadata, names: string[]) =>
  meta.genres.some((g) => names.includes(g.toLowerCase()));

function isMatureRating(rating: string | null): boolean {
  if (!rating) return false;
  return ['r', 'nc-17', 'tv-ma', '18', 'ma15+', 'x'].includes(
    rating.toLowerCase(),
  );
}

function buildContentSignals(meta: TitleMetadata): ContentSignal[] {
  const signals: ContentSignal[] = [];
  const mature = isMatureRating(meta.contentRating);
  const traits = detectAllTraits(meta);

  const violence = genreHas(meta, ['horror', 'war', 'crime', 'thriller'])
    ? kwHas(meta, ['graphic violence', 'brutal', 'gore'])
      ? 'high'
      : 'moderate'
    : genreHas(meta, ['action', 'action & adventure'])
      ? 'moderate'
      : 'unknown';
  signals.push({
    label: 'Violence',
    level: violence as ContentSignal['level'],
  });

  signals.push({
    label: 'Gore',
    level: kwHas(meta, ['gore', 'splatter', 'graphic violence'])
      ? 'high'
      : genreHas(meta, ['horror'])
        ? 'moderate'
        : 'unknown',
  });

  signals.push({
    label: 'Sex & Nudity',
    level: kwHas(meta, ['sex', 'nudity', 'erotic'])
      ? 'high'
      : mature
        ? 'moderate'
        : 'unknown',
  });

  signals.push({
    label: 'Language',
    level: mature ? 'moderate' : 'unknown',
  });

  signals.push({
    label: 'Drug Use',
    level: kwHas(meta, ['drug', 'addiction', 'cocaine', 'heroin'])
      ? 'moderate'
      : 'unknown',
  });

  signals.push({
    label: 'Disturbing Themes',
    level: kwHas(meta, ['torture', 'disturbing', 'graphic'])
      ? 'high'
      : genreHas(meta, ['horror', 'thriller'])
        ? 'moderate'
        : 'unknown',
  });

  signals.push({
    label: 'Supernatural Intensity',
    level: traits.supernatural.defining
      ? 'high'
      : traits.supernatural.present
        ? 'moderate'
        : 'none',
  });

  const slow = traits.slow_burn.defining;
  const brisk = genreHas(meta, ['action', 'thriller', 'action & adventure']);
  signals.push({
    label: 'Pacing',
    level: 'none',
    note: slow ? 'Deliberate / slow burn' : brisk ? 'Brisk' : 'Moderate',
  });

  signals.push({
    label: 'Mystery Complexity',
    level: 'none',
    note: traits.detective_mystery.present
      ? 'Puzzle-forward, rewards attention'
      : 'Standard',
  });

  signals.push({
    label: 'Humor',
    level: 'none',
    note: genreHas(meta, ['comedy'])
      ? 'Prominent'
      : 'Limited / situational',
  });

  return signals;
}

function buildReasonsFor(
  meta: TitleMetadata,
  general: WatchVerdictScore,
  personal: PersonalMatch,
  providers: WatchProviders | null,
): string[] {
  const reasons: string[] = [];
  for (const adj of personal.adjustments) {
    if (adj.points > 0) reasons.push(`${adj.label}: a strong personal match (+${adj.points}).`);
  }
  if (general.breakdown.audience >= 75 && general.sources[0]?.available) {
    reasons.push(`Well received by audiences (${general.sources[0]!.raw}).`);
  }
  if (general.breakdown.watchability >= 78) {
    reasons.push('Highly watchable — approachable format and easy to access.');
  }
  if (providers?.available && providers.options.length > 0) {
    reasons.push('Legal streaming or rental options are available in your region.');
  }
  if (general.confidence === 'high') {
    reasons.push('Backed by a large, reliable pool of audience data.');
  }
  if (reasons.length === 0) {
    reasons.push('Solid, middle-of-the-road option if the premise appeals to you.');
  }
  return reasons.slice(0, 6);
}

function buildReasonsAgainst(
  meta: TitleMetadata,
  general: WatchVerdictScore,
  personal: PersonalMatch,
  providers: WatchProviders | null,
): string[] {
  const reasons: string[] = [];
  for (const adj of personal.adjustments) {
    if (adj.points < 0) reasons.push(`${adj.label}: works against your taste (${adj.points}).`);
  }
  const runtime = meta.mediaType === 'movie' ? meta.runtimeMinutes ?? 0 : 0;
  if (runtime > 160) reasons.push(`Long runtime (${runtime} min) — a real time commitment.`);
  if (general.sources[0]?.available && general.breakdown.audience < 50) {
    reasons.push(`Mixed-to-poor audience reception (${general.sources[0]!.raw}).`);
  }
  if ((meta.status ?? '').toLowerCase().includes('cancel')) {
    reasons.push('Series was canceled — the story may be left unfinished.');
  }
  if (
    meta.originalLanguage &&
    meta.originalLanguage !== 'en' &&
    !meta.spokenLanguages.map((l) => l.toLowerCase()).includes('english')
  ) {
    reasons.push('Primarily non-English — expect subtitles or dubbing.');
  }
  if (general.confidence === 'low') {
    reasons.push('Limited data available — this verdict is lower confidence.');
  }
  if (providers && !providers.available) {
    reasons.push('No legal viewing option found for your region yet.');
  }
  if (reasons.length === 0) {
    reasons.push('No major red flags — mainly a question of whether the premise grabs you.');
  }
  return reasons.slice(0, 6);
}

function buildOneLiner(
  tier: VerdictTier,
  personal: PersonalMatch,
): string {
  const top = personal.adjustments[0];
  const topPos = personal.adjustments.find((a) => a.points > 0);
  const topNeg = personal.adjustments.find((a) => a.points < 0);
  switch (tier) {
    case 'Must Watch':
      return `A near-perfect match — ${topPos ? topPos.label.toLowerCase() + ' lands squarely in your wheelhouse.' : 'clear the schedule for this one.'}`;
    case 'Strong Watch':
      return `A strong recommendation${topPos ? ` thanks to ${topPos.label.toLowerCase()}` : ''} — move it up the list.`;
    case 'Worth Watching':
      return 'Worth your time when you are in the mood for it.';
    case 'Possible Watch':
      return `A maybe — ${topNeg ? topNeg.label.toLowerCase() + ' holds it back.' : 'depends on your mood.'}`;
    case 'Low Priority':
      return `Low priority${topNeg ? ` — ${topNeg.label.toLowerCase()} counts against it.` : ''}.`;
    case 'Skip':
    default:
      return `Probably a skip${topNeg ? ` — ${topNeg.label.toLowerCase()} is a dealbreaker for your taste.` : ' for you.'}`;
  }
}

export function buildVerdict(input: BuildVerdictInput): VerdictReport {
  const { meta, providers, personal } = input;
  const general = computeGeneralScore(meta, providers);
  const match = computePersonalMatch(meta, general.score, personal);
  const tier = tierFromScore(match.score);
  const disposition = dispositionFromScore(match.score);

  return {
    title: meta,
    general,
    personal: match,
    primaryCall: primaryCallFromTier(tier),
    tier,
    watchlistDisposition: disposition,
    oneLiner: buildOneLiner(tier, match),
    reasonsFor: buildReasonsFor(meta, general, match, providers),
    reasonsAgainst: buildReasonsAgainst(meta, general, match, providers),
    contentSignals: buildContentSignals(meta),
    providers,
    similar: input.similar ?? [],
    generatedAt: input.now ?? new Date().toISOString(),
  };
}
