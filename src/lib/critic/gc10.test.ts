import { describe, it, expect } from 'vitest';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { extractReference } from '@/lib/askJudge';
import { classifySearch } from '@/lib/nlu/searchMode';
import { applyTurn, EMPTY_REQUEST } from '@/lib/nlu/conversationState';
import { routeAsk } from './gate';
import { buildCriticState, type CriticState } from './orchestrate';
import { dimensionCacheKey } from './hydrate';
import { rankCriticCandidates, type CriticCandidate } from './decide';
import { buildComparativeExplanation } from './explain';
import type { AnchorCandidate } from './anchor';

/**
 * GC10 — THE ORIGINAL FAILURE, EXACT SENTENCE.
 *
 * Production was asked "Better than Furious or Widows Bay" and answered with
 * Cool Hand Luke, explained as "matches your general drama and crime
 * preferences". This pins that incident.
 *
 * ── LITERAL SENTENCE, STRUCTURAL MECHANISM ────────────────────────────────
 * The text below is verbatim. Everything that reads it is generic: there is no
 * branch on "Furious", no check for the id 502, no hardcoded winner and no
 * special keyword list. Fixtures supply deterministic identity and fingerprints
 * because TMDB is not what this gate tests — the PIPELINE is.
 *
 * ── WHAT IT REFUSES TO DO ─────────────────────────────────────────────────
 * It does not freeze a recommendation. Asserting "the answer is Movie Y
 * forever" would break the moment scoring legitimately improves, and would
 * measure a throne rather than an architecture. Every assertion below is an
 * INVARIANT PROPERTY: the relation survived, both identities survived, the plan
 * came from grounded evidence, the order materially depended on it, the
 * explanation describes that same arithmetic, and no unsupported claim about
 * the user appeared.
 */

/** THE SENTENCE. Verbatim, as typed into production. */
const INCIDENT = 'Better than Furious or Widows Bay';
/** The structural control: same titles, different relationship. */
const CONTROL = 'Something like Furious or Widows Bay';

// ── Deterministic identity. Decoys FIRST, so search order cannot be identity ─
const CATALOGUE: Record<string, AnchorCandidate[]> = {
  Furious: [
    { id: 501, title: 'Furious 7', mediaType: 'movie', year: 2015 },
    { id: 502, title: 'Furious', mediaType: 'movie', year: 2017 },
  ],
  'Widows Bay': [
    { id: 601, title: 'Widows', mediaType: 'movie', year: 2018 },
    { id: 602, title: 'Widows Bay', mediaType: 'movie', year: 2021 },
  ],
};
const searchCandidates = async (name: string) => CATALOGUE[name] ?? [];

const dims = (o: Partial<Record<string, number>>): TitleDimensions =>
  ({
    pacing: 50, darkness: 50, warmth: 50, humor: 50, suspense: 50, emotion: 50,
    complexity: 50, realism: 50, character: 50, stakes: 50, morality: 50,
    violence: 50, attention: 50, serialized: 50, romance: 50,
    ...o,
  }) as TitleDimensions;

/* Both anchors agree closely — high tension and high humour — so the plan can
   reason about them jointly, which is what "better than X OR Y" means. */
const FURIOUS_DIMS = dims({ suspense: 88, darkness: 84, complexity: 80, humor: 82 });
const WIDOWS_DIMS = dims({ suspense: 86, darkness: 86, complexity: 82, humor: 78 });

const loadDimensions = async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
  const m = new Map<string, TitleDimensions>();
  for (const k of keys) {
    if (k.tmdb_id === 502) m.set(dimensionCacheKey(k.media_type, k.tmdb_id), FURIOUS_DIMS);
    if (k.tmdb_id === 602) m.set(dimensionCacheKey(k.media_type, k.tmdb_id), WIDOWS_DIMS);
  }
  return m;
};

const NOW = Date.UTC(2026, 5, 1);
/** Mature, decisive: wants tension/darkness/complexity, rejects the jokiness. */
const DNA = deriveDna(
  Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
    id: `e${i}`,
    at: NOW - (i + 1) * 86_400_000,
    titleId: `movie:${11000 + i}`,
    action: 'seen_liked',
    dims: { suspense: 88, darkness: 85, complexity: 84, humor: 10 },
    genres: ['thriller'],
  })),
  NOW,
);

const HARD = { mediaType: 'movie' as const, minYear: 2015 };

async function pipeline(text: string): Promise<CriticState> {
  const decision = routeAsk(text, 'legacy');
  expect(decision.consumer, `${text} did not reach the critic`).toBe('critic');
  return buildCriticState({
    request: decision.request!,
    dna: DNA,
    hard: HARD,
    searchCandidates,
    loadDimensions,
    anchorKeywordIds: [9001, 9002],
    anchorGenreIds: [53],
  });
}

