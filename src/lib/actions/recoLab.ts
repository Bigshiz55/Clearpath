'use server';

import 'server-only';
import { z } from 'zod';
import { hasFounderAccess } from '@/lib/founder/gate';
import { generateCatalog, catalogSummary, type SynthTitle } from '@/lib/reco/synthCatalog';
import { runFunnel } from '@/lib/reco/funnel';
import { replaceInCourt, type RemovalReason } from '@/lib/reco/diversify';
import { FixtureEmbeddingProvider } from '@/lib/reco/embedding';
import { explainTitle } from '@/lib/reco/explain';
import type { MemberProfile, GroupMethod } from '@/lib/reco/rank';
import type { CourtSize } from '@/lib/court/pool';

/**
 * Server actions for the founder recommendation lab.
 *
 * EVERY action re-checks authorization. A server action is a public HTTP
 * endpoint — gating only the page that renders the form would leave the action
 * itself callable by anyone who knows its id.
 */

const CATALOG_SIZES = [5_000, 10_000, 50_000] as const;

const inputSchema = z.object({
  catalogSize: z.union([z.literal(5000), z.literal(10000), z.literal(50000)]),
  request: z.string().max(500),
  courtSize: z.enum(['quick', 'standard', 'deep']),
  groupMethod: z.enum(['weighted_mean', 'min_protected', 'disagreement_penalty', 'nash']),
  members: z.array(z.object({
    name: z.string().min(1).max(40),
    confidence: z.number().min(0).max(1),
    exclusions: z.array(z.string().max(40)).max(10),
    isHost: z.boolean(),
    /** No profile at all — the new-member case. */
    hasProfile: z.boolean(),
  })).min(1).max(6),
  /** Titles to remove and replace, applied in order after assembly. */
  removals: z.array(z.object({
    id: z.string().max(64),
    reason: z.enum(['veto', 'seen_it', 'unavailable', 'duplicate']),
  })).max(10).default([]),
});

export type LabInput = z.infer<typeof inputSchema>;

/**
 * Catalog cache. Generating 50,000 titles is deterministic but not free, and
 * the lab is re-run constantly while tuning — so cache per size in process
 * memory. Keyed by size only, because the seed is fixed.
 */
const catalogCache = new Map<number, SynthTitle[]>();
function catalogFor(size: number): { titles: SynthTitle[]; generationMs: number; cached: boolean } {
  const hit = catalogCache.get(size);
  if (hit) return { titles: hit, generationMs: 0, cached: true };
  const t0 = performance.now();
  const titles = generateCatalog({ count: size });
  const generationMs = performance.now() - t0;
  catalogCache.set(size, titles);
  return { titles, generationMs, cached: false };
}

async function assertFounder(): Promise<void> {
  // A server action is a public HTTP endpoint. Gating only the page that
  // renders the form would leave this callable by anyone who knows its id, so
  // it re-checks independently through the same adapter.
  if (!(await hasFounderAccess())) throw new Error('Not authorized.');
}

export interface LabResult {
  ok: boolean;
  error?: string;
  catalogSize: number;
  catalogCached: boolean;
  catalogGenerationMs: number;
  catalogMix: Record<string, number>;
  parsed: unknown;
  parserConfidence: number;
  fingerprint: string;
  stages: { stage: string; ms: number; countIn: number; countOut: number }[];
  channelCounts: Record<string, number>;
  filterRemovals: Record<string, number>;
  limitingConstraint: string | null;
  totals: Record<string, number>;
  semanticEmbeddings: boolean;
  rankingVersion: string;
  active: LabSlot[];
  reserve: LabSlot[];
  shortfall: number;
  shortfallReason: string | null;
  replacementLog: string[];
  totalMs: number;
}

export interface LabSlot {
  id: string;
  title: string;
  role: 'active' | 'reserve';
  rank: number;
  replacementPriority: number;
  score: number;
  reason: string;
  addsDimension: string[];
  genres: string[];
  year: number | null;
  runtime: number | null;
  franchise: string | null;
  availability: string[];
  /** Stale availability is labelled, never asserted as available. */
  availabilityStale: boolean;
  memberScores: Record<string, number>;
  groupMean: number;
  lowestMemberScore: number;
  disagreement: number;
  retrievalChannels: { channel: string; rank: number; score: number }[];
  /** Grounded explanation: sentence + the field behind every claim. */
  explanation: { sentence: string; gaps: string[]; evidence: { claim: string; sourceField: string; value: string; confidence: number; supported: boolean }[] };
  fastComponents: Record<string, number | null>;
  tags: string[];
}

