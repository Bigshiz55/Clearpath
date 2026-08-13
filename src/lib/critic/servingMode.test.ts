import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { routeAsk, type ServingMode } from './gate';
import { buildCriticState, type CriticState } from './orchestrate';
import { dimensionCacheKey } from './hydrate';
import type { AnchorCandidate } from './anchor';

/**
 * GC1 CORRECTION — THE MEANING OF A REQUEST MAY NOT DEPEND ON THE PROVIDER.
 *
 * `AI_DISCOVERY_MODE='anthropic'` lets `runAiDiscovery` return a finished search
 * response at step 0.7, before `parseCriticRequest` runs at 0.9. So the same
 * comparative sentence gets the canonical GC1–GC5 pipeline under `legacy` and
 * an independent interpretation under `anthropic`.
 *
 * The RED here is BEHAVIOURAL: `routeAsk` initially models the shipped ordering,
 * so the anthropic cases fail on the decision itself, not on a missing module.
 *
 * The gate: ONE canonical CriticRequest, byte-identical across legacy,
 * anthropic and conversational. Downstream candidate pools may legitimately
 * differ if the retrieval brain differs. The MEANING may not.
 */

const BETTER = 'Better than Furious or Widows Bay';
const LIKE = 'Something like Furious or Widows Bay';
const PLAIN = 'three wrestling movies';

const MODES: ServingMode[] = ['legacy', 'shadow', 'anthropic'];

// ── Real GC2 candidates. Decoys first, so search order can never be identity ──
const CANDIDATES: Record<string, AnchorCandidate[]> = {
  Furious: [
    { id: 501, title: 'Furious 7', mediaType: 'movie', year: 2015 },
    { id: 502, title: 'Furious', mediaType: 'movie', year: 2017 },
  ],
  'Widows Bay': [
    { id: 601, title: 'Widows', mediaType: 'movie', year: 2018 },
    { id: 602, title: 'Widows Bay', mediaType: 'movie', year: 2021 },
  ],
};
const searchCandidates = async (name: string) => CANDIDATES[name] ?? [];

const DIMS: TitleDimensions = {
  pacing: 78, darkness: 24, warmth: 80, humor: 76, suspense: 30, emotion: 55,
  complexity: 24, realism: 40, character: 45, stakes: 60, morality: 50,
  violence: 55, attention: 35, serialized: 20, romance: 30,
} as TitleDimensions;

const loadDimensions = async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
  const m = new Map<string, TitleDimensions>();
  for (const k of keys) m.set(dimensionCacheKey(k.media_type, k.tmdb_id), DIMS);
  return m;
};

const NOW = Date.UTC(2026, 5, 1);
const DNA = deriveDna(
  Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
    id: `e${i}`,
    at: NOW - (i + 1) * 86_400_000,
    titleId: `movie:${4000 + i}`,
    action: 'seen_liked',
    dims: { darkness: 85, warmth: 15, humor: 12, complexity: 84, suspense: 88 },
    genres: ['thriller'],
  })),
  NOW,
);

/** The full canonical pipeline, entered through the production gate. */
async function pipelineFor(
  text: string,
  mode: ServingMode,
  opts: { conversational?: boolean } = {},
): Promise<CriticState> {
  const decision = routeAsk(text, mode, opts);
  expect(decision.consumer, `${mode}: a comparative request reached ${decision.consumer}`).toBe('critic');
  return buildCriticState({
    request: decision.request!,
    dna: DNA,
    hard: { mediaType: 'movie' },
    searchCandidates,
    loadDimensions,
    anchorKeywordIds: [9001, 9002],
    anchorGenreIds: [53],
  });
}

/** Everything that must be provider-independent. Pools deliberately excluded. */
const canonicalShape = (s: CriticState) => ({
  relation: s.objective.relation,
  anchors: s.objective.anchors.map((a) => a.titleId).sort(),
  resolution: s.attribution.resolution.map((r) => r.status).sort(),
  hydrated: s.attribution.hydrated.map((h) => h.hydrated),
  authority: s.objective.authority,
  plan: s.plan.instructions.map((i) => `${i.axis}:${i.kind}:${Math.round(i.target)}`).sort(),
  strands: [...s.attribution.strands].sort(),
});

// ───────────────────────────────────────────────────────────────────────────
// 1 · THE BOUNDARY — comparative intent precedes provider selection
// ───────────────────────────────────────────────────────────────────────────

