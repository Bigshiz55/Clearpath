import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { extractReference } from '@/lib/askJudge';
import { classifySearch } from '@/lib/nlu/searchMode';
import { applyTurn, EMPTY_REQUEST } from '@/lib/nlu/conversationState';
import { parseCriticRequest } from './request';
import { buildCriticState } from './orchestrate';
import { dimensionCacheKey } from './hydrate';
import type { AnchorCandidate } from './anchor';
import type { TitleDimensions } from '@/lib/scoring/dimensions';

/**
 * GC1 — REAL RECOMMENDATION OBJECTIVE CONSTRUCTION. Written to FAIL FIRST.
 *
 * The RED here is BEHAVIOURAL, not "the module is absent". Section 1 runs the
 * SHIPPED parsers — `extractReference`, `classifySearch`, `applyTurn` — over the
 * two sentences that matter and pins what they actually do today. Those
 * assertions describe production, so they pass before and after; what fails
 * before GC1 is everything downstream of them, because nothing turns their
 * output into a canonical objective.
 *
 * The gate: `Better than Furious or Widows Bay` and
 * `Something like Furious or Widows Bay` must produce DISTINCT canonical
 * objectives with the anchors individually identifiable — through the real
 * orchestration, not a hand-assembled one.
 */

// ───────────────────────────────────────────────────────────────────────────
// A REAL CATALOGUE FOR GC2 TO JUDGE. Deliberately hostile: the first search
// result is NEVER the right answer, so any code that trusts search order fails.
// ───────────────────────────────────────────────────────────────────────────
const CANDIDATES: Record<string, AnchorCandidate[]> = {
  Furious: [
    { id: 501, title: 'Furious 7', mediaType: 'movie', year: 2015 }, // popular decoy
    { id: 502, title: 'Furious', mediaType: 'movie', year: 2017 }, // the real one
  ],
  'Widows Bay': [
    { id: 601, title: 'Widows', mediaType: 'movie', year: 2018 }, // popular decoy
    { id: 602, title: 'Widows Bay', mediaType: 'movie', year: 2021 }, // the real one
  ],
};

const FURIOUS_ID = 502;
const WIDOWS_BAY_ID = 602;

const searchCandidates = async (name: string): Promise<AnchorCandidate[]> => CANDIDATES[name] ?? [];

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

/** An empty cache — the miss path, which must degrade rather than invent. */
const loadNothing = async () => new Map<string, TitleDimensions>();

const NOW = Date.UTC(2026, 5, 1);
const events: PreferenceEvent[] = Array.from({ length: 16 }, (_, i) => ({
  id: `e${i}`,
  at: NOW - (i + 1) * 86_400_000,
  titleId: `movie:${3000 + i}`,
  action: 'seen_liked' as const,
  dims: { darkness: 85, warmth: 15, humor: 12, complexity: 84, suspense: 88 },
  genres: ['thriller'],
}));
const DNA = deriveDna(events, NOW);

const BETTER = 'Better than Furious or Widows Bay';
const LIKE = 'Something like Furious or Widows Bay';

const orchestrate = (text: string, load = loadDimensions) => {
  const request = parseCriticRequest(text);
  if (!request) throw new Error(`no critic request parsed from: ${text}`);
  return buildCriticState({
    request,
    dna: DNA,
    hard: { mediaType: 'movie' },
    searchCandidates,
    loadDimensions: load,
    anchorKeywordIds: [9001, 9002],
    anchorGenreIds: [53],
  });
};

