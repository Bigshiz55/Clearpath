/**
 * STAGE 5 (diversification) and STAGE 6 (court assembly) — pure, no I/O.
 *
 * Diversification is maximal marginal relevance plus explicit caps. MMR alone
 * drifts: it will happily take a second film from the same franchise if the
 * vectors differ enough. Caps alone are blunt: they cannot tell "similar" from
 * "identical". Together, MMR handles the continuum and caps handle the
 * categorical facts (franchise, director, sequel).
 *
 * The rule that keeps this honest: relevance has a floor. A candidate is never
 * displaced by one that is clearly worse merely to add variety, which is the
 * failure mode that makes diversified lists feel random.
 */

import { DIVERSITY, RANKING_VERSION } from './config';
import { cosine } from './embedding';
import type { SynthTitle } from './synthCatalog';
import type { DeepScored } from './rank';
import { COURT_SIZES, type CourtSize } from '@/lib/court/pool';

export interface DiversityConfig {
  lambda: number;
  maxPerFranchise: number;
  maxPerLeadPerformer: number;
  maxPerDirector: number;
  maxSequels: number;
  /** Above this cosine, two titles are treated as near-duplicates. */
  nearDuplicateAt: number;
  /** A candidate may not be displaced by one scoring this much lower. */
  relevanceFloorRatio: number;
}

export const DIVERSITY_CONFIG: DiversityConfig = {
  lambda: DIVERSITY.lambda,
  maxPerFranchise: DIVERSITY.maxPerFranchise,
  maxPerLeadPerformer: DIVERSITY.maxPerLeadPerformer,
  maxPerDirector: 2,
  maxSequels: 2,
  nearDuplicateAt: 0.92,
  relevanceFloorRatio: 0.55,
};

export interface DiversifiedItem {
  id: string;
  score: number;
  /** Why it survived. */
  retainedBecause: string;
  /** What it was penalised for, if anything. */
  penalisedFor: string[];
  /** Which axis it contributes that the set did not already have. */
  addsDimension: string[];
  /** The already-selected title it was closest to. */
  closestTo: string | null;
  closestSimilarity: number;
  rank: number;
}

export interface DiversifyResult {
  selected: DiversifiedItem[];
  /** Rejections, with the reason — needed to answer "why isn't X here?". */
  rejected: { id: string; reason: string; closestTo: string | null }[];
  config: DiversityConfig;
  rankingVersion: string;
}

/**
 * Closest already-selected title. ONE implementation, used by both the
 * selection loop and the rejection-reason loop — when those two disagreed, a
 * near-duplicate was correctly dropped but reported as merely "lower ranked".
 *
 * `maxSim` starts at -Infinity, not 0: fixture cosines are genuinely negative
 * for unrelated titles, and initialising at 0 silently discarded the closest
 * match whenever every similarity was below zero.
 */
function closestSelected(
  t: SynthTitle,
  selected: { id: string }[],
  titles: Map<string, SynthTitle>,
): { closestTo: string | null; sim: number } {
  let maxSim = -Infinity;
  let closest: string | null = null;
  for (const s of selected) {
    const st = titles.get(s.id);
    if (!st) continue;
    // Identical title text one year apart is a duplicate whatever the vectors say.
    const textDup = st.title === t.title && Math.abs((st.releaseYear ?? 0) - (t.releaseYear ?? 0)) <= 1;
    const effective = textDup ? 1 : cosine(t.vector.values, st.vector.values);
    if (effective > maxSim) { maxSim = effective; closest = s.id; }
  }
  return { closestTo: closest, sim: maxSim === -Infinity ? 0 : maxSim };
}

const decadeOf = (t: SynthTitle) => (t.releaseYear == null ? 'unknown' : `${Math.floor(t.releaseYear / 10) * 10}s`);
const runtimeBand = (t: SynthTitle) =>
  t.runtimeMinutes == null ? 'unknown' : t.runtimeMinutes < 95 ? 'short' : t.runtimeMinutes < 130 ? 'medium' : 'long';
const mainstreamBand = (t: SynthTitle) => {
  const m = t.features.mainstream;
  return m == null ? 'unknown' : m > 0.66 ? 'mainstream' : m > 0.33 ? 'middle' : 'discovery';
};

/**
 * STAGE 5. `count` semifinalists from the deep-ranked set, varied across genre,
 * mood, decade, runtime, mainstream position, cast, director and franchise.
 */
