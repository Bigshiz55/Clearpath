import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS, dimensionMatch, buildProfile, type TitleDimensions } from '@/lib/scoring/dimensions';
import { deriveDna, deriveCorrections, emptyDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { matchupGain, nextMatchup, pairKey, separation, type ShowdownTitle } from './matchup';
import { toPreferenceEvents, sharedGround, twistCorrection, SOURCE, type VerdictInput } from './verdict';
import { INTENTS, applyLean, mergeLeans, tonightPreference, intentById } from './session';

/**
 * THE CLAIMS THIS FEATURE RESTS ON.
 *
 * Every one of these is about the SAME model: the canonical preference log the
 * real ranking engine reads. A Showdown that learned into its own store would
 * pass a happier set of tests and change nothing about what anyone is
 * recommended.
 */

/** A fingerprint with everything neutral except what a test names. */
function dims(overrides: Record<string, number>): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...overrides };
}

function title(key: string, overrides: Record<string, number>): ShowdownTitle {
  return {
    key,
    title: key,
    year: 2020,
    posterPath: null,
    mediaType: 'movie',
    dims: dims(overrides),
  };
}

const input = (over: Partial<VerdictInput> & Pick<VerdictInput, 'left' | 'right' | 'verdict'>): VerdictInput => ({
  kind: 'pair',
  testing: ['pacing'],
  sessionId: 's1',
  roundId: 'r1',
  at: 1_000,
  ...over,
});

/** Fold drafts into real state so assertions are about the engine, not the draft. */
function stateFrom(drafts: ReturnType<typeof toPreferenceEvents>, now = 2_000) {
  const events = drafts.map((d, i) => ({ ...d, at: d.at ?? now, id: d.id ?? `e${i}` })) as PreferenceEvent[];
  return deriveDna(events, now);
}

