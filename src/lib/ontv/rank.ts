/**
 * On TV ranking — PURE. Enforces the mandated order: HARD schedule constraints are
 * applied BEFORE personalized Your Match, and a high match can NEVER resurrect a
 * candidate that failed a hard filter (requested channel/time/type, runtime limit,
 * new-episode / availability requirement). Cold-start users get a transparent
 * general-quality blend, clearly labelled. Household requests use a min-weighted
 * group score (never a plain average).
 */
import type { Program, Channel, Airing, ScheduleQuery, VerdictBand, MatchExplanation, AiringStatus } from './types';
import { DEFAULT_EXCLUDED_EVENT_TYPES, isSportsProgram, isSportsChannel } from './sports';
import { airingStatus, inDateScope, hhmmToMinutes, localParts } from './time';
import { hasEnglishAudio } from '@/lib/lang/international';

export interface TasteProfile {
  id: string;
  sampleSize: number;                    // how much rating history exists
  genreAffinity: Record<string, number>; // genre → -1..1
  dislikedGenres: string[];
  favoriteNetworks: string[];
  englishOnly?: boolean;
}

export interface Candidate { airing: Airing; program: Program; channel: Channel }
export interface RankContext { now: number; tz: string; userChannelIds: Set<string>; userProviderIds: Set<string> }

const FAMILY_UNSAFE = new Set(['horror', 'erotica', 'adult']);
const NEWS_GENRES = new Set(['news']);
const REALITY_GENRES = new Set(['reality', 'reality-tv']);

/** Apply HARD constraints. A candidate that fails ANY is removed — personalization
 *  runs only on survivors. Returns the valid subset (order preserved). */
export function applyHardFilters(items: Candidate[], q: ScheduleQuery, ctx: RankContext): Candidate[] {
  const excluded = new Set<string>([...DEFAULT_EXCLUDED_EVENT_TYPES, ...q.eventTypesExclude]);
  return items.filter(({ airing, program, channel }) => {
    // Sports never appear this phase.
    if (isSportsProgram(program) || isSportsChannel(channel)) return false;
    if (excluded.has(program.eventType)) return false;
    // Media type
    if (q.mediaTypes.length && !q.mediaTypes.includes(program.mediaType)) return false;
    // Network / channel request
    if (q.networks.length) {
      const net = `${channel.network ?? ''} ${channel.callSign} ${channel.name}`.toLowerCase();
      if (!q.networks.some((n) => net.includes(n.toLowerCase()))) return false;
    }
    // Availability scope
    if (q.availabilityScope === 'user_channels' && !ctx.userChannelIds.has(channel.id)) return false;
    if (q.availabilityScope === 'user_services' && !channel.providerIds.some((p) => ctx.userProviderIds.has(p))) return false;
    if (q.availabilityScope === 'free' && !(airing.onDemandAvailable || channel.providerIds.length === 0)) {
      // "free to me" ≈ OTA / no extra charge; keep OTA (no provider gating) + on-demand-free.
    }
    // Time window
    if (!inDateScope(airing, q.dateScope, ctx.now, ctx.tz)) return false;
    const st = localParts(Date.parse(airing.startAt), ctx.tz).minutesOfDay;
    if (q.startTimeMin && st < hhmmToMinutes(q.startTimeMin)) return false;
    if (q.startTimeMax && st > hhmmToMinutes(q.startTimeMax)) return false;
    if (q.withinMinutes != null) {
      const mins = airingStatus(airing, ctx.now).minutesUntilStart;
      if (mins < -0 || mins > q.withinMinutes) return false;
    }
    // Content-type hard rules
    if (q.newOnly && !airing.isNew) return false;
    if (q.noReruns && airing.isRepeat) return false;
    if (q.noNews && program.genres.some((g) => NEWS_GENRES.has(g.toLowerCase()))) return false;
    if (q.noReality && program.genres.some((g) => REALITY_GENRES.has(g.toLowerCase()))) return false;
    if (q.familyFriendly && program.genres.some((g) => FAMILY_UNSAFE.has(g.toLowerCase()))) return false;
    if (q.noHorror && program.genres.some((g) => g.toLowerCase() === 'horror')) return false;
    if (q.maxRuntime != null && program.runtime != null && program.runtime > q.maxRuntime) return false;
    // English audio = a VERIFIED English AUDIO TRACK (never "originally English").
    // A foreign-original title WITH an English dub passes; a subtitle-only title is
    // excluded. Foreign original language is NEVER itself a reason to exclude.
    if (q.englishAudioOnly && program.availableAudioLanguages.length > 0 && !hasEnglishAudio(program)) return false;
    return true;
  });
}