export function diversify(
  titles: Map<string, SynthTitle>,
  ranked: DeepScored[],
  count: number,
  cfg: DiversityConfig = DIVERSITY_CONFIG,
): DiversifyResult {
  const selected: DiversifiedItem[] = [];
  const rejected: DiversifyResult['rejected'] = [];
  const pool = [...ranked];
  if (pool.length === 0) return { selected, rejected, config: cfg, rankingVersion: RANKING_VERSION };

  const topScore = pool[0]!.finalPreDiversityScore;
  const floor = topScore * cfg.relevanceFloorRatio;

  const usedFranchise = new Map<string, number>();
  const usedPerformer = new Map<string, number>();
  const usedDirector = new Map<string, number>();
  const seenAxes = { genre: new Set<string>(), decade: new Set<string>(), runtime: new Set<string>(), mainstream: new Set<string>() };
  let sequelCount = 0;

  while (selected.length < count && pool.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;
    let bestMeta: { closestTo: string | null; sim: number } = { closestTo: null, sim: 0 };

    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i]!;
      const t = titles.get(cand.id);
      if (!t) continue;

      // --- categorical caps: hard, and reported ---
      if (t.franchise && (usedFranchise.get(t.franchise) ?? 0) >= cfg.maxPerFranchise) continue;
      if (t.director && (usedDirector.get(t.director) ?? 0) >= cfg.maxPerDirector) continue;
      if (t.leadPerformers.some((p) => (usedPerformer.get(p) ?? 0) >= cfg.maxPerLeadPerformer)) continue;
      if (t.sequelOf && sequelCount >= cfg.maxSequels) continue;

      // --- similarity to what is already chosen ---
      const { closestTo: closest, sim: maxSim } = closestSelected(t, selected, titles);
      if (maxSim >= cfg.nearDuplicateAt) continue;

      // MMR: relevance traded against redundancy.
      const mmr = cfg.lambda * cand.finalPreDiversityScore - (1 - cfg.lambda) * maxSim;
      // The relevance floor: never take something clearly worse for variety.
      if (cand.finalPreDiversityScore < floor && selected.length > 0) continue;

      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = i;
        bestMeta = { closestTo: closest, sim: maxSim };
      }
    }

    if (bestIdx === -1) break; // nothing else is admissible
    const chosen = pool.splice(bestIdx, 1)[0]!;
    const t = titles.get(chosen.id)!;

    const adds: string[] = [];
    const primaryGenre = t.genres[0] ?? 'unknown';
    if (!seenAxes.genre.has(primaryGenre)) adds.push(`genre:${primaryGenre}`);
    if (!seenAxes.decade.has(decadeOf(t))) adds.push(`decade:${decadeOf(t)}`);
    if (!seenAxes.runtime.has(runtimeBand(t))) adds.push(`runtime:${runtimeBand(t)}`);
    if (!seenAxes.mainstream.has(mainstreamBand(t))) adds.push(`reach:${mainstreamBand(t)}`);

    seenAxes.genre.add(primaryGenre);
    seenAxes.decade.add(decadeOf(t));
    seenAxes.runtime.add(runtimeBand(t));
    seenAxes.mainstream.add(mainstreamBand(t));
    if (t.franchise) usedFranchise.set(t.franchise, (usedFranchise.get(t.franchise) ?? 0) + 1);
    if (t.director) usedDirector.set(t.director, (usedDirector.get(t.director) ?? 0) + 1);
    for (const p of t.leadPerformers) usedPerformer.set(p, (usedPerformer.get(p) ?? 0) + 1);
    if (t.sequelOf) sequelCount += 1;

    selected.push({
      id: chosen.id,
      score: chosen.finalPreDiversityScore,
      retainedBecause: selected.length === 0
        ? 'highest ranked overall'
        : adds.length > 0 ? `adds ${adds.join(', ')}` : 'strong score with acceptable overlap',
      penalisedFor: bestMeta.sim > 0.7 ? [`similar to ${bestMeta.closestTo}`] : [],
      addsDimension: adds,
      closestTo: bestMeta.closestTo,
      closestSimilarity: Math.round(bestMeta.sim * 1000) / 1000,
      rank: selected.length + 1,
    });
  }

  // Everything left over, with why it did not make the cut.
  for (const leftover of pool) {
    const t = titles.get(leftover.id);
    let reason = 'lower ranked';
    let closest: string | null = null;
    if (t) {
      if (t.franchise && (usedFranchise.get(t.franchise) ?? 0) >= cfg.maxPerFranchise) reason = `franchise cap (${t.franchise})`;
      else if (t.director && (usedDirector.get(t.director) ?? 0) >= cfg.maxPerDirector) reason = `director cap (${t.director})`;
      else if (leftover.finalPreDiversityScore < floor) reason = 'below relevance floor';
      else {
        const near = closestSelected(t, selected, titles);
        if (near.sim >= cfg.nearDuplicateAt) { reason = 'near-duplicate'; closest = near.closestTo; }
      }
    }
    rejected.push({ id: leftover.id, reason, closestTo: closest });
  }

  return { selected, rejected, config: cfg, rankingVersion: RANKING_VERSION };
}

// =========================================================== STAGE 6 =========

export interface CourtSlot {
  id: string;
  role: 'active' | 'reserve';
  rank: number;
  /** Lower number = promoted sooner. */
  replacementPriority: number;
  score: number;
  reason: string;
  addsDimension: string[];
}

