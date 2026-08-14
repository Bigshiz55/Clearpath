import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { TRAIT_KEYS, traitConfidence, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import {
  TARGET_DECISIONS,
  answer,
  permanentEvidenceFor,
  createSession,
  markUnseen,
  startSession,
  type ShowdownState,
  type Verdict,
} from './session';
import { phaseFor, predictedAppeal, territoryDistance, dimensionConfidence } from './scanner';

/**
 * COLD START — starting from nothing, does the scan actually discover a person?
 *
 * Everything here runs the shipped engine end to end. The personas are not
 * mocks of the engine's output; they are simulated PLAYERS, each with a taste
 * vector, answering whatever the planner puts in front of them. What the engine
 * asks next is entirely its own decision.
 */

type Taste = Partial<Record<TraitKey, number>>;

/** How much this person wants this title, -1..1. */
function appetite(t: Taste, title: (typeof TITLES)[number]): number {
  let score = 0;
  let mass = 0;
  for (const e of title.traits) {
    const want = t[e.key];
    if (want === undefined) continue;
    const signed = e.invert ? -e.strength : e.strength;
    score += signed * (want - 0.5) * 2;
    mass += Math.abs(signed);
  }
  return mass > 0 ? score / mass : 0;
}

export const PERSONAS: Record<string, Taste> = {
  // A — mainstream action + comedy, dislikes horror and anime
  A_mainstream: {
    action: 1, comedy: 0.9, spectacle: 0.95, mainstream: 1, comfort: 0.8, superhero: 0.8,
    horrorTolerance: 0.02, animation: 0.1, subtitles: 0.05, patience: 0.15, documentary: 0.1,
  },
  // B — anime + fantasy + sci-fi, dislikes conventional romance
  B_anime: {
    animation: 1, fantasy: 0.95, scifi: 0.9, international: 0.85, subtitles: 0.9, spectacle: 0.8,
    romance: 0.1, sentimentality: 0.15, reality: 0.05, sport: 0.05,
  },
  // C — true crime + documentary + dark prestige
  C_truecrime: {
    trueCrime: 1, documentary: 0.95, crime: 0.9, investigation: 0.9, darkness: 0.85, grounded: 0.9,
    patience: 0.8, complexity: 0.8, fantasy: 0.05, animation: 0.05, musical: 0.05, superhero: 0.05,
  },
  // D — romance + comfort + character drama
  D_comfort: {
    romance: 1, warmth: 0.95, comfort: 0.95, characterFocus: 0.85, sentimentality: 0.85, family: 0.8,
    horrorTolerance: 0.03, violence: 0.05, darkness: 0.1, cynicism: 0.1,
  },
  // E — horror + psychological + weird arthouse
  E_horror: {
    horrorTolerance: 1, psychological: 0.95, weirdness: 0.95, darkness: 0.9, suspense: 0.9,
    ambiguity: 0.85, violence: 0.8, comfort: 0.1, sentimentality: 0.05, mainstream: 0.2,
  },
  // F — genuinely broad. The persona that must NOT be forced into a cluster.
  F_eclectic: {
    action: 0.7, comedy: 0.7, animation: 0.7, documentary: 0.7, horrorTolerance: 0.65, romance: 0.7,
    international: 0.7, scifi: 0.7, musical: 0.6, western: 0.6, sport: 0.6, trueCrime: 0.65,
    fantasy: 0.7, family: 0.65, crime: 0.7, weirdness: 0.65,
  },
};

export interface Trajectory {
  state: ShowdownState;
  rounds: Array<{ n: number; phase: string; left: string; right: string; verdict: Verdict }>;
  exposures: string[];
}

/** Play a whole scan as this persona. Fully deterministic. */
export function play(taste: Taste, opts: { unseenBelow?: number } = {}): Trajectory {
  let s = startSession(createSession({}, 0, 'dna'), 0);
  const rounds: Trajectory['rounds'] = [];
  const exposures: string[] = [];
  for (let i = 0; i < TARGET_DECISIONS + 6 && s.current; i++) {
    const { left, right } = s.current;
    exposures.push(left.id, right.id);
    const l = appetite(taste, left);
    const r = appetite(taste, right);
    const phase = phaseFor(s.decisions.length + s.unseenRounds, TARGET_DECISIONS);

    // A persona "hasn't seen" a pair when both are far outside its world.
    const floor = opts.unseenBelow ?? -2;
    if (l < floor && r < floor) {
      rounds.push({ n: i, phase, left: left.id, right: right.id, verdict: 'left' });
      s = markUnseen(s, 1000 + i);
      continue;
    }
    const verdict: Verdict =
      l > 0.35 && r > 0.35 ? 'both' : l < -0.35 && r < -0.35 ? 'neither' : l >= r ? 'left' : 'right';
    rounds.push({ n: i, phase, left: left.id, right: right.id, verdict });
    s = answer(s, verdict, 1000 + i, 900);
  }
  return { state: s, rounds, exposures };
}

const titleOf = (id: string) => TITLES.find((t) => t.id === id)!;

describe('1. the scan begins with no prior context at all', () => {
  it('a fresh session carries an empty profile and nothing seen', () => {
    const s = createSession({}, 0, 'dna');
    expect(s.profile).toEqual({});
    expect(s.seenTitleIds).toEqual([]);
    expect(s.decisions).toEqual([]);
    // Nothing about the user can enter: the constructor takes a seed and a
    // mode, and there is no argument through which a search history, a saved
    // title or a prior Tonight could arrive.
    expect(Object.keys(s.lean)).toEqual([]);
  });

  it('every persona is asked the SAME opening question — because we know nothing yet', () => {
    // Divergence must be EARNED. An opening that already differed per player
    // would mean the engine was using something it should not have.
    const opens = Object.values(PERSONAS).map((t) => {
      const s = startSession(createSession({}, 0, 'dna'), 0);
      return `${s.current!.left.id}|${s.current!.right.id}`;
    });
    expect(new Set(opens).size).toBe(1);
  });
});

describe('2. early rounds sweep genuinely different territory', () => {
  const traj = play(PERSONAS.F_eclectic!);

  it('the opening pairs are far apart in trait space', () => {
    const sweepRounds = traj.rounds.filter((r) => r.phase === 'sweep');
    expect(sweepRounds.length).toBeGreaterThanOrEqual(5);
    for (const r of sweepRounds) {
      const d = territoryDistance(titleOf(r.left), titleOf(r.right));
      expect(d, `${r.left} vs ${r.right} were not meaningfully different`).toBeGreaterThan(1.5);
    }
  });

  it('the sweep touches many distinct axes, not one genre repeatedly', () => {
    const sweepIds = traj.rounds.filter((r) => r.phase === 'sweep').flatMap((r) => [r.left, r.right]);
    const axes = new Set<TraitKey>();
    for (const id of sweepIds) for (const e of titleOf(id).traits) axes.add(e.key);
    // A radar sweep, not a walk through one corner of the catalogue.
    expect(axes.size, `sweep only touched ${axes.size} axes`).toBeGreaterThanOrEqual(15);
  });

  it('does not collapse into a single genre in the first third', () => {
    const sweepIds = traj.rounds.filter((r) => r.phase === 'sweep').flatMap((r) => [r.left, r.right]);
    const leadAxis = sweepIds.map((id) => {
      const ts = titleOf(id).traits;
      return ts.reduce((best, e) => (e.strength > best.strength ? e : best), ts[0]!).key;
    });
    const counts = new Map<TraitKey, number>();
    for (const a of leadAxis) counts.set(a, (counts.get(a) ?? 0) + 1);
    const dominant = Math.max(...counts.values()) / leadAxis.length;
    expect(dominant, 'one genre dominated the sweep').toBeLessThan(0.5);
  });
});

describe('3-4. the no-repeat invariant is absolute', () => {
  for (const [name, taste] of Object.entries(PERSONAS)) {
    it(`${name}: no title is ever shown twice`, () => {
      const { exposures } = play(taste);
      expect(new Set(exposures).size, `${name} saw a repeat`).toBe(exposures.length);
    });
  }

  it('a 20-decision scan exposes 40 unique titles', () => {
    const { state, exposures } = play(PERSONAS.A_mainstream!);
    expect(state.decisions.length).toBe(TARGET_DECISIONS);
    expect(exposures.length).toBe(TARGET_DECISIONS * 2);
    expect(new Set(exposures).size).toBe(TARGET_DECISIONS * 2);
  });

  it('titles refused, unseen or lost are retired just as firmly as winners', () => {
    let s = startSession(createSession({}, 0, 'dna'), 0);
    const seen: string[] = [];
    for (let i = 0; i < 8 && s.current; i++) {
      seen.push(s.current.left.id, s.current.right.id);
      s = i % 3 === 0 ? markUnseen(s, 1000 + i) : answer(s, i % 2 ? 'neither' : 'left', 1000 + i, 900);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('5-6. choices change what comes next, and different people diverge', () => {
  it('two opposite personas are asked materially different ADAPTIVE questions', () => {
    /* MEASURED AFTER THE SWEEP, and that is the only coherent place to measure
       it. The sweep is identical for everybody BY REQUIREMENT — the case above
       asserts exactly that, because an opening that already differed would
       mean the engine was using prior context it must not have. Including
       those seven rounds in a divergence ratio therefore mixes a deliberate
       design property into the number and floors it at 0.35 no matter how well
       the adaptive phases work. What must diverge is what happens AFTER the
       engine has something to go on. */
    const a = play(PERSONAS.A_mainstream!);
    const e = play(PERSONAS.E_horror!);
    const adaptive = (t: Trajectory) =>
      new Set(t.rounds.filter((r) => r.phase !== 'sweep').map((r) => `${r.left}|${r.right}`));
    const pa = adaptive(a);
    const pe = adaptive(e);
    expect(pa.size, 'no adaptive rounds ran at all').toBeGreaterThan(8);
    const shared = [...pa].filter((k) => pe.has(k)).length;
    expect(
      shared / Math.min(pa.size, pe.size),
      'the adaptive phases asked these two opposite people the same things',
    ).toBeLessThan(0.5);
  });

  it('divergence GROWS as the scan proceeds', () => {
    const a = play(PERSONAS.A_mainstream!);
    const e = play(PERSONAS.E_horror!);
    const overlapIn = (from: number, to: number) => {
      const ka = new Set(a.rounds.slice(from, to).map((r) => `${r.left}|${r.right}`));
      const ke = new Set(e.rounds.slice(from, to).map((r) => `${r.left}|${r.right}`));
      return [...ka].filter((k) => ke.has(k)).length / Math.max(1, ka.size);
    };
    // Early rounds are shared by design (no information yet); late ones must not be.
    expect(overlapIn(12, 20)).toBeLessThan(overlapIn(0, 4));
  });

  it('12. the same persona twice produces the same DNA', () => {
    const one = play(PERSONAS.C_truecrime!);
    const two = play(PERSONAS.C_truecrime!);
    expect(JSON.stringify(one.state.profile)).toBe(JSON.stringify(two.state.profile));
    expect(one.exposures).toEqual(two.exposures);
  });
});

describe('8-9. answer semantics survive the redesign', () => {
  it('“haven’t seen either” moves no belief in either direction', () => {
    let s = startSession(createSession({}, 0, 'dna'), 0);
    s = answer(s, 'left', 1000, 900);
    const before = JSON.stringify(s.profile);
    s = markUnseen(s, 1001);
    expect(JSON.stringify(s.profile), 'unfamiliarity was read as dislike').toBe(before);
  });

  /* PROBED ON A CONSTRUCTED SHARED-GROUND PAIR, not on a live scan round, and
     that is a finding rather than a convenience. Neither and Both are defined
     on what a pair SHARES, while the sweep deals pairs chosen to share as
     little as possible — so on those rounds both answers genuinely carry
     almost no information. Broadening them to every non-conflicting axis was
     tried and reverted: a sweep pair touches a dozen axes, so it would turn
     one tap into twelve claims, the exact confounding attribution exists to
     stop. The thinness is real; this tests the semantics where they apply. */
  const shared = {
    left: titleOf('se7en'),
    right: titleOf('zodiac'),
    testing: ['darkness' as TraitKey],
    gain: 1,
    attribution: 1,
    twist: false,
  };

  it('“neither” produces real negative evidence on shared ground', () => {
    const ev = permanentEvidenceFor(shared, 'neither');
    expect(ev.length, 'Neither was treated as a skip').toBeGreaterThan(0);
    // Both films are dark; refusing both pushes darkness DOWN.
    const dark = ev.find((x) => x.key === 'darkness');
    expect(dark, 'Neither said nothing about the ground they share').toBeDefined();
    expect(dark!.target).toBe(0);
  });

  it('“both” is the mirror of “neither”, not the same shrug', () => {
    const both = permanentEvidenceFor(shared, 'both');
    const neither = permanentEvidenceFor(shared, 'neither');
    expect(both.length).toBeGreaterThan(0);
    const b = both.find((x) => x.key === 'darkness')!;
    const n = neither.find((x) => x.key === 'darkness')!;
    // Same axis, opposite direction: wanting both endorses the shared ground
    // that refusing both condemns. Recording them alike would read strong
    // attraction to two films as indifference.
    expect(b.target).toBe(100);
    expect(n.target).toBe(0);
  });
});

describe('10. late rounds are harder than early ones', () => {
  it('the model can predict early pairs better than late ones', () => {
    const t = play(PERSONAS.C_truecrime!);
    const finalProfile = t.state.profile;
    const gap = (r: Trajectory['rounds'][number]) =>
      Math.abs(predictedAppeal(titleOf(r.left), finalProfile) - predictedAppeal(titleOf(r.right), finalProfile));
    const early = t.rounds.slice(0, 5).map(gap).reduce((a, b) => a + b, 0) / 5;
    const late = t.rounds.slice(-5).map(gap).reduce((a, b) => a + b, 0) / 5;
    // A smaller predicted gap IS a harder choice. If late rounds were still
    // obvious, the adaptive engine has failed the product requirement.
    expect(late, `late rounds (${late.toFixed(3)}) were not harder than early (${early.toFixed(3)})`).toBeLessThan(early);
  });
});

describe('11. the resulting DNA differs materially between personas', () => {
  it('each persona ends up somewhere different', () => {
    const profiles = Object.entries(PERSONAS).map(([name, t]) => [name, play(t).state.profile] as const);
    const sig = (p: TraitProfile) =>
      TRAIT_KEYS.filter((k) => traitConfidence(p, k) > 0.25 && Math.abs((p[k]?.pref ?? 50) - 50) > 15)
        .sort()
        .join(',');
    const sigs = profiles.map(([, p]) => sig(p));
    expect(new Set(sigs).size, 'two personas produced identical Taste DNA').toBe(sigs.length);
  });

  it('the eclectic persona is not forced into a narrow cluster', () => {
    const eclectic = play(PERSONAS.F_eclectic!).state.profile;
    const narrow = play(PERSONAS.C_truecrime!).state.profile;
    const decided = (p: TraitProfile) =>
      TRAIT_KEYS.filter((k) => traitConfidence(p, k) > 0.25 && Math.abs((p[k]?.pref ?? 50) - 50) > 20);
    // The broad player should NOT come out looking more opinionated than the
    // narrow one — that would mean the engine invented a cluster.
    expect(decided(eclectic).length).toBeLessThanOrEqual(decided(narrow).length + 4);
  });

  it('confidence is per-dimension, never one number', () => {
    const dims = dimensionConfidence(play(PERSONAS.B_anime!).state.profile);
    expect(dims.length).toBe(TRAIT_KEYS.length);
    const tiers = new Set(dims.map((d) => d.tier));
    // Some axes well learned, some barely — an honest scan cannot know
    // everything about someone in ninety seconds and must not pretend to.
    expect(tiers.size, 'every dimension came out at the same confidence').toBeGreaterThan(1);
    expect(dims.some((d) => d.tier === 'low'), 'nothing was left uncertain — that is invented knowledge').toBe(true);
  });
});