describe('GC1c · comparative intent is detected before any provider brain', () => {
  it('1 · every serving mode routes a comparative request to the critic', () => {
    for (const mode of MODES) {
      const d = routeAsk(BETTER, mode);
      expect(d.consumer, `mode=${mode}`).toBe('critic');
      expect(d.comparative, `mode=${mode}`).toBe(true);
    }
  });

  it('2 · anthropic mode may NOT consume a comparative request', () => {
    /* The exact hole: `runAiDiscovery` returning a finished recommendation for
       a sentence the critic pipeline owns. */
    expect(routeAsk(BETTER, 'anthropic').consumer).not.toBe('ai_discovery');
    expect(routeAsk(LIKE, 'anthropic').consumer).not.toBe('ai_discovery');
  });

  it('3 · the canonical request is byte-identical across modes', () => {
    const [legacy, shadow, anthropic] = MODES.map((m) => routeAsk(BETTER, m).request);
    expect(anthropic).toEqual(legacy);
    expect(shadow).toEqual(legacy);
    expect(legacy?.relation).toBe('better_than');
    expect(legacy?.referenceTitles).toEqual(['Furious', 'Widows Bay']);
  });

  it('4 · NON-comparative requests still reach the provider brain', () => {
    /* The boundary must not swallow the AI orchestrator. Its whole purpose is
       intact for every request that is not a comparison. */
    expect(routeAsk(PLAIN, 'anthropic').consumer).toBe('ai_discovery');
    expect(routeAsk(PLAIN, 'legacy').consumer).toBe('legacy_discovery');
    expect(routeAsk('', 'anthropic').consumer).not.toBe('critic');
  });

  it('5 · conversational mode never reaches the provider brain', () => {
    for (const mode of MODES) {
      expect(routeAsk(BETTER, mode, { conversational: true }).consumer).toBe('critic');
      expect(routeAsk(PLAIN, mode, { conversational: true }).consumer).toBe('legacy_discovery');
    }
  });

  it('6 · a bare vocabulary word is a browse, not a comparison, in every mode', () => {
    for (const mode of MODES) {
      expect(routeAsk('crime', mode, { lexical: true }).comparative).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · THE FULL PIPELINE IS REACHED IN EVERY MODE
// ───────────────────────────────────────────────────────────────────────────

describe('GC1c · the canonical pipeline is reached regardless of serving mode', () => {
  it('7 · relation, anchors, resolution, hydration, plan and hints exist in every mode', async () => {
    for (const mode of MODES) {
      const s = await pipelineFor(BETTER, mode);
      expect(s.objective.relation, `mode=${mode}`).toBe('better_than');
      expect(s.objective.anchors.map((a) => a.tmdbId).sort(), `mode=${mode}`).toEqual([502, 602]);
      expect(s.attribution.resolution.every((r) => r.status === 'resolved'), `mode=${mode}`).toBe(true);
      expect(s.attribution.hydrated.every((h) => h.hydrated), `mode=${mode}`).toBe(true);
      expect(s.objective.authority, `mode=${mode}`).toBeGreaterThan(0);
      expect(s.plan.instructions.length, `mode=${mode}`).toBeGreaterThan(0);
      expect(s.hints.strands.length, `mode=${mode}`).toBeGreaterThan(1);
    }
  });

  it('8 · legacy and anthropic produce the SAME canonical meaning', async () => {
    const legacy = canonicalShape(await pipelineFor(BETTER, 'legacy'));
    const anthropic = canonicalShape(await pipelineFor(BETTER, 'anthropic'));
    expect(anthropic).toEqual(legacy);
  });

  it('9 · conversational mode agrees with both', async () => {
    const legacy = canonicalShape(await pipelineFor(BETTER, 'legacy'));
    const conv = canonicalShape(await pipelineFor(BETTER, 'anthropic', { conversational: true }));
    expect(conv).toEqual(legacy);
  });

  it('10 · relation still separates the two requests in anthropic mode', async () => {
    /* Provider-independence must not be achieved by flattening meaning. */
    const better = await pipelineFor(BETTER, 'anthropic');
    const like = await pipelineFor(LIKE, 'anthropic');
    expect(better.objective.relation).toBe('better_than');
    expect(like.objective.relation).toBe('like');
    expect(canonicalShape(better)).not.toEqual(canonicalShape(like));
    // …and identity is unchanged by the relation.
    expect(better.objective.anchors.map((a) => a.titleId).sort()).toEqual(
      like.objective.anchors.map((a) => a.titleId).sort(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · ONE CONTRACT — no provider-specific critic anywhere
// ───────────────────────────────────────────────────────────────────────────

describe('GC1c · there is exactly one implementation of what a comparison means', () => {
  it('11 · the AI discovery bridge does not parse comparisons of its own', () => {
    const bridge = readFileSync('src/lib/ai/discoveryBridge.ts', 'utf8');
    expect(bridge).not.toContain('parseCriticRequest');
    expect(bridge).not.toContain('CriticObjective');
    expect(bridge).not.toContain('CriticRelation');
    expect(bridge).not.toContain('buildCriticState');
  });

  it('12 · the gate delegates to the one parser rather than reimplementing it', () => {
    const gate = readFileSync('src/lib/critic/gate.ts', 'utf8');
    expect(gate).toContain("from './request'");
    // No second relation vocabulary living in the gate.
    expect(gate).not.toContain("'better_than'");
  });

  it('13 · the route consults the gate BEFORE the AI orchestrator', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const gateAt = route.indexOf('routeAsk(');
    const aiAt = route.indexOf('runAiDiscovery(');
    expect(gateAt, 'route does not use the gate').toBeGreaterThan(-1);
    expect(aiAt, 'runAiDiscovery vanished').toBeGreaterThan(-1);
    /* Physical ordering, asserted. The gate makes the RULE testable; this makes
       the ROUTE honour it, so the two cannot drift apart. */
    expect(gateAt).toBeLessThan(aiAt);
  });

  it('14 · the anthropic branch is explicitly guarded against comparatives', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const branch = route.slice(route.indexOf("aiMode === 'anthropic'"), route.indexOf('runAiDiscovery('));
    expect(branch).toContain('!criticRequest');
  });
});