describe('a pick writes canonical attraction evidence, and nothing against the loser', () => {
  const fast = title('movie:1', { pacing: 90 });
  const slow = title('movie:2', { pacing: 10 });

  it('writes one event, for the winner, into the canonical log', () => {
    const drafts = toPreferenceEvents(input({ left: fast, right: slow, verdict: 'left' }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.titleId).toBe('movie:1');
    expect(drafts[0]!.action).toBe('unseen_interested');
    expect(drafts[0]!.source).toBe(SOURCE);
    // The shape the canonical store expects, not a bespoke one.
    expect(drafts[0]!.dims).toBeDefined();
  });

  it('never writes a negative for the title that merely lost', () => {
    // A film can be excellent and still not be the one you pick tonight.
    // Manufacturing aversion out of a ranking is how a comparison quiz poisons
    // a taste model.
    const drafts = toPreferenceEvents(input({ left: fast, right: slow, verdict: 'left' }));
    expect(drafts.some((d) => d.titleId === 'movie:2')).toBe(false);
  });

  it('moves the canonical profile toward the winner', () => {
    const state = stateFrom(toPreferenceEvents(input({ left: fast, right: slow, verdict: 'left' })));
    expect(state.attraction.dims.pacing!.pref).toBeGreaterThan(50);
    expect(state.attraction.dims.pacing!.evidence).toBeGreaterThan(0);
    // And it is ATTRACTION, not EXPERIENCE — nobody said they had watched it.
    expect(state.experience.dims.pacing?.evidence ?? 0).toBe(0);
  });
});

describe('haven’t seen either creates no taste delta at all', () => {
  it('produces no events', () => {
    const drafts = toPreferenceEvents(
      input({ left: title('movie:1', { pacing: 90 }), right: title('movie:2', { pacing: 10 }), verdict: 'unseen' }),
    );
    expect(drafts).toEqual([]);
  });

  it('leaves the derived state byte-identical to having never played', () => {
    const before = JSON.stringify(emptyDna());
    const drafts = toPreferenceEvents(
      input({ left: title('movie:1', { darkness: 95 }), right: title('movie:2', { humor: 95 }), verdict: 'unseen' }),
    );
    expect(JSON.stringify(stateFrom(drafts))).toBe(before);
  });
});

describe('neither only touches shared ground', () => {
  // Both bleak; one fast and one slow. The rejection is of the bleakness.
  const bleakFast = title('movie:1', { darkness: 90, pacing: 90 });
  const bleakSlow = title('movie:2', { darkness: 88, pacing: 10 });

  it('learns the axis they share', () => {
    const shared = sharedGround(bleakFast.dims, bleakSlow.dims);
    expect(shared.darkness).toBeGreaterThan(80);
  });

  it('says nothing about the axis they disagree on', () => {
    const shared = sharedGround(bleakFast.dims, bleakSlow.dims);
    expect(shared.pacing, 'a contested axis leaked into shared ground').toBeUndefined();
  });

  it('drops neutral axes rather than asserting the middle', () => {
    const shared = sharedGround(bleakFast.dims, bleakSlow.dims);
    for (const k of Object.keys(shared)) {
      expect(Math.abs(shared[k]! - 50), `${k} is too neutral to mean anything`).toBeGreaterThanOrEqual(15);
    }
  });

  it('pushes the profile away from the shared axis only', () => {
    const state = stateFrom(toPreferenceEvents(input({ left: bleakFast, right: bleakSlow, verdict: 'neither' })));
    // Rejected the darkness → the profile leans light.
    expect(state.attraction.dims.darkness!.pref).toBeLessThan(50);
    // Said nothing about pace, in either direction.
    expect(state.attraction.dims.pacing?.evidence ?? 0).toBe(0);
  });

  it('writes nothing when two titles share no informative ground', () => {
    const a = title('movie:1', { pacing: 95 });
    const b = title('movie:2', { pacing: 5 });
    expect(toPreferenceEvents(input({ left: a, right: b, verdict: 'neither' }))).toEqual([]);
  });
});

describe('a controlled comparison is attributed more confidently than a confounded one', () => {
  // Differs on pacing ALONE — everything else held constant.
  const controlledA = title('movie:1', { pacing: 90 });
  const controlledB = title('movie:2', { pacing: 10 });
  // Differs on five axes at once: six explanations fit the pick.
  const confoundedA = title('movie:3', { pacing: 90, darkness: 85, humor: 15, complexity: 80, violence: 80 });
  const confoundedB = title('movie:4', { pacing: 15, darkness: 20, humor: 85, complexity: 25, violence: 15 });

  it('classifies a single-axis pair as a twist and a multi-axis pair as a pair', () => {
    const state = emptyDna();
    const u = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 1]));
    expect(matchupGain(controlledA.dims, controlledB.dims, u, state).kind).toBe('twist');
    expect(matchupGain(confoundedA.dims, confoundedB.dims, u, state).kind).toBe('pair');
  });

  it('only the twist writes a correction', () => {
    const twist = toPreferenceEvents(
      input({ left: controlledA, right: controlledB, verdict: 'left', kind: 'twist', testing: ['pacing'] }),
    );
    const confounded = toPreferenceEvents(
      input({ left: confoundedA, right: confoundedB, verdict: 'left', kind: 'pair', testing: ['pacing'] }),
    );
    expect(twist[0]!.corrections, 'a controlled pick earned no correction').toHaveLength(1);
    expect(twist[0]!.corrections![0]!.key).toBe('pacing');
    expect(confounded[0]!.corrections, 'a confounded pick claimed attribution').toBeUndefined();
  });

  it('the correction becomes a full-confidence override the engine honours', () => {
    // This is what "higher attribution confidence" MEANS in canonical terms:
    // corrections override inferred signal rather than being averaged into it.
    const drafts = toPreferenceEvents(
      input({ left: controlledA, right: controlledB, verdict: 'left', kind: 'twist', testing: ['pacing'] }),
    );
    const events = drafts.map((d) => ({ ...d, at: 1_000 })) as PreferenceEvent[];
    const overrides = deriveCorrections(events);
    expect(overrides.pacing, 'the twist produced no override').toBeGreaterThan(50);

    const confounded = toPreferenceEvents(
      input({ left: confoundedA, right: confoundedB, verdict: 'left', kind: 'pair', testing: ['pacing'] }),
    ).map((d) => ({ ...d, at: 1_000 })) as PreferenceEvent[];
    expect(deriveCorrections(confounded), 'a confounded pick produced an override').toEqual({});
  });

  it('never claims an axis the winner does not actually hold', () => {
    // The correction targets the winner's real value, not a rounded 0/100 that
    // would claim a more extreme taste than the evidence supports.
    const c = twistCorrection(
      input({ left: controlledA, right: controlledB, verdict: 'left', kind: 'twist', testing: ['pacing'] }),
    );
    expect(c!.target).toBe(controlledA.dims.pacing);
  });

  it('a twist on an unanswered pair produces no correction', () => {
    for (const verdict of ['neither', 'unseen'] as const) {
      expect(
        twistCorrection(input({ left: controlledA, right: controlledB, verdict, kind: 'twist', testing: ['pacing'] })),
      ).toBeNull();
    }
  });
});