/* A pool whose members disagree about what "better" means. Identical base
   scores, so ONLY the critic can order them. */
const POOL: CriticCandidate[] = [
  // Reproduces the anchors wholesale, jokiness included.
  { id: 3001, mediaType: 'movie', matchScore: 72, generalScore: 72, dims: dims({ suspense: 87, darkness: 85, complexity: 81, humor: 80 }) },
  // Keeps what this user likes, drops what they don't.
  { id: 3002, mediaType: 'movie', matchScore: 72, generalScore: 72, dims: dims({ suspense: 89, darkness: 86, complexity: 83, humor: 11 }) },
  // Unrelated — the "Cool Hand Luke" shape: a fine drama that answers nothing.
  { id: 3003, mediaType: 'movie', matchScore: 72, generalScore: 72, dims: dims({ suspense: 30, darkness: 45, complexity: 55, humor: 35 }) },
];

const explainFor = (s: CriticState, d: { contributions: never[]; criticNudge: number } | { contributions: unknown[]; criticNudge: number }) =>
  buildComparativeExplanation({
    relation: s.objective.relation,
    anchors: s.objective.anchors,
    contributions: d.contributions as never,
    nudge: d.criticNudge,
  });

// ───────────────────────────────────────────────────────────────────────────
// 1 · THE ORIGINAL DEFECT — pinned against the shipped parsers
// ───────────────────────────────────────────────────────────────────────────

