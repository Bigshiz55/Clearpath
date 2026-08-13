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
import type { AnchorCandidate } from './anchor';

/**
 * GC7 — GROUNDED COMPARATIVE EXPLANATIONS. Written to FAIL FIRST.
 *
 * GC6 decided which candidate wins. This proves we can say WHY, from the same
 * evidence and the same arithmetic — and, just as importantly, that we STAY
 * SILENT whenever the comparison did not actually decide anything.
 *
 * The language gate runs through every case: naming a title in "Better than X"
 * is not evidence the user liked X, and no sentence may claim it was.
 */

// ── GC2 candidates. Decoy first — search order is never identity ───────────
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

const dims = (o: Partial<Record<string, number>>): TitleDimensions =>
  ({
    pacing: 50, darkness: 50, warmth: 50, humor: 50, suspense: 50, emotion: 50,
    complexity: 50, realism: 50, character: 50, stakes: 50, morality: 50,
    violence: 50, attention: 50, serialized: 50, romance: 50,
    ...o,
  }) as TitleDimensions;

/** The brief's fixture: three traits the user likes, one they reject. */
const ANCHOR_DIMS = dims({ suspense: 88, darkness: 85, complexity: 82, humor: 80 });
/** Winner: preserves the three, reduces the fourth. */
const WINNER_DIMS = dims({ suspense: 88, darkness: 85, complexity: 82, humor: 12 });
/** Merely different. */
const OTHER_DIMS = dims({ suspense: 20, darkness: 20, complexity: 25, humor: 15 });

const loadDimensions = async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
  const m = new Map<string, TitleDimensions>();
  for (const k of keys) m.set(dimensionCacheKey(k.media_type, k.tmdb_id), ANCHOR_DIMS);
  return m;
};
const loadNothing = async () => new Map<string, TitleDimensions>();

const NOW = Date.UTC(2026, 5, 1);
const dnaFrom = (d: Record<string, number>) =>
  deriveDna(
    Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
      id: `e${i}`,
      at: NOW - (i + 1) * 86_400_000,
      titleId: `movie:${8000 + i}`,
      action: 'seen_liked',
      dims: d,
      genres: ['thriller'],
    })),
    NOW,
  );

const DNA_DARK = dnaFrom({ suspense: 88, darkness: 85, complexity: 84, humor: 10 });
const DNA_LIGHT = dnaFrom({ suspense: 12, darkness: 15, complexity: 16, humor: 90 });

const WINNER: CriticCandidate = { id: 9002, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: WINNER_DIMS };
const OTHER: CriticCandidate = { id: 9001, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: OTHER_DIMS };
const POOL = [OTHER, WINNER];

async function stateFor(text: string, dna: ReturnType<typeof dnaFrom>, load = loadDimensions) {
  const decision = routeAsk(text, 'legacy');
  return buildCriticState({
    request: decision.request!,
    dna,
    hard: { mediaType: 'movie' },
    searchCandidates,
    loadDimensions: load,
    anchorKeywordIds: [9001],
    anchorGenreIds: [53],
  });
}

/** The real production chain: orchestrate → rank → explain the winner. */
async function explainWinner(
  text: string,
  dna: ReturnType<typeof dnaFrom>,
  pool = POOL,
  load = loadDimensions,
) {
  const s = await stateFor(text, dna, load);
  const ranked = rankCriticCandidates(pool, s.plan);
  const top = ranked.decisions[0]!;
  return {
    state: s,
    ranked,
    top,
    explanation: buildComparativeExplanation({
      relation: s.objective.relation,
      anchors: s.objective.anchors,
      contributions: top.contributions,
      nudge: top.criticNudge,
    }),
  };
}

const allProse = (e: NonNullable<Awaited<ReturnType<typeof explainWinner>>['explanation']>) =>
  [...e.helped, ...e.cautions].join(' ');

// ───────────────────────────────────────────────────────────────────────────
// 0 · THE PRE-GC7 CORRECTION — `applied` means influence, not standing
// ───────────────────────────────────────────────────────────────────────────