// ───────────────────────────────────────────────────────────────────────────
// 1 · WHAT THE SHIPPED PARSERS DO TODAY — the defect, pinned
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · the front-of-pipeline gap in the shipped parsers', () => {
  it('1 · "better than" is invisible to every existing reference extractor', () => {
    /* Not "flattened together" — ABSENT. And worse than absent: the whole
       sentence is classified as the NAME OF A FILM, which is why the request
       degrades to generic discovery and answers with an unrelated drama. */
    expect(extractReference(BETTER)).toBeNull();
    expect(classifySearch(BETTER).mode).toBe('exact_title');
    expect(classifySearch(BETTER).requestedTitle).toBe(BETTER);
    expect(applyTurn(EMPTY_REQUEST, BETTER, {}).state.referenceTitles).toEqual([]);
  });

  it('2 · "something like" survives only as a single flattened string', () => {
    // The one path that half-works, and it still loses anchor separability.
    expect(extractReference(LIKE)).toBe('Furious or Widows Bay');
  });

  it('3 · neither shipped extractor carries a relationship at all', () => {
    const src = readFileSync('src/lib/askJudge.ts', 'utf8');
    expect(src).not.toContain('CriticRelation');
    // `similarTo` is a string for read-back; there is nowhere to put "better".
    expect(readFileSync('src/lib/nlu/conversationState.ts', 'utf8')).not.toContain('relation');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · RELATIONSHIP SURVIVES — the two requests must not collapse
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · relation reaches the canonical objective', () => {
  it('4 · better_than and like produce DISTINCT objectives', async () => {
    const better = await orchestrate(BETTER);
    const like = await orchestrate(LIKE);
    expect(better.objective.relation).toBe('better_than');
    expect(like.objective.relation).toBe('like');
    expect(better.objective.relation).not.toBe(like.objective.relation);
  });

  it('5 · same anchor identities, different relation', async () => {
    const better = await orchestrate(BETTER);
    const like = await orchestrate(LIKE);
    const ids = (s: Awaited<ReturnType<typeof orchestrate>>) =>
      s.objective.anchors.map((a) => a.tmdbId).sort();
    expect(ids(better)).toEqual([FURIOUS_ID, WIDOWS_BAY_ID]);
    expect(ids(like)).toEqual(ids(better));
  });

  it('6 · canonical relation vocabulary, not raw phrasing', () => {
    expect(parseCriticRequest('Better than Furious')?.relation).toBe('better_than');
    expect(parseCriticRequest('Something like Furious')?.relation).toBe('like');
    expect(parseCriticRequest('Furious but funnier')?.relation).toBe('like_but');
    expect(parseCriticRequest('Furious meets Widows Bay')?.relation).toBe('blend');
  });

  it('7 · no title is special-cased — the same shapes work on other names', () => {
    expect(parseCriticRequest('better than Heat or Sicario')?.referenceTitles).toEqual(['Heat', 'Sicario']);
    expect(parseCriticRequest('something like Arrival')?.referenceTitles).toEqual(['Arrival']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · ANCHOR IDENTITY — popularity never establishes identity
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · anchors resolve through GC2, not through search order', () => {
  it('8 · both anchors survive INDIVIDUALLY, not as one flattened string', async () => {
    const s = await orchestrate(BETTER);
    expect(s.request.referenceTitles).toEqual(['Furious', 'Widows Bay']);
    expect(s.objective.anchors).toHaveLength(2);
  });

  it('9 · the first search result is REJECTED when it is not the title named', async () => {
    /* The decoys are first in both candidate lists. `searchTitles(name)[0]`
       would have produced Furious 7 and Widows. */
    const s = await orchestrate(BETTER);
    const ids = s.objective.anchors.map((a) => a.tmdbId);
    expect(ids).toContain(FURIOUS_ID);
    expect(ids).toContain(WIDOWS_BAY_ID);
    expect(ids).not.toContain(501);
    expect(ids).not.toContain(601);
  });

  it('10 · an ambiguous anchor is not guessed and earns no authority', async () => {
    const twoDunes: AnchorCandidate[] = [
      { id: 700, title: 'Dune', mediaType: 'movie', year: 1984 },
      { id: 701, title: 'Dune', mediaType: 'movie', year: 2021 },
    ];
    const request = parseCriticRequest('better than Dune')!;
    const s = await buildCriticState({
      request,
      dna: DNA,
      hard: {},
      searchCandidates: async () => twoDunes,
      loadDimensions,
    });
    expect(s.resolutions[0]!.status).toBe('ambiguous');
    expect(s.objective.anchors).toHaveLength(0);
    expect(s.objective.authority).toBe(0);
    expect(s.attribution.resolution[0]!.status).toBe('ambiguous');
  });

  it('11 · the route no longer uses searchTitles(name)[0] for critic anchors', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    /* The forbidden identity assumption, gone from the critic path. The whole
       line is what must disappear, not merely the call. */
    expect(route).not.toContain('searchTitles(name).catch(() => []))[0]');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4 · HYDRATION (GC3) — cache-only, composite identity, honest on a miss
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · resolved anchors hydrate through GC3', () => {
  it('12 · a cached fingerprint attaches and earns authority', async () => {
    const s = await orchestrate(BETTER);
    expect(s.objective.anchors.every((a) => a.dims != null)).toBe(true);
    expect(s.objective.authority).toBeGreaterThan(0);
    expect(s.attribution.hydrated.every((h) => h.hydrated)).toBe(true);
  });

  it('13 · a cache MISS leaves identity intact but authority at zero', async () => {
    const s = await orchestrate(BETTER, loadNothing);
    expect(s.objective.anchors).toHaveLength(2); // identity survived
    expect(s.objective.anchors.every((a) => a.dims == null)).toBe(true);
    expect(s.objective.authority).toBe(0); // …and says nothing
    expect(s.plan.instructions).toEqual([]);
  });

  it('14 · lookup is keyed on mediaType + tmdbId, never on the title string', async () => {
    const seen: string[] = [];
    await buildCriticState({
      request: parseCriticRequest(BETTER)!,
      dna: DNA,
      hard: {},
      searchCandidates,
      loadDimensions: async (keys) => {
        for (const k of keys) seen.push(`${k.media_type}-${k.tmdb_id}`);
        return new Map();
      },
    });
    expect(seen.sort()).toEqual([`movie-${FURIOUS_ID}`, `movie-${WIDOWS_BAY_ID}`]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5 · THE PLAN (GC4) — grounded, and built by buildPlan rather than the route
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · GC4 produces a grounded plan from the real request', () => {
  it('15 · instructions are grounded in anchor + user evidence', async () => {
    const s = await orchestrate(BETTER);
    expect(s.plan.instructions.length).toBeGreaterThan(0);
    for (const i of s.plan.instructions) {
      expect(i.evidence.length).toBeGreaterThan(0);
      for (const e of i.evidence) expect(['anchor', 'user_dna', 'request']).toContain(e);
    }
  });

  it('16 · explicit modifiers survive parsing and reach the plan as a request fact', async () => {
    const req = parseCriticRequest('something like Furious but funnier')!;
    expect(req.modifiers).toEqual({ humor: 'higher' });
    expect(req.relation).toBe('like_but');
    const s = await buildCriticState({
      request: req, dna: DNA, hard: {}, searchCandidates, loadDimensions,
    });
    const humor = s.plan.instructions.find((i) => i.axis === 'humor');
    expect(humor?.evidence).toContain('request');
  });

  it('17 · an ungroundable comparative is preserved, never mapped to an axis', () => {
    const req = parseCriticRequest('something like Furious but better acted')!;
    /* "better acted" is directional and real, and there is no `acting` axis.
       Inventing one — or bending it onto `character` — would be ranking on
       something the user never said. */
    expect(req.modifiers).toEqual({});
    expect(req.unresolvedModifiers.length).toBeGreaterThan(0);
  });

  it('18 · the route does not reconstruct plan semantics', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).not.toContain('TraitInstruction');
    expect(route).not.toContain("kind: 'preserve'");
    expect(route).not.toContain("kind: 'avoid'");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6 · GC5 WIRED — recall-safe strands from the real request
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · GC5 retrieval hints are produced by the real path', () => {
  it('19 · strands are emitted and include the ungated recall floor', async () => {
    const s = await orchestrate(BETTER);
    expect(s.hints.strands.length).toBeGreaterThan(1);
    expect(s.hints.strands.some((x) => !x.keywordIds?.length)).toBe(true);
    expect(s.attribution.strands).toContain('recall-floor');
  });

  it('20 · stated hard constraints pass through untouched; inference does not', async () => {
    const s = await orchestrate(BETTER);
    expect(s.hints.hard).toEqual({ mediaType: 'movie' });
    expect(JSON.stringify(s.hints.hard)).not.toContain('9001');
    expect(JSON.stringify(s.hints.hard)).not.toContain('53');
  });

  it('21 · relation reaches retrieval — better_than differs from like', async () => {
    const better = await orchestrate(BETTER);
    const like = await orchestrate(LIKE);
    expect(better.attribution.strands).not.toEqual(like.attribution.strands);
  });

  it('22 · dimension instructions are carried as ranking-only, never as filters', async () => {
    const s = await orchestrate(BETTER);
    expect(s.attribution.rankingOnlyAxes.length).toBeGreaterThan(0);
    const strands = JSON.stringify(s.hints.strands);
    for (const axis of s.attribution.rankingOnlyAxes) {
      expect(strands).not.toContain(`"${axis}"`);
    }
  });

  it('23 · the route issues the strands rather than a bare keyword union', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('buildCriticState');
    expect(route).toContain('hints.strands');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7 · OBSERVABILITY + THE GC6 BOUNDARY
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · attribution is inspectable and honest about GC6', () => {
  it('24 · every pipeline stage is represented in the attribution', async () => {
    const a = (await orchestrate(BETTER)).attribution;
    expect(a.relation).toBe('better_than');
    expect(a.requestedAnchors).toEqual(['Furious', 'Widows Bay']);
    expect(a.resolution.every((r) => r.status === 'resolved')).toBe(true);
    expect(a.hydrated.every((h) => h.hydrated)).toBe(true);
    expect(a.objectiveAuthority).toBeGreaterThan(0);
    expect(a.planInstructions.length).toBeGreaterThan(0);
    expect(a.strands.length).toBeGreaterThan(1);
  });

  it('25 · attribution carries no prompt or free-text reasoning', async () => {
    const a = (await orchestrate(BETTER)).attribution;
    const blob = JSON.stringify(a);
    /* Structured evidence, not chain-of-thought. Every value is an enum, an id,
       a number or a label — nothing a model wrote in prose. */
    expect(blob).not.toContain('You convert');
    expect(blob).not.toMatch(/because|therefore|I think/i);
  });

  it('26 · final ranking is NOT claimed — GC6 is still open', async () => {
    const s = await orchestrate(BETTER);
    expect(s.attribution.finalRankingConsumesPlan).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8 · BASELINE INERTNESS — a request with no comparison is untouched
// ───────────────────────────────────────────────────────────────────────────

describe('GC1 · requests with no comparative objective stay on the existing path', () => {
  it('27 · plain discovery asks parse to no critic request at all', () => {
    for (const t of [
      'three wrestling movies',
      'a boxing movie',
      'crime dramas on BritBox',
      'five Sigourney Weaver movies with an audience score over 70%',
      'what should I watch tonight',
      'Gone on BritBox',
    ]) {
      expect(parseCriticRequest(t), `should be inert: ${t}`).toBeNull();
    }
  });

  it('28 · a bare title is not a comparison', () => {
    expect(parseCriticRequest('Widows Bay')).toBeNull();
    expect(parseCriticRequest('Furious')).toBeNull();
  });

  it('29 · "X but <ungroundable>" does not invent an anchor', () => {
    /* The guard that keeps the bare `but` form from turning prose into a
       comparison: with no RECOGNISED modifier there is no relation. */
    expect(parseCriticRequest('action but better')).toBeNull();
    expect(parseCriticRequest('movies but good')).toBeNull();
  });

  it('30 · an unresolvable reference yields no anchors and no authority', async () => {
    /* The state the route must refuse to answer from. With nothing placed, the
       only strand left is the ungated recall floor — a popularity sweep, which
       must never be served wearing the authority of a comparison. */
    const s = await buildCriticState({
      request: parseCriticRequest('better than Zzyzx Nonexistent')!,
      dna: DNA,
      hard: {},
      searchCandidates: async () => [],
      loadDimensions,
    });
    expect(s.objective.anchors).toHaveLength(0);
    expect(s.objective.authority).toBe(0);
    expect(s.attribution.resolution[0]!.status).toBe('not_found');
  });

  it('31 · the route falls through to the existing pipeline when nothing resolved', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    /* GC2's refusal is worth nothing if the caller answers anyway. */
    expect(route).toContain('criticState.objective.anchors.length === 0');
  });
});
