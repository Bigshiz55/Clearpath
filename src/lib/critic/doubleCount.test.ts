import { describe, it, expect } from 'vitest';
import { computePersonalMatch, type PersonalContext } from '@/lib/scoring/personal';
import { computeGeneralScore } from '@/lib/scoring';
import { deriveDna } from '@/lib/preference/engine';
import { effectiveTaste } from '@/lib/preference/explain';
import { MIN_RANK_CONF } from '@/lib/preference/rank';
import type { PreferenceEvent } from '@/lib/preference/types';
import type { PreferenceRule, TitleMetadata } from '@/lib/types';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { buildPlan } from './plan';
import { rankCriticCandidates, type CriticCandidate } from './decide';
import type { ResolvedAnchor } from './objective';
import { objectiveAuthority } from './objective';

/**
 * THE DOUBLE-COUNT AUDIT, MADE EXECUTABLE — GC6 Phase 1.
 *
 * Two independent personalization systems exist and they are stored in
 * different tables, which is exactly why "different tables" is not an answer:
 *
 *   LEGACY RULES   `preference_rules` -> computePersonalMatch -> matchScore
 *                  vocabulary: slow_burn, grounded_crime, noir, …
 *   CANONICAL DNA  `preference_events` -> deriveDna -> effectiveTaste
 *                  vocabulary: pacing, darkness, complexity, …
 *
 * `slow_burn` and low `pacing` are THE SAME UNDERLYING PREFERENCE expressed in
 * two vocabularies. So do the numbers actually stack? These four cases print
 * the real terms rather than reasoning about them.
 */

// ── A slow-burn crime drama: fires the legacy rule AND is low on pacing ────
const SLOW_CRIME: TitleMetadata = {
  id: 1,
  mediaType: 'movie',
  title: 'Slow Burn Crime',
  year: 2020,
  genres: ['drama', 'crime'],
  keywords: ['slow burn', 'meditative'],
  runtimeMinutes: 130,
  voteAverage: 7.2,
  voteCount: 5000,
  popularity: 30,
  englishAvailability: 'native',
  posterPath: null,
  overview: '',
} as unknown as TitleMetadata;

const SLOW_DIMS: TitleDimensions = {
  pacing: 12, darkness: 70, warmth: 30, humor: 15, suspense: 65, emotion: 50,
  complexity: 75, realism: 80, character: 70, stakes: 55, morality: 45,
  violence: 40, attention: 70, serialized: 20, romance: 15,
} as TitleDimensions;

const FAST_DIMS: TitleDimensions = {
  ...SLOW_DIMS, pacing: 90, complexity: 25,
} as TitleDimensions;

const SLOW_BURN_RULE: PreferenceRule = {
  trait: 'slow_burn',
  weight: 12, // this user LIKES slow burns
  requiresDefining: false,
  label: 'Slow Burn',
};

const NOW = Date.UTC(2026, 5, 1);
const dnaFrom = (d: Record<string, number>) =>
  deriveDna(
    Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
      id: `e${i}`,
      at: NOW - (i + 1) * 86_400_000,
      titleId: `movie:${7000 + i}`,
      action: 'seen_liked',
      dims: d,
      genres: ['drama'],
    })),
    NOW,
  );

/** Canonical DNA that ALSO means "I like slow" — the semantic twin. */
const DNA_SLOW = dnaFrom({ pacing: 12, complexity: 78, darkness: 68 });
/** Canonical DNA meaning the OPPOSITE of the legacy rule. */
const DNA_FAST = dnaFrom({ pacing: 92, complexity: 22, darkness: 30 });
const DNA_NONE = deriveDna([], NOW);

const EMPTY_RULES: PersonalContext = {
  label: 'General Verdict', rules: [], likedFranchiseIds: [], collectionId: null, hasSignal: false,
};
const WITH_RULE: PersonalContext = {
  label: 'My Match', rules: [SLOW_BURN_RULE], likedFranchiseIds: [], collectionId: null, hasSignal: true,
};

const anchor: ResolvedAnchor = {
  titleId: 'movie:900',
  tmdbId: 900,
  mediaType: 'movie',
  spokenAs: 'Anchor',
  dims: FAST_DIMS, // the anchor is FAST — so pacing is genuinely in play
  confidence: 1,
};
const AUTHORITY = objectiveAuthority([anchor]);

const GENERAL = computeGeneralScore(SLOW_CRIME, null).score;

