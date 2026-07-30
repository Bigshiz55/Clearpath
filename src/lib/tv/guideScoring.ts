/**
 * PER-PROGRAMME SCORING FOR THE GUIDE — the pure half.
 *
 * Channel identity ranks the dial ("Investigation Discovery is true crime");
 * this layer ranks what is actually PLAYING: resolve a programme to its title,
 * run the same deterministic engine that scores every card, and let "NCIS on
 * USA right now suits you 76" outrank the channel it happens to be on.
 *
 * The I/O lives in `scoreGuide.ts` (server-only). What lives HERE is every
 * decision that needs a test:
 *
 *  - WHICH programmes get the budget. A window can hold ~500 airings and the
 *    budget is ~40 scorings, so the order of spend is the product decision:
 *    what is ON NOW first (it is what the guide leads with), then what starts
 *    soonest. One spend per distinct title — a movie airing on two channels
 *    is one resolution, and the engine's own caches carry the rest.
 *
 *  - HOW a score and a channel affinity combine into one rank. Different
 *    scales (a 0–100 match vs ±20 rule weights), one rule: a REAL programme
 *    score speaks for itself; affinity only nudges around the neutral
 *    baseline when no programme score exists. No signal at all = the neutral
 *    baseline = the alphabetical guide, unchanged.
 *
 * Pure. No I/O, no clock — `nowMs` comes in.
 */
import type { Airing } from '@/lib/onTv';
import type { ChannelRow } from '@/lib/tv/channelGuide';

/** Scorings per request. Cached hydrations make repeat visits nearly free;
 *  this caps the cold-cache worst case. */
export const SCORE_BUDGET = 40;

/** The engine's neutral midpoint — what "no opinion" scores. */
export const NEUTRAL = 55;

const startOf = (a: Airing) => Date.parse(a.airstamp);

function isOnNow(a: Airing, nowMs: number): boolean {
  const start = startOf(a);
  if (!Number.isFinite(start) || a.runtime == null || a.runtime <= 0) return false;
  return start <= nowMs && nowMs < start + a.runtime * 60_000;
}

const titleKey = (a: Airing) => `${a.showType === 'Movie' ? 'movie' : 'tv'}|${a.showName.trim().toLowerCase()}`;

/**
 * The airings worth spending the budget on, in spend order: on-now first
 * (soonest-ending first is irrelevant — any order within the group is fine,
 * keep start ascending for determinism), then upcoming by start. One per
 * distinct title; untitled listings are never worth a lookup.
 */
export function pickScoringCandidates(airings: readonly Airing[], nowMs: number, budget = SCORE_BUDGET): Airing[] {
  const seen = new Set<string>();
  const now: Airing[] = [];
  const later: Airing[] = [];
  const sorted = [...airings].sort((a, b) => startOf(a) - startOf(b));
  for (const a of sorted) {
    if (!a.showName || a.showName === 'Untitled') continue;
    const key = titleKey(a);
    if (seen.has(key)) continue;
    if (isOnNow(a, nowMs)) {
      seen.add(key);
      now.push(a);
    } else if (startOf(a) > nowMs) {
      seen.add(key);
      later.push(a);
    }
  }
  return [...now, ...later].slice(0, Math.max(0, budget));
}

/**
 * Spread a scored title's match onto EVERY airing of that title in the window
 * — the two channels showing the same movie both earned the number.
 */
export function applyScores(
  airings: readonly Airing[],
  scores: ReadonlyMap<string, { tmdbId: number; mediaType: 'movie' | 'tv'; match: number; why?: string | null }>,
): Airing[] {
  return airings.map((a) => {
    const s = scores.get(titleKey(a));
    return s ? { ...a, tmdbId: s.tmdbId, mediaType: s.mediaType, match: s.match, matchWhy: s.why ?? null } : a;
  });
}

export interface ScoreDistribution {
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** True when the middle half of the guide sits above 65 — the badge scale is
   *  compressed and "Your 71" vs "Your 68" is telling the user nothing. */
  compressed: boolean;
}

/**
 * THE SCALE AUDIT. A score only informs when it discriminates: if the median
 * guide match is above 65, most of the dial is printing roughly the same
 * number and the badge has stopped carrying information. This measures the
 * spread of one guide fetch so the server can log it on every scored request
 * — the recalibration decision needs the LIVE distribution (real users, real
 * schedules), which no fixture can stand in for, so the honest sandbox
 * deliverable is the instrument plus the trigger condition, not a blind
 * rescale of the deterministic engine's output.
 */
export function scoreDistribution(scores: readonly number[]): ScoreDistribution | null {
  if (scores.length === 0) return null;
  const s = [...scores].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!;
  const median = at(0.5);
  return { n: s.length, min: s[0]!, q1: at(0.25), median, q3: at(0.75), max: s[s.length - 1]!, compressed: median > 65 };
}

/** The map key `applyScores` expects — exported so the server half agrees. */
export function scoreKeyFor(a: Airing): string {
  return titleKey(a);
}

/**
 * One rank number per channel row: the programme's own match when the engine
 * produced one, else the neutral baseline nudged by channel affinity. Clamped
 * so affinity can never counterfeit a strong real score.
 */
export function guideRankScore(row: ChannelRow & { affinity?: number }): number {
  const onNowMatch = row.onNow?.match;
  if (onNowMatch != null) return onNowMatch;
  const upNextMatch = row.upNext.map((a) => a.match).filter((m): m is number => m != null);
  if (upNextMatch.length > 0) return Math.max(...upNextMatch);
  const affinity = row.affinity ?? 0;
  return Math.min(90, Math.max(10, NEUTRAL + affinity));
}