export interface AssembledCourt {
  size: CourtSize;
  active: CourtSlot[];
  reserve: CourtSlot[];
  /** Set when the pool could not fill the requested size. */
  shortfall: number;
  shortfallReason: string | null;
  rankingVersion: string;
}

/**
 * STAGE 6. Active and reserve are INTERLEAVED from the diversified list rather
 * than split top/bottom: taking the top 6 as active and the next 6 as reserve
 * would guarantee the reserve is the weaker half, which is exactly what the
 * brief forbids. Alternating keeps both halves comparable in quality and in
 * variety, so a veto replacement is a peer, not a leftover.
 */
export function assembleCourt(
  diversified: DiversifiedItem[],
  size: CourtSize,
): AssembledCourt {
  const spec = COURT_SIZES[size];
  const take = diversified.slice(0, spec.total);
  const active: CourtSlot[] = [];
  const reserve: CourtSlot[] = [];

  take.forEach((item, i) => {
    const slot: CourtSlot = {
      id: item.id,
      role: i % 2 === 0 ? 'active' : 'reserve',
      rank: i + 1,
      replacementPriority: Math.floor(i / 2) + 1,
      score: item.score,
      reason: item.retainedBecause,
      addsDimension: item.addsDimension,
    };
    (slot.role === 'active' ? active : reserve).push(slot);
  });

  // Interleaving can leave the halves uneven when the pool is short; move the
  // surplus so `active` is filled first — a short reserve is far better than a
  // short tray.
  while (active.length > spec.active && reserve.length < spec.total - spec.active) {
    const moved = active.pop()!;
    reserve.push({ ...moved, role: 'reserve' });
  }
  while (reserve.length > spec.total - spec.active && active.length < spec.active) {
    const moved = reserve.shift()!;
    active.push({ ...moved, role: 'active' });
  }

  const shortfall = spec.total - take.length;
  return {
    size,
    active,
    reserve,
    shortfall: Math.max(0, shortfall),
    shortfallReason: shortfall > 0
      ? `Only ${take.length} of ${spec.total} candidates survived filtering and diversification.`
      : null,
    rankingVersion: RANKING_VERSION,
  };
}

export type RemovalReason = 'veto' | 'seen_it' | 'unavailable' | 'duplicate';

export interface ReplacementOutcome {
  court: AssembledCourt;
  promoted: CourtSlot | null;
  /** True when no reserve remained. */
  exhausted: boolean;
  /** Did the swap keep or improve variety? Reported, not assumed. */
  diversityPreserved: boolean;
  note: string;
}

/**
 * Replace a removed title with the best reserve, preferring one that restores
 * any diversity dimension the removal cost the active set.
 */
export function replaceInCourt(
  court: AssembledCourt,
  removeId: string,
  reason: RemovalReason,
  titles: Map<string, SynthTitle>,
): ReplacementOutcome {
  const idx = court.active.findIndex((s) => s.id === removeId);
  if (idx === -1) {
    return { court, promoted: null, exhausted: court.reserve.length === 0, diversityPreserved: true, note: 'Not in the active set.' };
  }
  const removed = court.active[idx]!;
  const removedTitle = titles.get(removed.id);

  // Which axes the removal would cost, if nothing replaced them.
  const remaining = court.active.filter((s) => s.id !== removeId).map((s) => titles.get(s.id)).filter(Boolean) as SynthTitle[];
  const lostGenre = removedTitle && !remaining.some((t) => t.genres[0] === removedTitle.genres[0]);

  const sortedReserve = [...court.reserve].sort((a, b) => {
    const ta = titles.get(a.id), tb = titles.get(b.id);
    // Prefer a reserve that restores the lost genre, then by replacement priority.
    const aRestores = lostGenre && ta?.genres[0] === removedTitle?.genres[0] ? 1 : 0;
    const bRestores = lostGenre && tb?.genres[0] === removedTitle?.genres[0] ? 1 : 0;
    return bRestores - aRestores || a.replacementPriority - b.replacementPriority || b.score - a.score;
  });

  const promoted = sortedReserve[0] ?? null;
  const nextActive = [...court.active];
  if (promoted) nextActive.splice(idx, 1, { ...promoted, role: 'active' });
  else nextActive.splice(idx, 1);

  const nextReserve = court.reserve.filter((s) => s.id !== promoted?.id);

  // Did variety hold? Compare distinct primary genres before and after.
  const before = new Set(court.active.map((s) => titles.get(s.id)?.genres[0]).filter(Boolean));
  const after = new Set(nextActive.map((s) => titles.get(s.id)?.genres[0]).filter(Boolean));

  return {
    court: { ...court, active: nextActive, reserve: nextReserve },
    promoted,
    exhausted: nextReserve.length === 0,
    diversityPreserved: after.size >= before.size - (promoted ? 0 : 1),
    note: promoted
      ? `Replaced after ${reason}; promoted ${promoted.id}${lostGenre ? ' to restore the missing genre' : ''}.`
      : `Removed after ${reason}; no reserve remained, so the tray is one shorter.`,
  };
}
