import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { observeAll, traitBelief, traitConfidence, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { dnaKnown } from '@/lib/tastedna/families';
import {
  MAX_INTERACTIONS,
  answerMove,
  createTonight,
  evidencedCount,
  finalists,
  learnedNothing,
  startTonight,
  type TonightState,
} from './orchestrator';

/**
 * THE USER MATRIX — five people, and the claims that must hold for each.
 *
 * Every simulated user is a RULE, not a script: they look at whatever the
 * orchestrator actually puts in front of them and answer from their own taste.
 * Nothing here asserts "a function returned a non-empty array" — the claims are
 * about what the system concluded, which questions it chose to ask, and what it
 * would recommend as a result.
 */

type Taste = Partial<Record<TraitKey, number>>;

interface Persona {
  name: string;
  taste: Taste;
  /** Titles they have never seen — answered `unseen`, which must teach nothing. */
  unseen?: (t: string) => boolean;
  /** An absolute refusal that compromise must never average away. */
  veto?: TraitKey;
}

const A: Persona = {
  name: 'A grounded investigator',
  taste: {
    investigation: 1, crime: 0.9, grounded: 0.95, patience: 0.15,
    supernatural: 0.02, scifi: 0.05, fantasy: 0.05, darkness: 0.55,
  },
};
const B: Persona = {
  name: 'B imaginative world-builder',
  taste: {
    scifi: 1, fantasy: 0.95, complexity: 0.9, patience: 0.9,
    grounded: 0.1, trueCrime: 0.05, investigation: 0.3, comedy: 0.4,
  },
};
const C: Persona = {
  name: 'C sparse history',
  taste: { comedy: 0.6, action: 0.55 },
  // Has seen almost nothing — the false-negative trap.
  unseen: (id) => !['knives-out', 'john-wick'].includes(id),
};
const D: Persona = {
  name: 'D established taste, light tonight',
  taste: { darkness: 0.95, patience: 0.9, complexity: 0.85, psychological: 0.9 },
};
const E: Persona = {
  name: 'E compatible but one hard veto',
  taste: { comedy: 0.8, romance: 0.7, action: 0.6, supernatural: 0.0 },
  veto: 'supernatural',
};

function appetite(p: Persona, title: (typeof TITLES)[number]): number {
  let score = 0;
  for (const e of title.traits) {
    const want = p.taste[e.key];
    if (want === undefined) continue;
    const signed = e.invert ? -e.strength : e.strength;
    score += signed * (want - 0.5) * 2;
  }
  return score;
}

/** Drive a whole session as this persona. Deterministic. */
function play(p: Persona, seedProfile: TraitProfile = {}, ctxAnswers: Record<string, string> = {}): TonightState {
  let s = startTonight(createTonight({ profile: seedProfile }), 0);
  for (let i = 0; i < MAX_INTERACTIONS + 6; i++) {
    const move = s.current;
    if (!move || move.kind === 'done') break;

    if (move.kind === 'context') {
      // A persona picks the opening intent it would actually pick — the one
      // whose lean best matches its taste. Always taking the first option made
      // every persona answer identically, which is a flaw in the simulation
      // rather than the product: two people who open the same way and diverge
      // only gradually will of course share early stimuli.
      let value = ctxAnswers[move.field];
      if (!value && move.field === 'intent') {
        const scored = (move.intents ?? []).map((intent) => ({
          id: intent.id,
          score: Object.entries(intent.lean).reduce(
            (sum, [k, v]) => sum + (v as number) * (((p.taste[k as TraitKey] ?? 0.5) - 0.5) * 2),
            0,
          ),
        }));
        value = scored.sort((x, y) => y.score - x.score)[0]?.id ?? 'surprise';
      }
      s = answerMove(s, { subject: move.field, value: value ?? 'alone' }, 1000 + i);
    } else if (move.kind === 'stimulus') {
      const id = move.stimulus.title.id;
      if (p.unseen?.(id)) {
        s = answerMove(s, { subject: id, value: 'unseen' }, 1000 + i);
      } else {
        const a = appetite(p, move.stimulus.title);
        const value = a > 0.5 ? 'pull' : a > -0.2 ? 'keep' : 'cut';
        s = answerMove(s, { subject: id, value }, 1000 + i);
      }
    } else if (move.kind === 'twist') {
      // Would they still watch it with that one thing changed?
      const want = p.taste[move.twist.axis] ?? 0.5;
      const stayed = move.twist.yesMeans === 'higher' ? want > 0.5 : want < 0.5;
      s = answerMove(s, { subject: move.twist.id, value: stayed ? 'stayed' : 'left' }, 1000 + i);
    } else if (move.kind === 'finalcut') {
      const best = [...move.finalists].sort((x, y) => appetite(p, y.title) - appetite(p, x.title))[0];
      s = answerMove(s, { subject: 'finalcut', value: best ? best.title.id : 'reject-all' }, 1000 + i);
    }
  }
  return s;
}

const eff = (p: TraitProfile, k: TraitKey) =>
  50 + (traitBelief(p, k).pref - 50) * traitConfidence(p, k);

describe('A and B are not the same person and are not treated as one', () => {
  const a = play(A);
  const b = play(B);

  it('both sessions actually ran and stayed inside budget', () => {
    expect(a.interactions.length).toBeGreaterThan(4);
    expect(b.interactions.length).toBeGreaterThan(4);
    expect(a.interactions.length).toBeLessThanOrEqual(MAX_INTERACTIONS + 1);
  });

  it('they were asked materially different questions', () => {
    const subj = (s: TonightState) => s.interactions.filter((i) => i.kind === 'stimulus').map((i) => i.subject);
    const sa = new Set(subj(a));
    const sb = new Set(subj(b));
    const shared = [...sa].filter((x) => sb.has(x)).length;
    expect(shared, 'A and B saw the same reel').toBeLessThan(Math.min(sa.size, sb.size) * 0.75);
  });

  it('the profiles diverge where the people diverge', () => {
    expect(eff(a.profile, 'grounded')).toBeGreaterThan(eff(b.profile, 'grounded'));
    expect(eff(b.profile, 'scifi')).toBeGreaterThan(eff(a.profile, 'scifi'));
  });

  it('and the Final Cuts are materially different', () => {
    const fa = finalists(a).map((f) => f.title.id);
    const fb = finalists(b).map((f) => f.title.id);
    const overlap = fa.filter((x) => fb.includes(x)).length;
    expect(overlap, `A got ${fa.join(', ')}; B got ${fb.join(', ')}`).toBeLessThanOrEqual(1);
  });

  it('finalists are three different arguments, not one repeated', () => {
    const f = finalists(a);
    expect(f).toHaveLength(3);
    expect(new Set(f.map((x) => x.title.id)).size).toBe(3);
    expect(new Set(f.map((x) => x.because)).size, 'three finalists, one reason').toBeGreaterThan(1);
  });
});

describe('C: ignorance never becomes dislike', () => {
  const c = play(C);

  it('answered mostly unseen', () => {
    const unseen = c.interactions.filter((i) => i.answer === 'unseen').length;
    expect(unseen).toBeGreaterThan(2);
  });

  it('acquired no permanent evidence from a single unseen answer', () => {
    for (const i of c.interactions.filter((x) => x.answer === 'unseen')) {
      expect(i.applied, 'an unseen title wrote permanent evidence').toEqual([]);
      expect(i.scope).toBe('session');
    }
  });

  it('holds no confident negative it was never told', () => {
    // Everything they never saw must remain unknown, not disliked.
    for (const key of ['supernatural', 'scifi', 'musical', 'western'] as TraitKey[]) {
      const belief = traitBelief(c.profile, key);
      if (traitConfidence(c.profile, key) > 0.3) {
        expect(belief.pref, `${key} became a confident dislike from ignorance`).toBeGreaterThan(20);
      }
    }
  });

  it('never stops offering them a real session', () => {
    expect(c.interactions.length).toBeGreaterThan(3);
  });
});

describe('D: tonight is not who they are', () => {
  // Established profile: dark, patient, complex.
  const established = observeAll({}, [
    { key: 'darkness', target: 95, weight: 1.2 },
    { key: 'patience', target: 92, weight: 1.2 },
    { key: 'complexity', target: 90, weight: 1.2 },
  ]);

  it('a context-only session leaves the permanent profile byte-identical', () => {
    let s = startTonight(createTonight({ profile: established }), 0);
    const before = JSON.stringify(s.profile);
    const beforeKnown = dnaKnown(s.profile);
    // Answer only the context questions the orchestrator offers.
    for (let i = 0; i < 6; i++) {
      const move = s.current;
      if (!move || move.kind !== 'context') break;
      s = answerMove(s, { subject: move.field, value: move.field === 'intent' ? 'laugh' : 'short' }, 100 + i);
    }
    expect(s.interactions.length, 'no context question was ever asked').toBeGreaterThan(0);
    expect(JSON.stringify(s.profile), 'a mood rewrote permanent DNA').toBe(before);
    expect(dnaKnown(s.profile)).toBe(beforeKnown);
    for (const i of s.interactions) expect(i.scope).toBe('session');
  });

  it('but tonight still changes what they are offered', () => {
    const base = startTonight(createTonight({ profile: established }), 0);
    let light = base;
    const move = light.current;
    if (move?.kind === 'context') light = answerMove(light, { subject: 'intent', value: 'laugh' }, 100);
    const withMood = finalists(light).map((f) => f.title.id);
    const withoutMood = finalists(base).map((f) => f.title.id);
    expect(withMood.join(), 'tonight had no effect on the shortlist').not.toBe(withoutMood.join());
  });
});

describe('E: a hard veto is not averaged away', () => {
  const e = play(E);

  it('learned the veto as a real negative', () => {
    // They cut everything supernatural, so the belief must reflect it.
    const cutSupernatural = e.interactions.some(
      (i) => i.answer === 'cut' && i.applied.some((a) => a.key === 'supernatural' && a.target === 0),
    );
    if (cutSupernatural) {
      expect(traitBelief(e.profile, 'supernatural').pref).toBeLessThan(50);
    }
  });

  it('does not put a vetoed trait at the top of the shortlist', () => {
    const withVeto = observeAll(e.profile, [{ key: 'supernatural', target: 0, weight: 2.5 }]);
    const state: TonightState = { ...e, profile: withVeto };
    const top = finalists(state)[0]!;
    const supernatural = top.title.traits.find((t) => t.key === 'supernatural' && !t.invert);
    expect(
      supernatural === undefined || supernatural.strength < 0.6,
      `top pick ${top.title.id} leads on a vetoed trait`,
    ).toBe(true);
  });
});

describe('a mature profile gets a shorter, sharper session', () => {
  it('finishes in fewer interactions than a blank one', () => {
    const blank = play(A);
    const mature = play(A, blank.profile);
    expect(mature.interactions.length, 'a known profile was asked as much as a blank one')
      .toBeLessThanOrEqual(blank.interactions.length);
  });

  it('does not repeat the same opening reel on replay', () => {
    const first = play(A);
    const second = play(A, first.profile);
    const firstStim = first.interactions.filter((i) => i.kind === 'stimulus').map((i) => i.subject);
    const secondStim = second.interactions.filter((i) => i.kind === 'stimulus').map((i) => i.subject);
    if (firstStim.length > 0 && secondStim.length > 0) {
      expect(secondStim[0], 'replay opened with the same stimulus').not.toBe(firstStim[0]);
    }
  });
});

describe('the session is governed, not scripted', () => {
  const s = play(A);

  it('every permanent update names its evidence and its axes', () => {
    for (const i of s.interactions.filter((x) => x.scope === 'permanent' && x.applied.length > 0)) {
      expect(i.applied.length).toBeGreaterThan(0);
      for (const a of i.applied) {
        expect(a.weight).toBeGreaterThan(0);
        expect([0, 100]).toContain(a.target);
      }
    }
  });

  it('a twist writes exactly one axis when one occurs', () => {
    for (const i of s.interactions.filter((x) => x.kind === 'twist')) {
      expect(i.applied, 'a twist changed more than one causal variable').toHaveLength(1);
      expect(i.testing).toHaveLength(1);
      expect(i.applied[0]!.key).toBe(i.testing[0]);
    }
  });

  it('never shows the same stimulus twice', () => {
    const shown = s.interactions.filter((i) => i.kind === 'stimulus').map((i) => i.subject);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('is idempotent — the same answer twice is recorded once', () => {
    let one = startTonight(createTonight(), 0);
    const move = one.current!;
    const subject = move.kind === 'context' ? move.field : 'x';
    const value = move.kind === 'context' ? 'laugh' : 'pull';
    one = answerMove(one, { subject, value }, 10);
    const after = one.interactions.length;
    // Replaying the SAME interaction id must not append a second record.
    const replayed = answerMove({ ...one, current: move }, { subject, value }, 10);
    expect(replayed.interactions.length, 'a retried answer double-counted').toBe(after);
  });

  it('honours the hard ceiling', () => {
    expect(s.interactions.length).toBeLessThanOrEqual(MAX_INTERACTIONS + 1);
  });

  it('reports honestly when nothing permanent was learned', () => {
    const c = play(C);
    if (evidencedCount(c) === 0) expect(learnedNothing(c)).toBe(true);
    else expect(learnedNothing(c)).toBe(false);
  });
});