describe('GC10 · the structural defect this workstream exists to fix', () => {
  it('1 · the shipped extractors still lose the sentence entirely', () => {
    /* THE REGRESSION ANCHOR. These are the untouched production parsers, and
       they behave exactly as they did when Cool Hand Luke shipped: "better
       than" is invisible, and the WHOLE SENTENCE is taken for a film title.
       If a future change makes the critic path unreachable, the request falls
       back to precisely this — so it is asserted rather than assumed. */
    expect(extractReference(INCIDENT)).toBeNull();
    expect(classifySearch(INCIDENT).mode).toBe('exact_title');
    expect(classifySearch(INCIDENT).requestedTitle).toBe(INCIDENT);
    expect(applyTurn(EMPTY_REQUEST, INCIDENT, {}).state.referenceTitles).toEqual([]);
  });

  it('2 · the critic path claims the sentence before that fallback can', () => {
    const d = routeAsk(INCIDENT, 'legacy');
    expect(d.comparative).toBe(true);
    expect(d.consumer).toBe('critic');
    // …and in every serving mode, so a provider flag cannot resurrect the bug.
    for (const mode of ['legacy', 'shadow', 'anthropic'] as const) {
      expect(routeAsk(INCIDENT, mode).consumer, mode).toBe('critic');
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · END TO END, ONE STAGE AT A TIME
// ───────────────────────────────────────────────────────────────────────────

describe('GC10 · every stage carries the meaning forward', () => {
  it('3 · GC1 — the relation survives as better_than', async () => {
    const s = await pipeline(INCIDENT);
    expect(s.request.relation).toBe('better_than');
    expect(s.objective.relation).toBe('better_than');
  });

  it('4 · GC1 — TWO distinct anchor strings survive, unflattened', async () => {
    const s = await pipeline(INCIDENT);
    expect(s.request.referenceTitles).toEqual(['Furious', 'Widows Bay']);
    expect(s.request.referenceTitles).toHaveLength(2);
  });

  it('5 · GC2 — each anchor resolves independently, rejecting the decoys', async () => {
    const s = await pipeline(INCIDENT);
    expect(s.objective.anchors).toHaveLength(2);
    const ids = s.objective.anchors.map((a) => a.tmdbId).sort();
    expect(ids).toEqual([502, 602]);
    expect(ids).not.toContain(501); // Furious 7
    expect(ids).not.toContain(601); // Widows
    expect(s.attribution.resolution.every((r) => r.status === 'resolved')).toBe(true);
  });

  it('6 · GC3 — both hydrate from the canonical fingerprint path', async () => {
    const s = await pipeline(INCIDENT);
    expect(s.objective.anchors.every((a) => a.dims != null)).toBe(true);
    expect(s.attribution.hydrated).toHaveLength(2);
    expect(s.attribution.hydrated.every((h) => h.hydrated)).toBe(true);
  });

  it('7 · authority honestly reflects resolution AND hydration', async () => {
    const full = await pipeline(INCIDENT);
    expect(full.objective.authority).toBeGreaterThan(0);

    // One anchor unresolvable → strictly less authority, still positive.
    const half = await buildCriticState({
      request: routeAsk(INCIDENT, 'legacy').request!,
      dna: DNA,
      hard: HARD,
      searchCandidates: async (n) => (n === 'Furious' ? CATALOGUE.Furious! : []),
      loadDimensions,
    });
    expect(half.objective.anchors).toHaveLength(1);
    expect(half.objective.authority).toBeGreaterThan(0);
    expect(half.objective.authority).toBeLessThan(full.objective.authority);

    // Neither hydrates → exactly zero, and the plan says nothing.
    const dry = await buildCriticState({
      request: routeAsk(INCIDENT, 'legacy').request!,
      dna: DNA, hard: HARD, searchCandidates,
      loadDimensions: async () => new Map(),
    });
    expect(dry.objective.authority).toBe(0);
    expect(dry.plan.instructions).toEqual([]);
  });

  it('8 · GC4 — a grounded plan is built from relation + anchors + DNA', async () => {
    const s = await pipeline(INCIDENT);
    expect(s.plan.instructions.length).toBeGreaterThan(0);
    for (const i of s.plan.instructions) {
      expect(i.evidence.length).toBeGreaterThan(0);
      for (const e of i.evidence) expect(['anchor', 'user_dna', 'request']).toContain(e);
    }
    /* The distinction undirected distance destroys: keep the tension, drop the
       jokiness — derived, never hardcoded. */
    const kinds = new Map(s.plan.instructions.map((i) => [i.axis, i.kind]));
    expect(kinds.get('suspense')).toBe('preserve');
    expect(kinds.get('humor')).toBe('avoid');
  });

  it('9 · GC5 — retrieval is broadened and keeps an ungated recall floor', async () => {
    const s = await pipeline(INCIDENT);
    expect(s.hints.strands.length).toBeGreaterThan(1);
    expect(s.attribution.strands).toContain('recall-floor');
    // The floor is gated by NO critic inference — that is what makes it a floor.
    const floor = s.hints.strands.find((x) => x.label === 'recall-floor')!;
    expect(floor.keywordIds ?? []).toEqual([]);
    expect(floor.genreIds ?? []).toEqual([]);
  });

  it('10 · GC5 — the stated hard constraints survive, and no inference joins them', async () => {
    const s = await pipeline(INCIDENT);
    expect(s.hints.hard).toEqual(HARD);
    const blob = JSON.stringify(s.hints.hard);
    expect(blob).not.toContain('9001'); // anchor keyword
    expect(blob).not.toContain('53'); // anchor genre
    // No dimension axis was ever converted into a search filter.
    const strands = JSON.stringify(s.hints.strands);
    for (const axis of s.attribution.rankingOnlyAxes) expect(strands).not.toContain(`"${axis}"`);
  });

  it('11 · GC6 — the candidate pool reaches ranking and the critic consumes it', async () => {
    const s = await pipeline(INCIDENT);
    const ranked = rankCriticCandidates(POOL, s.plan);
    expect(ranked.eligible).toBe(true);
    expect(ranked.applied).toBe(true);
    // Same membership in, same membership out — order is the only change.
    expect(ranked.decisions.map((d) => d.key).sort()).toEqual(
      POOL.map((c) => `${c.mediaType}-${c.id}`).sort(),
    );
  });

  it('12 · GC6 — the ORDER materially depends on the critic', async () => {
    const s = await pipeline(INCIDENT);
    const withCritic = rankCriticCandidates(POOL, s.plan);
    const without = rankCriticCandidates(POOL, undefined);
    expect(withCritic.decisions.map((d) => d.key)).not.toEqual(without.decisions.map((d) => d.key));
    /* Base scores are identical across the pool, so without the critic nothing
       can reorder — and with it, something did. */
    expect(without.decisions.every((d) => d.criticNudge === 0)).toBe(true);
    expect(withCritic.decisions.some((d) => Math.abs(d.criticNudge) > 1)).toBe(true);
  });

  it('13 · GC7 — the explanation is generated from THAT decision arithmetic', async () => {
    const s = await pipeline(INCIDENT);
    const top = rankCriticCandidates(POOL, s.plan).decisions[0]!;
    const sum = top.contributions.reduce((acc, c) => acc + c.points, 0);
    expect(sum).toBeCloseTo(top.criticNudge, 6);

    const e = explainFor(s, top);
    expect(e).not.toBeNull();
    expect(e!.helped.length).toBeGreaterThan(0);
    // Every axis it speaks about really participated in the ranking.
    const ranked = new Set(top.contributions.map((c) => c.axis));
    for (const a of e!.axes) expect(ranked.has(a.axis)).toBe(true);
  });

  it('14 · GC7 — the anchors are referenced honestly, with no invented claim', async () => {
    const s = await pipeline(INCIDENT);
    const top = rankCriticCandidates(POOL, s.plan).decisions[0]!;
    const e = explainFor(s, top)!;
    // Both resolved anchors, spoken as the user typed them.
    expect(e.anchors.sort()).toEqual(['Furious', 'Widows Bay']);

    const prose = [...e.helped, ...e.cautions].join(' ');
    /* THE CLAIM THAT MUST NEVER APPEAR. Naming a title in "better than X" is
       not evidence the user liked, rated or watched it. */
    expect(prose).not.toMatch(/you (?:liked|loved|enjoyed|rated|watched|saw)/i);
    expect(prose).not.toMatch(/\byour favou?rite\b/i);
    // Nor may it claim objective superiority over the named titles.
    expect(prose).not.toMatch(/objectively better|superior|higher rated|acclaim/i);
    /* With TWO anchors the plan read their mean, so a trait may not be assigned
       to one of them alone. */
    const soloFurious = /Furious's/.test(prose) && !/Widows Bay/.test(prose);
    const soloWidows = /Widows Bay's/.test(prose) && !/Furious/.test(prose);
    expect(soloFurious).toBe(false);
    expect(soloWidows).toBe(false);
  });

  it('15 · display semantics — durable Match survives, decisionScore is not a rating', async () => {
    const s = await pipeline(INCIDENT);
    const ranked = rankCriticCandidates(POOL, s.plan);
    for (const d of ranked.decisions) {
      const src = POOL.find((c) => `${c.mediaType}-${c.id}` === d.key)!;
      expect(d.matchScore).toBe(src.matchScore);
      expect(d.generalScore).toBe(src.generalScore);
      expect(d.decisionScore).toBeCloseTo(d.matchScore + d.criticNudge, 10);
    }
    // The explanation never quotes a coefficient.
    const top = ranked.decisions[0]!;
    const prose = explainFor(s, top)!.helped.join(' ');
    expect(prose).not.toMatch(/\d+\.\d+/);
  });

  it('16 · the critic stays bounded — it cannot buy a materially better baseline', async () => {
    const s = await pipeline(INCIDENT);
    /* The unrelated drama is 25 points better on durable merit and the worst
       possible fit for the plan. ±10 cannot close that. */
    const strongUnrelated: CriticCandidate[] = POOL.map((c) =>
      c.id === 3003 ? { ...c, matchScore: 97, generalScore: 97 } : c,
    );
    const ranked = rankCriticCandidates(strongUnrelated, s.plan);
    expect(ranked.decisions[0]!.key).toBe('movie-3003');
    for (const d of ranked.decisions) expect(Math.abs(d.criticNudge)).toBeLessThanOrEqual(10);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · THE COUNTERFACTUAL CONTROL — same titles, different relationship
// ───────────────────────────────────────────────────────────────────────────

describe('GC10 · same anchors, different relationship, different objective', () => {
  it('17 · the control resolves the SAME two identities', async () => {
    const incident = await pipeline(INCIDENT);
    const control = await pipeline(CONTROL);
    const ids = (s: CriticState) => s.objective.anchors.map((a) => a.titleId).sort();
    expect(ids(control)).toEqual(ids(incident));
    expect(ids(incident)).toEqual(['movie:502', 'movie:602']);
  });

  it('18 · …and yet the objectives are not equivalent', async () => {
    const incident = await pipeline(INCIDENT);
    const control = await pipeline(CONTROL);
    expect(incident.objective.relation).toBe('better_than');
    expect(control.objective.relation).toBe('like');
    // Retrieval differs where the relation legitimately reaches it.
    expect(incident.attribution.strands).not.toEqual(control.attribution.strands);
  });

  it('19 · the two requests do not collapse into one search', async () => {
    /* THE DEFECT CLASS THAT STARTED THIS WORKSTREAM: "like X" and "better than
       X" once produced byte-identical queries. */
    const incident = await pipeline(INCIDENT);
    const control = await pipeline(CONTROL);
    expect(JSON.stringify(incident.hints.strands)).not.toEqual(JSON.stringify(control.hints.strands));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4 · NO SPECIAL-CASING — the mechanism is generic
// ───────────────────────────────────────────────────────────────────────────

describe('GC10 · the fix is structural, not a special case for these titles', () => {
  it('20 · no production module mentions the incident titles', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = 'src/lib/critic';
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.includes('.test.')) continue;
      const src = readFileSync(`${dir}/${f}`, 'utf8');
      /* Docblocks legitimately discuss the incident, so this checks the CODE:
         no branch, no comparison, no lookup keyed on these names. */
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${f} references the incident titles in code`).not.toMatch(/Furious|Widows Bay/);
    }
  });

  it('21 · the same shapes work on entirely different titles', () => {
    /* If the mechanism were special-cased, these would not parse. */
    const other = routeAsk('Better than Heat or Sicario', 'legacy').request!;
    expect(other.relation).toBe('better_than');
    expect(other.referenceTitles).toEqual(['Heat', 'Sicario']);
  });
});
