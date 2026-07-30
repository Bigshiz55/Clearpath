/**
 * FINDER → EXPLANATION/HOUSEHOLD ASSEMBLY (pure, no I/O). Turns the facts the
 * finder ALREADY computes for each result (the deterministic verdict report,
 * the constraint receipts, provider data) into:
 *   1. the "Why this Verd1ct?" payload rendered on every result card, and
 *   2. the floor-weighted household verdict when several people are watching.
 *
 * Nothing here invents data: reasons come from the verdict report, evidence
 * comes from the same checks that filtered the candidate, and availability is
 * labelled "likely" (TMDB-listed), never "verified" — we have no independent
 * verification pipeline yet and refuse to claim one.
 */

import type { FinderQuery } from '@/lib/finder';
import type { TileRatings } from '@/lib/ratings';
import { explainVerdict, type VerdictExplanation } from '@/lib/verdictExplain';
import { householdVerdict, type HouseholdVerdict, type MemberScore } from '@/lib/householdVerdict';

export type { VerdictExplanation, HouseholdVerdict };

export interface ExplainFacts {
  matchScore: number;
  generalScore: number | null;
  /** Real per-title reasons from the deterministic verdict report. */
  reasonsFor: string[];
  reasonsAgainst: string[];
  ratings: TileRatings;
  /** Streaming service the result is shown with (null = none listed). */
  where: string | null;
  /** Whether `where` is one of the user's own services. */
  onUsersService: boolean;
  /** Facts observed while the candidate passed the hard filters. */
  meta: { mediaType: 'movie' | 'tv'; runtimeMinutes: number | null; year: number | null; englishAudio: boolean };
}

/** The hard requirements this query actually asked for, each with the evidence
 *  that the (already-filtered) result satisfies it. Pure mirror of the finder's
 *  own filter checks — a result can only get here by passing them. */
export function checkedRequirements(q: FinderQuery, f: ExplainFacts): { label: string; satisfied: boolean; evidence: string }[] {
  const reqs: { label: string; satisfied: boolean; evidence: string }[] = [];
  if (q.mediaType === 'movie' || q.mediaType === 'tv') {
    reqs.push({
      label: q.mediaType === 'movie' ? 'Movie' : 'Show',
      satisfied: f.meta.mediaType === q.mediaType,
      evidence: f.meta.mediaType === 'movie' ? 'feature film' : 'TV series',
    });
  }
  if (q.maxRuntime != null) {
    const rt = f.meta.runtimeMinutes;
    reqs.push({
      label: `Under ${q.maxRuntime} min`,
      satisfied: rt == null || rt <= q.maxRuntime,
      evidence: rt != null ? `${rt} min` : 'runtime not listed (TV per-episode rule)',
    });
  }
  if (q.providerIds && q.providerIds.length > 0) {
    reqs.push({
      label: 'On the requested service',
      satisfied: true,
      evidence: f.where ? `listed on ${f.where}` : 'in the provider-filtered pool',
    });
  }
  if (q.onMyServices) {
    reqs.push({ label: 'On your services', satisfied: f.onUsersService, evidence: f.where ? `on ${f.where}` : '—' });
  }
  if (q.englishAudioOnly) {
    reqs.push({ label: 'English audio', satisfied: f.meta.englishAudio, evidence: f.meta.englishAudio ? 'English track listed' : 'not listed' });
  }
  if (q.sinceMonths != null && f.meta.year != null) {
    reqs.push({ label: `Last ${Math.max(1, Math.round(q.sinceMonths / 12))} yr`, satisfied: true, evidence: String(f.meta.year) });
  }
  if (q.minImdb != null) {
    reqs.push({
      label: `IMDb ${q.minImdb.toFixed(1)}+`,
      satisfied: f.ratings.imdb != null && f.ratings.imdb >= q.minImdb,
      evidence: f.ratings.imdb != null ? `IMDb ${f.ratings.imdb.toFixed(1)}` : 'no IMDb rating',
    });
  }
  if (q.minAudience != null) {
    const aud = f.ratings.rtAudience ?? f.ratings.audience;
    reqs.push({
      label: `Audience ${q.minAudience}%+`,
      satisfied: aud != null && aud >= q.minAudience,
      evidence: aud != null ? `${aud}% audience` : 'no audience score',
    });
  }
  return reqs;
}

function ratingSourceCount(r: TileRatings): number {
  return [r.tomatometer, r.rtAudience ?? r.audience, r.imdb, r.metacritic].filter((v) => v != null).length;
}

/** Build the card's "Why this Verd1ct?" payload from real finder facts. */
export function buildItemExplanation(q: FinderQuery, f: ExplainFacts): VerdictExplanation {
  return explainVerdict({
    matchScore: f.matchScore,
    generalScore: f.generalScore,
    matchedTraits: f.reasonsFor.slice(0, 4),
    riskTraits: f.reasonsAgainst.slice(0, 3),
    requirements: checkedRequirements(q, f),
    ratingSourceCount: ratingSourceCount(f.ratings),
    availability: f.where
      ? { where: f.where, kind: 'included', confidence: 'likely' } // TMDB-listed = likely, never "verified"
      : null,
  });
}

/** Assemble the household verdict from the per-member scores the finder
 *  computed for one candidate. Ranking uses `.score` (floor-weighted). */
export function assembleHousehold(members: MemberScore[]): HouseholdVerdict {
  return householdVerdict(members);
}