describe('GC6 correction · applied means the plan actually moved something', () => {
  it('0a · valid plan, ALL candidate dims missing → applied false', async () => {
    const s = await stateFor('Better than Furious', DNA_DARK);
    expect(s.plan.instructions.length).toBeGreaterThan(0);
    expect(s.objective.authority).toBeGreaterThan(0);
    const blind = [
      { id: 1, mediaType: 'movie' as const, matchScore: 70, generalScore: 70 },
      { id: 2, mediaType: 'movie' as const, matchScore: 60, generalScore: 60 },
    ];
    const ranked = rankCriticCandidates(blind, s.plan);
    expect(ranked.eligible).toBe(true); // it had standing…
    expect(ranked.applied).toBe(false); // …and no influence
  });

  it('0b · fingerprints present but every contribution exactly 0 → applied false', async () => {
    const s = await stateFor('Better than Furious', DNA_DARK);
    /* A candidate silent on every axis the plan speaks about: it HAS a
       fingerprint, so `planNudge` runs, but no instruction finds a value. */
    const axes = new Set(s.plan.instructions.map((i) => i.axis));
    const silent = dims(
      Object.fromEntries([...axes].map((a) => [a, undefined])) as Partial<Record<string, number>>,
    );
    for (const a of axes) delete (silent as Record<string, unknown>)[a];
    const ranked = rankCriticCandidates(
      [{ id: 3, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: silent }],
      s.plan,
    );
    expect(ranked.eligible).toBe(true);
    expect(ranked.decisions[0]!.criticNudge).toBe(0);
    expect(ranked.applied).toBe(false);
  });

  it('0c · at least one non-zero contribution → applied true', async () => {
    const s = await stateFor('Better than Furious', DNA_DARK);
    const ranked = rankCriticCandidates(POOL, s.plan);
    expect(ranked.decisions.some((d) => d.criticNudge !== 0)).toBe(true);
    expect(ranked.applied).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1 · ONE SOURCE OF TRUTH — the explanation IS the ranking arithmetic
// ───────────────────────────────────────────────────────────────────────────

describe('GC7 · the explanation comes from the actual GC6 contribution trace', () => {
  it('1 · per-axis points sum to the nudge that produced the order', async () => {
    const { top } = await explainWinner('Better than Furious', DNA_DARK);
    const sum = top.contributions.reduce((s, c) => s + c.points, 0);
    expect(sum).toBeCloseTo(top.criticNudge, 6);
  });

  it('2 · the winner names real preserve and avoid causes', async () => {
    const { explanation, state } = await explainWinner('Better than Furious', DNA_DARK);
    expect(explanation).not.toBeNull();
    const kinds = new Map(state.plan.instructions.map((i) => [i.axis, i.kind]));
    expect(kinds.get('suspense')).toBe('preserve');
    expect(kinds.get('humor')).toBe('avoid');

    const axes = explanation!.axes.map((a) => a.axis);
    expect(axes).toContain('suspense'); // a preserved axis that helped
    expect(axes).toContain('humor'); // the avoided axis that helped
    const humor = explanation!.axes.find((a) => a.axis === 'humor')!;
    expect(humor.kind).toBe('avoid');
    expect(humor.points).toBeGreaterThan(0);
    expect(humor.evidence).toContain('user_dna');
    expect(humor.evidence).toContain('anchor');
  });

  it('3 · the resolved anchor identity is used, never a re-search', async () => {
    const { explanation } = await explainWinner('Better than Furious', DNA_DARK);
    expect(explanation!.anchors).toEqual(['Furious']);
    const src = readFileSync('src/lib/critic/explain.ts', 'utf8');
    /* Identity comes from the already-resolved anchor. Reading `spokenAs` is
       exactly the intended use — it exists for explanation copy — so what must
       be absent is any LOOKUP by that string. */
    expect(src).not.toContain('searchTitles');
    expect(src).not.toContain('pickMatch');
    expect(src).not.toContain('resolveAnchor');
  });

  it('4 · no explanation logic duplicates the scoring arithmetic', () => {
    const src = readFileSync('src/lib/critic/explain.ts', 'utf8');
    /* The one thing that would make the explanation able to drift from the
       decision: recomputing agreement here. */
    expect(src).not.toContain('CRITIC_NUDGE_MAX');
    expect(src).not.toMatch(/1\s*-\s*\(?2\s*\*/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · THE LANGUAGE GATE — anchor possession is not user affection
// ───────────────────────────────────────────────────────────────────────────

describe('GC7 · never claims the user liked something they did not say they liked', () => {
  it('5 · no "you liked"/"you loved"/"you enjoyed" anywhere in the copy', async () => {
    for (const dna of [DNA_DARK, DNA_LIGHT]) {
      for (const text of ['Better than Furious', 'something like Furious', 'Furious but faster']) {
        const { explanation } = await explainWinner(text, dna);
        if (!explanation) continue;
        const prose = allProse(explanation);
        expect(prose, `${text}`).not.toMatch(/you (?:liked|loved|enjoyed|rated|watched)/i);
        expect(prose).not.toMatch(/\byour favou?rite\b/i);
      }
    }
  });

  it('6 · provenance controls the wording', async () => {
    const { explanation } = await explainWinner('Better than Furious', DNA_DARK);
    const prose = allProse(explanation!);
    /* `user_dna` participated on these axes, so a taste claim is grounded. */
    expect(prose).toMatch(/your taste|your profile/i);
    // The anchor is named as the SOURCE OF A TRAIT, not as something they loved.
    expect(prose).toContain('Furious');
  });

  it('7 · an anchor-only instruction makes no claim about the user', async () => {
    /* A user with no confident DNA: `like` still preserves the anchor's shape,
       but nothing licenses a sentence about their taste. */
    const s = await stateFor('something like Furious', deriveDna([], NOW));
    const ranked = rankCriticCandidates(POOL, s.plan);
    const top = ranked.decisions[0]!;
    const e = buildComparativeExplanation({
      relation: s.objective.relation,
      anchors: s.objective.anchors,
      contributions: top.contributions,
      nudge: top.criticNudge,
    });
    if (e) {
      const prose = allProse(e);
      expect(prose).not.toMatch(/your taste|your profile/i);
      for (const a of e.axes) expect(a.evidence).not.toContain('user_dna');
    }
  });

  it('7b · an anchor claim states the ANCHOR\'s level, not the candidate\'s', async () => {
    /* REGRESSION. The avoid line first read the level off `target` (where we
       want the candidate) / `candidateValue` (where it landed), producing
       "Drops the LOW humour of Furious" — while Furious sits at 80 on humour.
       A confident, fluent sentence about the wrong title is exactly the failure
       this gate exists to catch, and it is invisible unless asserted. */
    const { explanation } = await explainWinner('Better than Furious', DNA_DARK);
    const line = explanation!.helped.find((l) => /humour of Furious/.test(l));
    expect(line, 'no anchor humour claim was made').toBeDefined();
    expect(line).toContain('high humour of Furious'); // ANCHOR_DIMS.humor === 80
    expect(line).not.toContain('low humour');
  });

  it('8 · better_than never claims objective superiority', async () => {
    const { explanation } = await explainWinner('Better than Furious', DNA_DARK);
    const prose = allProse(explanation!);
    expect(prose).not.toMatch(/objectively better|better than Furious|superior|higher rated|acclaim/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · COUNTERFACTUAL — opposite DNA, materially different explanation
// ───────────────────────────────────────────────────────────────────────────

describe('GC7 · the explanation follows the cause, not a template', () => {
  it('9 · opposite mature DNA produces a materially different explanation', async () => {
    const dark = await explainWinner('Better than Furious', DNA_DARK);
    const light = await explainWinner('Better than Furious', DNA_LIGHT);
    expect(dark.explanation).not.toBeNull();
    expect(light.explanation).not.toBeNull();
    expect(allProse(dark.explanation!)).not.toEqual(allProse(light.explanation!));
    // …and it is not merely reworded: the winning candidate itself flipped.
    expect(dark.top.key).not.toBe(light.top.key);
  });

  it('10 · the reason is specific, never a generic "strong match"', async () => {
    const { explanation } = await explainWinner('Better than Furious', DNA_DARK);
    const prose = allProse(explanation!);
    expect(prose).not.toMatch(/strong match for you|great fit|you'll love/i);
    expect(prose.length).toBeGreaterThan(20);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4 · REQUEST MODIFIERS — provenance decides what we call it
// ───────────────────────────────────────────────────────────────────────────

describe('GC7 · an explicit modifier is named as a request, not as taste', () => {
  it('11 · "Furious but faster" identifies pacing as request-derived', async () => {
    const { explanation, state } = await explainWinner('Furious but faster', DNA_DARK);
    expect(state.request.relation).toBe('like_but');
    expect(state.request.modifiers).toEqual({ pacing: 'higher' });
    const pacing = explanation!.axes.find((a) => a.axis === 'pacing');
    expect(pacing, 'pacing did not participate').toBeDefined();
    expect(pacing!.evidence).toContain('request');
    const prose = allProse(explanation!);
    expect(prose).toMatch(/the change you asked for/i);
  });

  it('12 · a request-derived axis is not described as a Taste-DNA preference', async () => {
    const { explanation } = await explainWinner('Furious but faster', DNA_DARK);
    const line = explanation!.helped.find((l) => /pacing/i.test(l));
    if (line) expect(line).not.toMatch(/your profile favours|your taste/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5 · SILENCE — no contribution, no explanation
// ───────────────────────────────────────────────────────────────────────────

describe('GC7 · zero impact produces zero comparative explanation', () => {
  it('13 · a candidate with no cached fingerprint gets no critic explanation', async () => {
    const s = await stateFor('Better than Furious', DNA_DARK);
    const blind: CriticCandidate = { id: 7, mediaType: 'movie', matchScore: 70, generalScore: 70 };
    const ranked = rankCriticCandidates([blind], s.plan);
    const d = ranked.decisions[0]!;
    expect(
      buildComparativeExplanation({
        relation: s.objective.relation,
        anchors: s.objective.anchors,
        contributions: d.contributions,
        nudge: d.criticNudge,
      }),
    ).toBeNull();
  });

  it('14 · authority 0 produces no critic explanation', async () => {
    const s = await stateFor('Better than Furious', DNA_DARK, loadNothing);
    expect(s.objective.authority).toBe(0);
    const ranked = rankCriticCandidates(POOL, s.plan);
    for (const d of ranked.decisions) {
      expect(
        buildComparativeExplanation({
          relation: s.objective.relation,
          anchors: s.objective.anchors,
          contributions: d.contributions,
          nudge: d.criticNudge,
        }),
      ).toBeNull();
    }
  });

  it('15 · a caution requires a real negative contribution, not second place', async () => {
    const { ranked, state } = await explainWinner('Better than Furious', DNA_DARK);
    const loser = ranked.decisions[ranked.decisions.length - 1]!;
    const e = buildComparativeExplanation({
      relation: state.objective.relation,
      anchors: state.objective.anchors,
      contributions: loser.contributions,
      nudge: loser.criticNudge,
    });
    if (e) {
      /* Whatever it says must trace to a real negative point — placing last is
         not evidence about any axis. */
      for (const c of e.cautions) expect(c.length).toBeGreaterThan(0);
      const negatives = loser.contributions.filter((c) => c.points < 0);
      if (e.cautions.length > 0) expect(negatives.length).toBeGreaterThan(0);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6 · RELATION SEMANTICS AND ANCHOR HONESTY
// ───────────────────────────────────────────────────────────────────────────

describe('GC7 · relation semantics and anchor attribution', () => {
  it('16 · "like" explains actual resemblance on contributing axes', async () => {
    const { explanation, state } = await explainWinner('something like Furious', DNA_DARK);
    expect(state.objective.relation).toBe('like');
    if (explanation) {
      expect(explanation.axes.length).toBeGreaterThan(0);
      expect(allProse(explanation)).toMatch(/keeps|tracks|holds/i);
    }
  });

  it('17 · blend never assigns a trait to one particular anchor', async () => {
    const { explanation } = await explainWinner('Furious meets Widows Bay', DNA_DARK);
    if (explanation && explanation.anchors.length > 1) {
      const prose = allProse(explanation);
      /* With two anchors the plan read their MEAN, so naming one alone would be
         invented specificity. Either both are named together or neither is. */
      const soloFurious = /Furious's/.test(prose) && !/Widows Bay/.test(prose);
      const soloWidows = /Widows Bay's/.test(prose) && !/Furious/.test(prose);
      expect(soloFurious).toBe(false);
      expect(soloWidows).toBe(false);
    }
  });

  it('18 · an unresolved anchor is never spoken of as understood', async () => {
    const s = await buildCriticState({
      request: routeAsk('better than Zzyzx Nonexistent', 'legacy').request!,
      dna: DNA_DARK,
      hard: {},
      searchCandidates: async () => [],
      loadDimensions,
    });
    expect(s.objective.anchors).toHaveLength(0);
    const ranked = rankCriticCandidates(POOL, s.plan);
    const d = ranked.decisions[0]!;
    const e = buildComparativeExplanation({
      relation: s.objective.relation,
      anchors: s.objective.anchors,
      contributions: d.contributions,
      nudge: d.criticNudge,
    });
    expect(e).toBeNull();
  });

  it('19 · prose never exposes raw coefficients', async () => {
    const { explanation } = await explainWinner('Better than Furious', DNA_DARK);
    const prose = allProse(explanation!);
    expect(prose).not.toMatch(/[+-]?\d+\.\d+/); // no 7.483
    expect(prose).not.toMatch(/critic points|nudge|decisionScore/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7 · PRODUCTION WIRING AND DISPLAY SEMANTICS
// ───────────────────────────────────────────────────────────────────────────

describe('GC7 · production wiring and display semantics', () => {
  it('20 · the route attaches the comparative reason to the returned items', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('buildComparativeExplanation');
  });

  it('21 · the customer-facing reason does NOT depend on NODE_ENV', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const idx = route.indexOf('buildComparativeExplanation');
    const devGate = route.indexOf("process.env.NODE_ENV === 'production'");
    /* Diagnostics stay dev-only; the explanation the UI renders must ship in
       production, so it is built before that gate. */
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(devGate);
  });

  it('22 · matchScore is still what the card displays; decisionScore is not', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).not.toMatch(/matchScore:\s*d\.decisionScore/);
    expect(route).not.toMatch(/matchScore:\s*decisionScore/);
    const ui = readFileSync('src/components/verdict/WhyVerdict.tsx', 'utf8');
    expect(ui).not.toContain('decisionScore');
  });

  it('23 · the UI section only renders with grounded evidence', () => {
    const ui = readFileSync('src/components/verdict/WhyVerdict.tsx', 'utf8');
    expect(ui).toContain('comparison');
    /* A null explanation must render nothing at all — no empty heading. */
    expect(ui).toMatch(/comparison\s*&&/);
  });
});
