/**
 * THE FUNNEL — orchestrates stages 1..6 over a catalog provider and records
 * what happened at every step.
 *
 * This runs entirely in-process against a `CatalogProvider`, so it can be
 * driven by the synthetic catalog with no database, no network and no keys.
 * The SQL channel functions in migration 0031 are the production
 * implementation of stage 1; this orchestrator is what the diagnostic screen
 * and the performance harness exercise.
 *
 * NOTHING here is wired into the public application. It is reachable only from
 * the founder diagnostic route.
 */

import { FUNNEL, CHANNEL_CAPS, RANKING_VERSION, PARSER_VERSION } from './config';
import { parseIntent, type ParseContext } from './parseIntent';
import { requestFingerprint, type ParsedRequest } from './intent';
import { cosine, FixtureEmbeddingProvider } from './embedding';
import { fastRank, deepRank, type FastScored, type DeepScored, type MemberProfile, type GroupMethod } from './rank';
import { diversify, assembleCourt, DIVERSITY_CONFIG, type AssembledCourt, type DiversifyResult } from './diversify';
import type { SynthTitle } from './synthCatalog';
import type { CourtSize } from '@/lib/court/pool';

export interface StageTiming { stage: string; ms: number; countIn: number; countOut: number }

export interface FunnelResult {
  request: { raw: string; parsed: ParsedRequest; fingerprint: string; parserVersion: string; confidence: number };
  stages: StageTiming[];
  channelCounts: Record<string, number>;
  retrievalReasons: Map<string, { channel: string; rank: number; score: number }[]>;
  filterRemovals: Record<string, number>;
  limitingConstraint: string | null;
  fast: FastScored[];
  deep: DeepScored[];
  diversified: DiversifyResult;
  court: AssembledCourt;
  totals: { catalog: number; retrieved: number; eligible: number; fastRanked: number; deepRanked: number; semifinalists: number };
  /** FALSE whenever fixture vectors were used. Surfaced in the UI. */
  semanticEmbeddings: boolean;
  rankingVersion: string;
}