/** Run the whole funnel and return a diagnostic payload. Founder only. */
export async function runLab(raw: unknown): Promise<LabResult> {
  await assertFounder();

  const parsedInput = inputSchema.safeParse(raw);
  if (!parsedInput.success) {
    return emptyResult(0, `Invalid input: ${parsedInput.error.issues[0]?.message ?? 'unknown'}`);
  }
  const input = parsedInput.data;
  const started = performance.now();

  const { titles, generationMs, cached } = catalogFor(input.catalogSize);
  const emb = new FixtureEmbeddingProvider('lab-members');

  const members: MemberProfile[] = input.members.map((m, i) => ({
    id: `m${i}`,
    name: m.name,
    vector: m.hasProfile ? emb.vectorFor(m.name).values : null,
    confidence: m.confidence,
    watchedIds: new Set<string>(),
    exclusions: m.exclusions,
    isHost: m.isHost,
  }));

  const result = runFunnel(titles, {
    rawRequest: input.request,
    members,
    courtSize: input.courtSize as CourtSize,
    groupMethod: input.groupMethod as GroupMethod,
  });

  const byId = new Map(titles.map((t) => [t.id, t]));
  const deepById = new Map(result.deep.map((d) => [d.id, d]));
  const fastById = new Map(result.fast.map((f) => [f.id, f]));

  let court = result.court;
  const replacementLog: string[] = [];
  for (const removal of input.removals) {
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
      id: s.id,
      title: t?.title ?? s.id,
      role: s.role,
      rank: s.rank,
      replacementPriority: s.replacementPriority,
      score: s.score,
      reason: s.reason,
      addsDimension: s.addsDimension,
      genres: t?.genres ?? [],
      year: t?.releaseYear ?? null,
      runtime: t?.runtimeMinutes ?? null,
      franchise: t?.franchise ?? null,
      availability: fresh.map((a) => `${a.provider} (${a.monetization})`),
      availabilityStale: (t?.availability.length ?? 0) > 0 && fresh.length === 0,
      memberScores: deep?.memberScores ?? {},
      groupMean: deep?.groupMean ?? 0,
      lowestMemberScore: deep?.lowestMemberScore ?? 0,
      disagreement: deep?.disagreement ?? 0,
      retrievalChannels: result.retrievalReasons.get(s.id) ?? [],
      explanation: t ? explainTitle(t, result.request.parsed, deep) : { sentence: '', gaps: [], evidence: [] },
      fastComponents: (fast?.components ?? {}) as Record<string, number | null>,
      tags: t?.tags ?? [],
    };
  };

  return {
    ok: true,
    catalogSize: input.catalogSize,
    catalogCached: cached,
    catalogGenerationMs: Math.round(generationMs),
    catalogMix: catalogSummary(titles),
    parsed: result.request.parsed,
    parserConfidence: result.request.confidence,
    fingerprint: result.request.fingerprint,
    stages: result.stages.map((s) => ({ ...s, ms: Math.round(s.ms * 100) / 100 })),
    channelCounts: result.channelCounts,
    filterRemovals: result.filterRemovals,
    limitingConstraint: result.limitingConstraint,
    totals: result.totals as unknown as Record<string, number>,
    semanticEmbeddings: result.semanticEmbeddings,
    rankingVersion: result.rankingVersion,
    active: court.active.map(toSlot),
    reserve: court.reserve.map(toSlot),
    shortfall: court.shortfall,
    shortfallReason: court.shortfallReason,
    replacementLog,
    totalMs: Math.round(performance.now() - started),
  };
}

function emptyResult(size: number, error: string): LabResult {
  return {
    ok: false, error, catalogSize: size, catalogCached: false, catalogGenerationMs: 0,
    catalogMix: {}, parsed: null, parserConfidence: 0, fingerprint: '', stages: [],
    channelCounts: {}, filterRemovals: {}, limitingConstraint: null, totals: {},
    semanticEmbeddings: false, rankingVersion: '', active: [], reserve: [],
    shortfall: 0, shortfallReason: null, replacementLog: [], totalMs: 0,
  };
}

export { CATALOG_SIZES };
