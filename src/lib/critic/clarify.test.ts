import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { routeAsk } from './gate';
import { buildCriticState } from './orchestrate';
import { dimensionCacheKey } from './hydrate';
import { rankCriticCandidates, type CriticCandidate } from './decide';
import { buildComparativeExplanation } from './explain';
import {
  needsClarification,
  applyChoice,
  isSettled,
  rankOptions,
  disambiguateFromContext,
  MAX_CLARIFY_OPTIONS,
} from './clarify';
import type { AnchorCandidate } from './anchor';

/**
 * ANCHOR CLARIFICATION — the last mile the production smoke exposed.
 *
 * `Better than Furious or Widows Bay` stopped guessing (PR #57) and then
 * stopped comparing, because both anchors failed identity: "Widows Bay" for a
 * fixable reason (an apostrophe), "Furious" for an unfixable one (five real
 * films share the name).
 *
 * The acceptance bar is NOT "the sentence returns a recommendation
 * immediately". It is: NEVER GUESS, and still reach a correct comparative
 * answer after ONE minimal question.
 */

// ── The REAL production catalogue, as /api/search returns it today ──────────
const FURIOUS: AnchorCandidate[] = [
  { id: 287238, title: 'Furious', mediaType: 'tv', year: 2026 },
  { id: 415381, title: 'Furious', mediaType: 'movie', year: 2017 },
  { id: 87035, title: 'Furious', mediaType: 'movie', year: 2011 },
  { id: 167104, title: 'Furious', mediaType: 'movie', year: 1984 },
  { id: 1280738, title: 'The Furious', mediaType: 'movie', year: 2026 },
];
/** The catalogue spells it with an apostrophe; the user did not. */
const WIDOWS: AnchorCandidate[] = [{ id: 270476, title: "Widow's Bay", mediaType: 'tv', year: 2026 }];

const CATALOGUE: Record<string, AnchorCandidate[]> = { Furious: FURIOUS, 'Widows Bay': WIDOWS };

/** Records every name identity was searched for, so double work is visible. */
function tracingSearch() {
  const searched: string[] = [];
  return {
    searched,
    fn: async (name: string) => {
      searched.push(name);
      return CATALOGUE[name] ?? [];
    },
  };
}

const dims = (o: Partial<Record<string, number>>): TitleDimensions =>
  ({
    pacing: 50, darkness: 50, warmth: 50, humor: 50, suspense: 50, emotion: 50,
    complexity: 50, realism: 50, character: 50, stakes: 50, morality: 50,
    violence: 50, attention: 50, serialized: 50, romance: 50,
    ...o,
  }) as TitleDimensions;

const ANCHOR_DIMS = dims({ suspense: 88, darkness: 85, complexity: 82, humor: 80 });
const loadDimensions = async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
  const m = new Map<string, TitleDimensions>();
  for (const k of keys) m.set(dimensionCacheKey(k.media_type, k.tmdb_id), ANCHOR_DIMS);
  return m;
};

const NOW = Date.UTC(2026, 5, 1);
const DNA = deriveDna(
  Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
    id: `e${i}`, at: NOW - (i + 1) * 86_400_000, titleId: `movie:${13000 + i}`,
    action: 'seen_liked',
    dims: { suspense: 88, darkness: 85, complexity: 84, humor: 10 },
    genres: ['thriller'],
  })),
  NOW,
);

const INCIDENT = 'Better than Furious or Widows Bay';

async function stateFor(text: string, opts: { search?: (n: string) => Promise<AnchorCandidate[]>; preResolved?: Parameters<typeof buildCriticState>[0]['preResolved']; hard?: Parameters<typeof buildCriticState>[0]['hard'] } = {}) {
  const decision = routeAsk(text, 'legacy');
  return buildCriticState({
    request: decision.request!,
    dna: DNA,
    hard: opts.hard ?? { mediaType: 'movie' },
    searchCandidates: opts.search ?? (async (n) => CATALOGUE[n] ?? []),
    loadDimensions,
    preResolved: opts.preResolved,
  });
}

// ═══ A/B · APOSTROPHE (identity, proved through the real pipeline) ═════════

describe('clarify · the apostrophe anchor now resolves', () => {
  it('A · "Widows Bay" resolves against the catalogue\'s "Widow\'s Bay"', async () => {
    const s = await stateFor('Better than Widows Bay', { hard: {} });
    expect(s.resolutions[0]!.status).toBe('resolved');
    expect(s.objective.anchors[0]!.tmdbId).toBe(270476);
  });

  it('B · the curly form resolves to the same identity', async () => {
    const s = await stateFor('Better than Widow’s Bay', {
      hard: {},
      search: async () => WIDOWS,
    });
    expect(s.objective.anchors[0]!.tmdbId).toBe(270476);
  });
});

// ═══ C · AMBIGUITY IS STILL A REFUSAL ═════════════════════════════════════