export interface FunnelOptions {
  rawRequest: string;
  parseContext?: ParseContext;
  members: MemberProfile[];
  courtSize: CourtSize;
  groupMethod?: GroupMethod;
  /** Overrides for stage targets, so the diagnostic screen can experiment. */
  targets?: Partial<typeof FUNNEL>;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Run every stage. Deterministic: the same catalog, request, members and
 * configuration always produce the same court, which is what makes the
 * diagnostic reproducible and the tests meaningful.
 */
export function runFunnel(catalog: SynthTitle[], opts: FunnelOptions): FunnelResult {
  const targets = { ...FUNNEL, ...opts.targets };
  const stages: StageTiming[] = [];
  const embedder = new FixtureEmbeddingProvider('wv-synth-v1:vec');

  // ---------------------------------------------------------- STAGE 0 ------
  let t0 = now();
  const parsed = parseIntent(opts.rawRequest, opts.parseContext);
  const fingerprint = requestFingerprint(parsed, {
    members: opts.members.map((m) => m.id).sort(),
    size: opts.courtSize,
    ranking: RANKING_VERSION,
  });
  stages.push({ stage: 'parse', ms: now() - t0, countIn: 1, countOut: 1 });

  // ---------------------------------------------------------- STAGE 1 ------
  // Multiple independent channels, each capped, then merged. Every candidate
  // keeps the list of reasons it entered.
  t0 = now();
  const queryVector = embedder.vectorFor(opts.rawRequest || 'anything').values;
  const reasons = new Map<string, { channel: string; rank: number; score: number }[]>();
  const channelCounts: Record<string, number> = {};

  const addChannel = (channel: string, ranked: { id: string; score: number }[], cap: number) => {
    const capped = ranked.slice(0, cap);
    channelCounts[channel] = capped.length;
    capped.forEach((r, i) => {
      const list = reasons.get(r.id) ?? [];
      list.push({ channel, rank: i + 1, score: Math.round(r.score * 1000) / 1000 });
      reasons.set(r.id, list);
    });
  };

  const active = catalog.filter((t) => t.mediaType === parsed.content_type || parsed.content_type === 'any');

  // semantic
  addChannel('semantic', active
    .map((t) => ({ id: t.id, score: cosine(queryVector, t.vector.values) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), CHANNEL_CAPS.semantic);

  // full text — genre/keyword token overlap with the raw request
  const tokens = opts.rawRequest.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  addChannel('fullText', active
    .map((t) => {
      const hay = `${t.title} ${t.synopsis} ${t.genres.join(' ')} ${t.keywords.join(' ')}`.toLowerCase();
      const score = tokens.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) / Math.max(1, tokens.length);
      return { id: t.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), CHANNEL_CAPS.fullText);

  // metadata — requested genres
  const wantGenres = new Set(parsed.soft_preferences.genres.map((g) => g.value));
  if (wantGenres.size > 0) {
    addChannel('metadata', active
      .map((t) => ({ id: t.id, score: t.genres.filter((g) => wantGenres.has(g)).length / Math.max(1, wantGenres.size) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), CHANNEL_CAPS.metadata);
  } else channelCounts.metadata = 0;

  // watch DNA — combined member vectors
  const dnaVectors = opts.members.map((m) => m.vector).filter((v): v is number[] => !!v);
  const dnaVector = dnaVectors.length
    ? dnaVectors[0]!.map((_, i) => dnaVectors.reduce((s, v) => s + (v[i] ?? 0), 0) / dnaVectors.length)
    : null;
  if (dnaVector) {
    addChannel('watchDna', active
      .map((t) => ({ id: t.id, score: cosine(dnaVector, t.vector.values) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), CHANNEL_CAPS.watchDna);
  } else channelCounts.watchDna = 0;

  // quality fallback + discovery
  addChannel('qualityFallback', active
    .filter((t) => t.voteCount > 0)
    .map((t) => ({ id: t.id, score: (t.audienceScore ?? 0) / 10 }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), CHANNEL_CAPS.qualityFallback);

  addChannel('discovery', active
    .filter((t) => (t.audienceScore ?? 0) >= 6.5)
    .map((t) => ({ id: t.id, score: ((t.audienceScore ?? 0) / 10) * (1 - (t.features.mainstream ?? 0.5)) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), CHANNEL_CAPS.discovery);

  const byId = new Map(catalog.map((t) => [t.id, t]));
  const retrieved = [...reasons.keys()].map((id) => byId.get(id)!).filter(Boolean).slice(0, targets.retrieveMax);
  stages.push({ stage: 'retrieve', ms: now() - t0, countIn: catalog.length, countOut: retrieved.length });

  // ---------------------------------------------------------- STAGE 2 ------
  t0 = now();
  const hf = parsed.hard_filters;
  const filterRemovals: Record<string, number> = {};
  const bump = (k: string) => { filterRemovals[k] = (filterRemovals[k] ?? 0) + 1; };
  const excluded = new Set(hf.vetoed_title_ids);
  const watchedAll = new Set(opts.members.flatMap((m) => [...m.watchedIds]));

  const eligible = retrieved.filter((t) => {
    if (hf.content_type !== 'any' && t.mediaType !== hf.content_type) { bump('content_type'); return false; }
    if (hf.max_runtime_minutes != null && t.runtimeMinutes != null && t.runtimeMinutes > hf.max_runtime_minutes) { bump('runtime'); return false; }
    if (hf.min_release_year != null && t.releaseYear != null && t.releaseYear < hf.min_release_year) { bump('release_year'); return false; }
    if (hf.allowed_languages.length > 0 && !hf.allowed_languages.includes(t.originalLanguage)) { bump('language'); return false; }
    if (excluded.has(t.id)) { bump('excluded'); return false; }
    if (hf.exclude_watched && watchedAll.has(t.id)) { bump('watched'); return false; }
    if (hf.allowed_streaming_services.length > 0) {
      // A stale claim does not count as availability.
      const ok = t.availability.some((a) =>
        hf.allowed_streaming_services.includes(a.provider) && a.verifiedDaysAgo <= 14 &&
        (hf.allowed_monetization.length === 0 || hf.allowed_monetization.includes(a.monetization)));
      if (!ok) { bump('availability'); return false; }
    }
    return true;
  });
  stages.push({ stage: 'filter', ms: now() - t0, countIn: retrieved.length, countOut: eligible.length });

  const limitingConstraint = Object.entries(filterRemovals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // ---------------------------------------------------------- STAGE 3 ------
  t0 = now();
  const fullTextScores = new Map<string, number>();
  const referenceScores = new Map<string, number>();
  for (const [id, list] of reasons) {
    for (const r of list) {
      if (r.channel === 'fullText') fullTextScores.set(id, r.score);
      if (r.channel === 'referenceTitle') referenceScores.set(id, r.score);
    }
  }
  const fast = fastRank(eligible, {
    request: parsed, queryVector, fullTextScores, referenceScores, dnaVector,
    watchedIds: watchedAll, seenFranchises: new Set(),
  }, targets.fastRanked);
  stages.push({ stage: 'fastRank', ms: now() - t0, countIn: eligible.length, countOut: fast.length });

  // ---------------------------------------------------------- STAGE 4 ------
  t0 = now();
  const fastMap = new Map(fast.map((f) => [f.id, f]));
  const deep = deepRank(fast.map((f) => byId.get(f.id)!).filter(Boolean), {
    members: opts.members, request: parsed, fast: fastMap, method: opts.groupMethod,
  }, targets.deepRanked);
  stages.push({ stage: 'deepRank', ms: now() - t0, countIn: fast.length, countOut: deep.length });

  // ---------------------------------------------------------- STAGE 5 ------
  t0 = now();
  const diversified = diversify(byId, deep, targets.semifinalists, DIVERSITY_CONFIG);
  stages.push({ stage: 'diversify', ms: now() - t0, countIn: deep.length, countOut: diversified.selected.length });

  // ---------------------------------------------------------- STAGE 6 ------
  t0 = now();
  const court = assembleCourt(diversified.selected, opts.courtSize);
  stages.push({ stage: 'assemble', ms: now() - t0, countIn: diversified.selected.length, countOut: court.active.length + court.reserve.length });

  return {
    request: {
      raw: opts.rawRequest, parsed, fingerprint,
      parserVersion: PARSER_VERSION, confidence: parsed.parser_confidence,
    },
    stages,
    channelCounts,
    retrievalReasons: reasons,
    filterRemovals,
    limitingConstraint,
    fast, deep, diversified, court,
    totals: {
      catalog: catalog.length,
      retrieved: retrieved.length,
      eligible: eligible.length,
      fastRanked: fast.length,
      deepRanked: deep.length,
      semifinalists: diversified.selected.length,
    },
    // Fixture vectors only. This flag exists so no screen can imply otherwise.
    semanticEmbeddings: false,
    rankingVersion: RANKING_VERSION,
  };
}