/** The full production composition for one candidate, term by term. */
function terms(rules: PersonalContext, dna: ReturnType<typeof dnaFrom>) {
  const personal = computePersonalMatch(SLOW_CRIME, GENERAL, rules);
  const plan = buildPlan({
    relation: 'better_than',
    anchors: [anchor],
    dna,
    modifiers: {},
    authority: AUTHORITY,
  });
  const candidate: CriticCandidate = {
    id: 1,
    mediaType: 'movie',
    matchScore: personal.score,
    generalScore: GENERAL,
    dims: SLOW_DIMS,
  };
  const ranked = rankCriticCandidates([candidate], plan);
  const d = ranked.decisions[0]!;
  const taste = effectiveTaste(dna);
  const pacingBelief = taste['pacing'];
  return {
    general: GENERAL,
    ruleTerm: personal.score - GENERAL,
    matchScore: personal.score,
    criticNudge: Number(d.criticNudge.toFixed(2)),
    decisionScore: Number(d.decisionScore.toFixed(2)),
    planPacing: plan.instructions.find((i) => i.axis === 'pacing') ?? null,
    dnaPacingConfident:
      pacingBelief != null && pacingBelief.confidence >= MIN_RANK_CONF && pacingBelief.polarity !== 0,
  };
}

describe('GC6 audit · the four double-count cases, with real numbers', () => {
  it('CASE 1 — legacy rule, NO canonical DNA', () => {
    const t = terms(WITH_RULE, DNA_NONE);
    console.log('CASE 1 (rule only)      ', JSON.stringify(t));
    // The rule moves the durable score…
    expect(t.ruleTerm).toBeGreaterThan(0);
    // …and with no DNA there is no plan instruction and no critic term at all.
    expect(t.dnaPacingConfident).toBe(false);
    expect(t.criticNudge).toBe(0);
    expect(t.decisionScore).toBe(t.matchScore);
  });

  it('CASE 2 — canonical DNA, NO legacy rule', () => {
    const t = terms(EMPTY_RULES, DNA_SLOW);
    console.log('CASE 2 (DNA only)       ', JSON.stringify(t));
    // No rule fires, so matchScore is the untouched general score.
    expect(t.ruleTerm).toBe(0);
    expect(t.matchScore).toBe(t.general);
    // The DNA reaches ranking ONLY through the plan.
    expect(t.dnaPacingConfident).toBe(true);
    expect(t.criticNudge).not.toBe(0);
  });

  it('CASE 3 — BOTH, expressing the SAME semantic preference', () => {
    /* THE OVERLAP CASE. `slow_burn` (+12 into matchScore) and low canonical
       `pacing` (a plan instruction) are the same taste in two vocabularies, and
       BOTH terms fire on the same candidate. */
    const t = terms(WITH_RULE, DNA_SLOW);
    console.log('CASE 3 (same, OVERLAP)  ', JSON.stringify(t));
    expect(t.ruleTerm).toBeGreaterThan(0);
    expect(t.criticNudge).toBeGreaterThan(0);
    // Both push the SAME direction on the SAME underlying preference.
    expect(t.decisionScore).toBeGreaterThan(t.matchScore);

    /* WHY THIS IS ACCEPTABLE AND NOT MASKED:
       the two terms answer different questions. The rule says "this user
       lastingly likes slow burns" and is part of the DURABLE Match shown on the
       card. The plan term says "given they asked for better than a FAST film,
       slowness is what to move toward" — a fact about THIS REQUEST that would
       not exist without the anchor. The overlap is bounded by construction:
       the critic can contribute at most ±10 regardless of how many
       vocabularies agree. */
    expect(Math.abs(t.criticNudge)).toBeLessThanOrEqual(10);
  });

  it('CASE 4 — BOTH, expressing DIFFERENT preferences', () => {
    /* The rule says slow, the canonical DNA says fast. Nothing reconciles them
       and nothing should: they are evidence of different vintages. The durable
       score keeps the rule, and the request-specific term follows the DNA, so
       they can genuinely oppose — which is the honest outcome and is visible in
       the attribution rather than silently averaged away. */
    const t = terms(WITH_RULE, DNA_FAST);
    console.log('CASE 4 (conflicting)    ', JSON.stringify(t));
    expect(t.ruleTerm).toBeGreaterThan(0); // durable: likes slow
    expect(t.criticNudge).toBeLessThan(0); // request: this slow title is wrong for fast-loving DNA
    expect(t.decisionScore).toBeLessThan(t.matchScore);
  });

  it('CASE 5 — the term the audit REJECTED would have stacked DNA twice', () => {
    /* The rejected composition was `matchScore + preferenceNudge + planNudge`.
       This shows why: with the same DNA driving both, the raw axis nudge and
       the plan's targets are derived from the SAME `effectiveTaste` beliefs. */
    const taste = effectiveTaste(DNA_SLOW);
    const plan = buildPlan({
      relation: 'better_than', anchors: [anchor], dna: DNA_SLOW, modifiers: {}, authority: AUTHORITY,
    });
    const pacing = plan.instructions.find((i) => i.axis === 'pacing');
    expect(pacing).toBeDefined();
    /* The plan's TARGET is literally the DNA's preferred value — so the plan
       term already IS the canonical DNA, applied through the request. Adding a
       second DNA term beside it is the same evidence, twice. */
    expect(pacing!.target).toBeCloseTo(taste['pacing']!.pref, 5);
    expect(pacing!.evidence).toContain('user_dna');
  });
});