describe('clarify · ambiguity never becomes a guess', () => {
  it('C1 · "Furious" stays ambiguous with zero identity chosen', async () => {
    const s = await stateFor('Better than Furious', { hard: {} });
    const r = s.resolutions[0]!;
    expect(r.status).toBe('ambiguous');
    expect(s.objective.anchors).toHaveLength(0);
    expect(s.objective.authority).toBe(0);
  });

  it('C2 · the candidate list is bounded and never invented', async () => {
    const s = await stateFor('Better than Furious', { hard: {} });
    const c = needsClarification(INCIDENT, 'better_than', {}, [], s.resolutions)!;
    expect(c.pending.options.length).toBeLessThanOrEqual(MAX_CLARIFY_OPTIONS);
    for (const o of c.pending.options) {
      expect(FURIOUS.some((f) => f.id === o.tmdbId), `invented option ${o.tmdbId}`).toBe(true);
    }
  });

  it('C3 · ordering a LIST is not picking one', () => {
    const ranked = rankOptions(
      FURIOUS.map((f) => ({ tmdbId: f.id, title: f.title, mediaType: f.mediaType, year: f.year })),
    );
    expect(ranked[0]!.year).toBe(2026); // newest first, for scanning
    expect(ranked).toHaveLength(MAX_CLARIFY_OPTIONS);
  });
});

// ═══ D · THE EXACT SENTENCE ═══════════════════════════════════════════════

describe('clarify · the incident sentence asks instead of abandoning', () => {
  it('D1 · one anchor resolves, the other asks — and the comparison survives', async () => {
    const s = await stateFor(INCIDENT, { hard: {} });
    const byName = new Map(s.resolutions.map((r) => [r.status === 'resolved' ? r.anchor.spokenAs : r.spokenAs, r.status]));
    expect(byName.get('Widows Bay')).toBe('resolved');
    expect(byName.get('Furious')).toBe('ambiguous');

    const c = needsClarification(INCIDENT, s.objective.relation, {}, [], s.resolutions)!;
    expect(c).not.toBeNull();
    expect(c.question).toBe('Which Furious did you mean?');
    // THE COMPARISON IS NOT DROPPED.
    expect(c.comparison.relation).toBe('better_than');
    expect(c.comparison.resolved.map((r) => r.tmdbId)).toEqual([270476]);
    expect(c.comparison.pending.map((p) => p.spokenAs)).toEqual(['Furious']);
  });

  it('D2 · a fully-resolved comparison asks nothing at all', async () => {
    const s = await stateFor('Better than Widows Bay', { hard: {} });
    expect(needsClarification('Better than Widows Bay', 'better_than', {}, [], s.resolutions)).toBeNull();
  });
});

// ═══ E/F · CONTINUATION, WITHOUT RE-RESOLVING ═════════════════════════════

describe('clarify · answering resumes the ORIGINAL request', () => {
  it('E · the chosen identity joins the carried one and the critic runs', async () => {
    const first = await stateFor(INCIDENT, { hard: {} });
    const c = needsClarification(INCIDENT, first.objective.relation, {}, [], first.resolutions)!;

    // The user picks the 2017 movie.
    const settled = applyChoice(c.comparison, { spokenAs: 'Furious', tmdbId: 415381, mediaType: 'movie' });
    expect(isSettled(settled)).toBe(true);
    expect(settled.relation).toBe('better_than');
    expect(settled.resolved.map((r) => r.tmdbId).sort()).toEqual([270476, 415381]);

    // Resume: both identities are supplied, so nothing is searched.
    const t = tracingSearch();
    const resumed = await buildCriticState({
      request: { relation: settled.relation, referenceTitles: settled.resolved.map((r) => r.spokenAs), modifiers: settled.modifiers, unresolvedModifiers: settled.unresolvedModifiers, cue: 'better than' },
      dna: DNA,
      hard: {},
      searchCandidates: t.fn,
      loadDimensions,
      preResolved: settled.resolved,
    });
    expect(resumed.objective.relation).toBe('better_than');
    expect(resumed.objective.anchors).toHaveLength(2);
    expect(resumed.objective.anchors.map((a) => a.tmdbId).sort()).toEqual([270476, 415381]);
    expect(resumed.objective.authority).toBeGreaterThan(0);
    expect(resumed.plan.instructions.length).toBeGreaterThan(0);

    // …and the full critic actually executes on the resumed objective.
    const pool: CriticCandidate[] = [
      { id: 1, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: dims({ suspense: 89, darkness: 86, complexity: 83, humor: 11 }) },
      { id: 2, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: dims({ suspense: 20, darkness: 18, complexity: 22, humor: 85 }) },
    ];
    const ranked = rankCriticCandidates(pool, resumed.plan);
    expect(ranked.applied).toBe(true);
    expect(ranked.decisions[0]!.key).toBe('movie-1');
    const e = buildComparativeExplanation({
      relation: resumed.objective.relation,
      anchors: resumed.objective.anchors,
      contributions: ranked.decisions[0]!.contributions,
      nudge: ranked.decisions[0]!.criticNudge,
    });
    expect(e).not.toBeNull();
    expect(e!.anchors.sort()).toEqual(['Furious', 'Widows Bay']);
  });

  it('F · NO DOUBLE RESOLUTION — the carried anchor is never searched again', async () => {
    const settled = applyChoice(
      {
        text: INCIDENT, relation: 'better_than', modifiers: {}, unresolvedModifiers: [],
        resolved: [{ spokenAs: 'Widows Bay', tmdbId: 270476, mediaType: 'tv' }],
        pending: [{ spokenAs: 'Furious', reason: 'ambiguous', options: [] }],
      },
      { spokenAs: 'Furious', tmdbId: 415381, mediaType: 'movie' },
    );
    const t = tracingSearch();
    const resumed = await buildCriticState({
      request: { relation: 'better_than', referenceTitles: ['Widows Bay', 'Furious'], modifiers: {}, unresolvedModifiers: [], cue: 'better than' },
      dna: DNA, hard: {}, searchCandidates: t.fn, loadDimensions,
      preResolved: settled.resolved,
    });
    expect(t.searched, `re-searched: ${t.searched.join(', ')}`).toEqual([]);
    expect(resumed.objective.anchors).toHaveLength(2);
    // The carried anchor kept its fingerprint, so authority is real.
    expect(resumed.objective.anchors.every((a) => a.dims != null)).toBe(true);
  });
});