describe('the planner asks the question worth asking', () => {
  const pool: ShowdownTitle[] = [
    title('movie:1', { pacing: 95 }),
    title('movie:2', { pacing: 5 }),
    title('movie:3', { pacing: 52 }),
    title('movie:4', { humor: 95 }),
    title('movie:5', { humor: 5 }),
  ];

  it('prefers a pair that separates over one that agrees', () => {
    const m = nextMatchup({ pool, state: emptyDna(), seen: [], askedPairs: [] })!;
    expect(m).not.toBeNull();
    expect(separation(m.left.dims, m.right.dims, m.testing[0]!)).toBeGreaterThan(0.5);
  });

  it('never repeats a matchup', () => {
    const asked: string[] = [];
    let state = emptyDna();
    for (let i = 0; i < 4; i++) {
      const m = nextMatchup({ pool, state, seen: [], askedPairs: asked });
      if (!m) break;
      const key = pairKey(m.left.key, m.right.key);
      expect(asked, 'the planner asked the same pair twice').not.toContain(key);
      asked.push(key);
    }
    expect(asked.length).toBeGreaterThan(2);
  });

  it('stops rather than perform once nothing separates', () => {
    const flat = [title('movie:1', {}), title('movie:2', {}), title('movie:3', {})];
    expect(nextMatchup({ pool: flat, state: emptyDna(), seen: [], askedPairs: [] })).toBeNull();
  });

  it('skips titles already seen', () => {
    const m = nextMatchup({ pool, state: emptyDna(), seen: ['movie:1', 'movie:2'], askedPairs: [] })!;
    expect([m.left.key, m.right.key]).not.toContain('movie:1');
    expect([m.left.key, m.right.key]).not.toContain('movie:2');
  });

  it('asks less about an axis it already understands', () => {
    // A profile that is certain about pacing should find the pacing pair worth
    // less than a blank profile does.
    const settled = deriveDna(
      Array.from({ length: 6 }, (_, i) => ({
        id: `e${i}`,
        at: 1_000,
        titleId: `movie:${100 + i}`,
        action: 'unseen_interested' as const,
        attractionGrade: 'interested' as const,
        dims: dims({ pacing: 95 }),
      })),
      2_000,
    );
    const blankGain = matchupGain(
      pool[0]!.dims,
      pool[1]!.dims,
      Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 1])),
      emptyDna(),
    ).gain;
    const settledGain = matchupGain(
      pool[0]!.dims,
      pool[1]!.dims,
      // Real uncertainty from the settled profile.
      Object.fromEntries(DIMENSION_KEYS.map((k) => [k, k === 'pacing' ? 0.2 : 1])),
      settled,
    ).gain;
    expect(settledGain).toBeLessThan(blankGain);
  });
});

describe('tonight bends the ranking and cannot touch permanent taste', () => {
  it('exposes no way to produce a permanent event', () => {
    // Structural, not a convention: nothing in the session module returns a
    // PreferenceEvent, and the lean is a plain record of ranking nudges.
    const lean = intentById('comfort')!.lean;
    for (const value of Object.values(lean)) expect(typeof value).toBe('number');
    // Applying a lean returns a NEW object; the input is untouched.
    const pref = { darkness: 90, warmth: 10 };
    const frozen = JSON.stringify(pref);
    const out = applyLean(pref, lean);
    expect(JSON.stringify(pref), 'applying tonight mutated the permanent profile').toBe(frozen);
    expect(out.darkness).toBeLessThan(90);
  });

  it('changes which title ranks first without changing the profile', () => {
    // Someone whose permanent taste is dark, who tonight wants comfort.
    const permanent = buildProfile([
      { dims: dims({ darkness: 95, warmth: 10 }), rating: 9 },
      { dims: dims({ darkness: 90, warmth: 15 }), rating: 9 },
    ]);
    const bleak = dims({ darkness: 95, warmth: 10 });
    const cosy = dims({ darkness: 10, warmth: 90 });

    const before = { bleak: dimensionMatch(bleak, permanent), cosy: dimensionMatch(cosy, permanent) };
    expect(before.bleak, 'permanent taste should prefer the bleak one').toBeGreaterThan(before.cosy);

    const tonight = { ...permanent, pref: applyLean(permanent.pref, intentById('comfort')!.lean) };
    const after = { bleak: dimensionMatch(bleak, tonight), cosy: dimensionMatch(cosy, tonight) };
    expect(after.cosy, 'tonight did not move the ranking').toBeGreaterThan(before.cosy);

    // And the permanent profile is untouched — the same numbers as before.
    expect(dimensionMatch(bleak, permanent)).toBe(before.bleak);
  });

  it('leaves axes tonight says nothing about exactly alone', () => {
    const lean = intentById('laugh')!.lean;
    expect(tonightPreference(72, lean, 'serialized')).toBe(72);
  });

  it('sums overlapping pulls instead of letting the last one win', () => {
    const merged = mergeLeans([intentById('easy')!.lean, intentById('comfort')!.lean]);
    // Both push darkness down; together they push harder than either alone.
    expect(merged.darkness!).toBeLessThan(intentById('easy')!.lean.darkness!);
    expect(merged.darkness!).toBeGreaterThanOrEqual(-1);
  });

  it('every intent names only axes the canonical model has', () => {
    for (const intent of INTENTS) {
      for (const key of Object.keys(intent.lean)) {
        expect(DIMENSION_KEYS, `${intent.id} invented the axis "${key}"`).toContain(key);
      }
    }
  });
});