/** Program quality 0..100 from whatever ratings exist (fallback neutral). */
export function qualityScore(p: Program): number {
  const r = p.ratings ?? {};
  const parts: number[] = [];
  if (r.imdb != null) parts.push(r.imdb * 10);
  if (r.rt != null) parts.push(r.rt);
  if (r.audience != null) parts.push(r.audience);
  if (!parts.length) return 55;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** Your Match 0..100 for one profile. Cold-start → general-quality blend (flagged). */
export function yourMatch(p: Program, channel: Channel, taste: TasteProfile): { score: number; explanation: MatchExplanation } {
  const quality = qualityScore(p);
  const genres = p.genres.map((g) => g.toLowerCase());
  const affinities = genres.map((g) => taste.genreAffinity[g] ?? 0);
  const avgAffinity = affinities.length ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;
  const confidence = Math.max(0, Math.min(1, taste.sampleSize / 20));
  const disliked = genres.some((g) => taste.dislikedGenres.includes(g));
  const networkBonus = channel.network && taste.favoriteNetworks.includes(channel.network) ? 5 : 0;

  let score = quality + confidence * (25 * avgAffinity) + networkBonus;
  const reasons: string[] = [];
  if (disliked) { score -= 30; reasons.push('Contains a genre you usually skip'); }
  if (confidence >= 0.4 && avgAffinity > 0.2) reasons.push('Matches genres you enjoy');
  if (networkBonus) reasons.push(`On ${channel.network}, a channel you watch`);
  if (quality >= 75) reasons.push('Highly rated');
  const generalQuality = confidence < 0.4;
  if (generalQuality) reasons.push('Based on general quality, not your taste yet');

  return { score: Math.round(Math.max(0, Math.min(100, score))), explanation: { generalQuality, reasons } };
}

export function verdictBand(score: number): VerdictBand {
  if (score >= 70) return 'stream';
  if (score >= 50) return 'maybe';
  return 'skip';
}

export interface Ranked extends Candidate { matchScore: number; verdict: VerdictBand; explanation: MatchExplanation; status: AiringStatus }

/** Full pipeline: hard filters → Your Match → minMatch gate → sort. */
export function rankAirings(items: Candidate[], q: ScheduleQuery, ctx: RankContext, taste: TasteProfile): Ranked[] {
  const valid = applyHardFilters(items, q, ctx);
  let ranked: Ranked[] = valid.map((c) => {
    const m = yourMatch(c.program, c.channel, taste);
    return { ...c, matchScore: m.score, verdict: verdictBand(m.score), explanation: m.explanation, status: airingStatus(c.airing, ctx.now) };
  });
  // minMatch is a hard result constraint — applied to the SCORE, still never lets a
  // schedule-invalid item through (those were already dropped).
  if (q.minMatch != null) ranked = ranked.filter((r) => r.matchScore >= q.minMatch!);
  const sort = q.sort;
  ranked.sort((a, b) => {
    if (sort === 'start_time') return Date.parse(a.airing.startAt) - Date.parse(b.airing.startAt);
    if (sort === 'quality') return qualityScore(b.program) - qualityScore(a.program);
    // personalized_match: match desc, then sooner start.
    return b.matchScore - a.matchScore || Date.parse(a.airing.startAt) - Date.parse(b.airing.startAt);
  });
  return ranked;
}

// ── Household matching ──────────────────────────────────────────────────────
export interface HouseholdResult { score: number; label: string; perProfile: { id: string; score: number }[]; blockedBy: string[] }

/**
 * Group score for a shared watch. NOT a plain average: the lowest individual match
 * dominates (nobody should be dragged into something they'll dislike), a strong
 * dislike from anyone is a hard veto, and shared enthusiasm lifts the compromise.
 */
export function householdScore(p: Program, channel: Channel, profiles: TasteProfile[]): HouseholdResult {
  const per = profiles.map((t) => ({ id: t.id, ...yourMatch(p, channel, t), disliked: p.genres.some((g) => t.dislikedGenres.includes(g.toLowerCase())) }));
  const scores = per.map((x) => x.score);
  const min = Math.min(...scores), mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const blockedBy = per.filter((x) => x.disliked).map((x) => x.id);
  // Min-weighted compromise; a veto floors the group score.
  let score = Math.round(0.65 * min + 0.35 * mean);
  if (blockedBy.length) score = Math.min(score, 35);
  return { score, label: 'Household Match', perProfile: per.map((x) => ({ id: x.id, score: x.score })), blockedBy };
}