// ═══ G · HARD CONSTRAINTS SURVIVE THE ROUND TRIP ══════════════════════════

describe('clarify · stated facts survive the question', () => {
  it('G · runtime, provider, relation and the resolved anchor all persist', async () => {
    const HARD = { mediaType: 'movie' as const, providerIds: [15], maxYear: null, minYear: null };
    const s = await stateFor(INCIDENT, { hard: HARD });
    const c = needsClarification(INCIDENT, s.objective.relation, { pacing: 'higher' }, ['better acted'], s.resolutions)!;

    expect(c.comparison.relation).toBe('better_than');
    expect(c.comparison.modifiers).toEqual({ pacing: 'higher' });
    expect(c.comparison.unresolvedModifiers).toEqual(['better acted']);
    expect(c.comparison.resolved).toHaveLength(1);

    const settled = applyChoice(c.comparison, { spokenAs: 'Furious', tmdbId: 415381, mediaType: 'movie' });
    const resumed = await buildCriticState({
      request: { relation: settled.relation, referenceTitles: settled.resolved.map((r) => r.spokenAs), modifiers: settled.modifiers, unresolvedModifiers: settled.unresolvedModifiers, cue: 'better than' },
      dna: DNA,
      hard: HARD, // the caller's stated facts, unchanged
      searchCandidates: async () => [],
      loadDimensions,
      preResolved: settled.resolved,
    });
    expect(resumed.hints.hard).toEqual(HARD);
    expect(resumed.request.modifiers).toEqual({ pacing: 'higher' });
    const pacing = resumed.plan.instructions.find((i) => i.axis === 'pacing');
    expect(pacing?.evidence).toContain('request');
  });
});

// ═══ CONTEXT · deterministic only ═════════════════════════════════════════

describe('clarify · context may disambiguate only when it is decisive', () => {
  const opts = FURIOUS.map((f) => ({ tmdbId: f.id, title: f.title, mediaType: f.mediaType, year: f.year }));

  it('X1 · a stated year + media type that leaves ONE candidate is honoured', () => {
    expect(disambiguateFromContext(opts, { year: 2017, mediaType: 'movie' })?.tmdbId).toBe(415381);
  });

  it('X2 · media type alone is NOT decisive here — so it asks', () => {
    expect(disambiguateFromContext(opts, { mediaType: 'movie' })).toBeNull(); // 4 remain
  });

  it('X3 · no context at all never resolves', () => {
    expect(disambiguateFromContext(opts, {})).toBeNull();
  });
});

// ═══ H · ORDINARY SEARCH UNCHANGED ════════════════════════════════════════

describe('clarify · non-comparative requests are untouched', () => {
  it('H1 · they never reach the critic, so they can never be asked to clarify', () => {
    for (const t of ['three wrestling movies', 'a boxing movie', 'crime dramas on BritBox', 'Widows Bay']) {
      expect(routeAsk(t, 'legacy').request, t).toBeNull();
    }
  });

  it('H2 · the clarification contract is inert without a pending anchor', () => {
    expect(needsClarification('x', 'like', {}, [], [])).toBeNull();
  });

  it('H3 · the route only clarifies on the critic path', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const block = route.slice(route.indexOf('0.9) THE CRITIC PATH'), route.indexOf('// 1) Named-title'));
    expect(block).toContain('needsClarification');
  });
});
