'use client';

import { RecommendationLab, type LabRunner } from '@/components/reco/RecommendationLab';
import { generateCatalog, catalogSummary, type SynthTitle } from '@/lib/reco/synthCatalog';
import { runFunnel } from '@/lib/reco/funnel';
import { replaceInCourt, type RemovalReason } from '@/lib/reco/diversify';
import { FixtureEmbeddingProvider } from '@/lib/reco/embedding';
import type { MemberProfile, GroupMethod } from '@/lib/reco/rank';
import type { LabResult, LabSlot } from '@/lib/actions/recoLab';
import type { CourtSize } from '@/lib/court/pool';

/**
 * In-browser runner for the harness. Deliberately the SAME engine calls the
 * server action makes, so a browser test exercises the real funnel rather than
 * a stub — only the authorization boundary is bypassed, and only where the
 * route itself is already 404 outside the harness build.
 */

const cache = new Map<number, SynthTitle[]>();

const browserRunner: LabRunner = async (input) => {
  const started = performance.now();
  let titles = cache.get(input.catalogSize);
  let generationMs = 0;
  const cached = !!titles;
  if (!titles) {
    const t0 = performance.now();
    titles = generateCatalog({ count: input.catalogSize });
    generationMs = performance.now() - t0;
    cache.set(input.catalogSize, titles);
  }

  const emb = new FixtureEmbeddingProvider('lab-members');
  const members: MemberProfile[] = input.members.map((m, i) => ({
    id: `m${i}`, name: m.name,
    vector: m.hasProfile ? emb.vectorFor(m.name).values : null,
    confidence: m.confidence, watchedIds: new Set<string>(),
    exclusions: m.exclusions, isHost: m.isHost,
  }));

  const result = runFunnel(titles, {
    rawRequest: input.request, members,
    courtSize: input.courtSize as CourtSize,
    groupMethod: input.groupMethod as GroupMethod,
  });

  const byId = new Map(titles.map((t) => [t.id, t]));
  const deepById = new Map(result.deep.map((d) => [d.id, d]));
  const fastById = new Map(result.fast.map((f) => [f.id, f]));

  let court = result.court;
  const replacementLog: string[] = [];
  for (const removal of input.removals ?? []) {
    const out = replaceInCourt(court, removal.id, removal.reason as RemovalReason, byId);
    court = out.court;
    replacementLog.push(
      `${out.note} Diversity ${out.diversityPreserved ? 'preserved' : 'REDUCED'}.` +
      (out.exhausted ? ' Reserve is now empty.' : ''),
    );
  }

  const toSlot = (s: typeof court.active[number]): LabSlot => {
    const t = byId.get(s.id);
    const deep = deepById.get(s.id);
    const fast = fastById.get(s.id);
    const fresh = (t?.availability ?? []).filter((a) => a.verifiedDaysAgo <= 14);
    return {
      id: s.id, title: t?.title ?? s.id, role: s.role, rank: s.rank,
      replacementPriority: s.replacementPriority, score: s.score, reason: s.reason,
      addsDimension: s.addsDimension, genres: t?.genres ?? [], year: t?.releaseYear ?? null,
      runtime: t?.runtimeMinutes ?? null, franchise: t?.franchise ?? null,
      availability: fresh.map((a) => `${a.provider} (${a.monetization})`),
      availabilityStale: (t?.availability.length ?? 0) > 0 && fresh.length === 0,
      memberScores: deep?.memberScores ?? {}, groupMean: deep?.groupMean ?? 0,
      lowestMemberScore: deep?.lowestMemberScore ?? 0, disagreement: deep?.disagreement ?? 0,
      retrievalChannels: result.retrievalReasons.get(s.id) ?? [],
      fastComponents: (fast?.components ?? {}) as Record<string, number | null>,
      tags: t?.tags ?? [],
    };
  };

  return {
    ok: true,
    catalogSize: input.catalogSize, catalogCached: cached,
    catalogGenerationMs: Math.round(generationMs), catalogMix: catalogSummary(titles),
    parsed: result.request.parsed, parserConfidence: result.request.confidence,
    fingerprint: result.request.fingerprint,
    stages: result.stages.map((s) => ({ ...s, ms: Math.round(s.ms * 100) / 100 })),
    channelCounts: result.channelCounts, filterRemovals: result.filterRemovals,
    limitingConstraint: result.limitingConstraint,
    totals: result.totals as unknown as Record<string, number>,
    semanticEmbeddings: result.semanticEmbeddings, rankingVersion: result.rankingVersion,
    active: court.active.map(toSlot), reserve: court.reserve.map(toSlot),
    shortfall: court.shortfall, shortfallReason: court.shortfallReason,
    replacementLog, totalMs: Math.round(performance.now() - started),
  } satisfies LabResult;
};

export function RecoLabHarness() {
  return <RecommendationLab runner={browserRunner} />;
}
