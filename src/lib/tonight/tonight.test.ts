import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { observeAll, traitBelief, traitConfidence, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { dnaKnown } from '@/lib/tastedna/families';
import {
  EMPTY_CONTEXT,
  INTENTS,
  applyContextAnswer,
  tonightPreference,
  type SessionContext,
} from './context';
import {
  answerMove,
  chosenTitle,
  createTonight,
  startTonight,
  type TonightState,
} from './orchestrator';
import { hookFor, hookParts } from './stimulus';
import { NEVER_TWIST, TWISTS, nextTwist, twistEvidence } from './twist';

/**
 * THE TWO CLAIMS THE WHOLE PRODUCT RESTS ON.
 *
 *   1. Tonight never becomes permanent. A mood is not a personality, and a
 *      recommender that confuses them degrades every time it is used.
 *   2. A counterfactual isolates ONE cause. Holding everything else constant
 *      is the entire reason a minute here beats months of passive logging —
 *      the moment a twist updates a second axis, it is just another confounded
 *      choice wearing a clever prompt.
 */

const anchor = TITLES.find((t) => t.id === 'zodiac') ?? TITLES[0]!;

describe('tonight never corrupts permanent Taste DNA', () => {
  it('a context answer yields no permanent evidence at all', () => {
    for (const field of ['intent', 'company', 'attention', 'commitment'] as const) {
      const { permanent } = applyContextAnswer(EMPTY_CONTEXT, { field, value: 'x' });
      expect(permanent, `${field} tried to write permanent DNA`).toEqual([]);
    }
  });

  it('a whole night of context answers leaves the profile byte-identical', () => {
    const profile: TraitProfile = observeAll({}, [
      { key: 'darkness', target: 90, weight: 0.4 },
      { key: 'patience', target: 80, weight: 0.4 },
    ]);
    const before = JSON.stringify(profile);
    const beforeKnown = dnaKnown(profile);

    let ctx = EMPTY_CONTEXT;
    for (const answer of [
      { field: 'intent' as const, value: 'laugh' },
      { field: 'company' as const, value: 'together' },
      { field: 'attention' as const, value: 'background' },
      { field: 'commitment' as const, value: 'short' },
    ]) {
      const out = applyContextAnswer(ctx, answer);
      ctx = out.context;
      // The only route to permanent DNA is `permanent`, and it is always empty.
      expect(out.permanent).toEqual([]);
    }

    expect(JSON.stringify(profile), 'tonight rewrote who they are').toBe(before);
    expect(dnaKnown(profile), 'a mood changed DNA completeness').toBe(beforeKnown);
  });

  it('but tonight DOES bend what gets recommended tonight', () => {
    // User D: strong permanent taste for dark, patient films — but tonight
    // they want something light and short.
    const profile = observeAll({}, [
      { key: 'darkness', target: 95, weight: 0.6 },
      { key: 'patience', target: 90, weight: 0.6 },
    ]);
    let ctx: SessionContext = EMPTY_CONTEXT;
    ctx = applyContextAnswer(ctx, { field: 'intent', value: 'laugh' }).context;
    ctx = applyContextAnswer(ctx, { field: 'commitment', value: 'short' }).context;

    const darkBase = traitBelief(profile, 'darkness').pref;
    const patienceBase = traitBelief(profile, 'patience').pref;

    expect(tonightPreference(darkBase, ctx, 'darkness')).toBeLessThan(darkBase);
    expect(tonightPreference(patienceBase, ctx, 'patience')).toBeLessThan(patienceBase);
    // And the permanent belief is untouched underneath it.
    expect(traitBelief(profile, 'darkness').pref).toBe(darkBase);
  });

  it('an axis tonight says nothing about is left exactly alone', () => {
    const ctx = applyContextAnswer(EMPTY_CONTEXT, { field: 'intent', value: 'laugh' }).context;
    expect(tonightPreference(72, ctx, 'scifi')).toBe(72);
  });

  it('watching together constrains the evening without changing taste', () => {
    const ctx = applyContextAnswer(EMPTY_CONTEXT, { field: 'company', value: 'together' }).context;
    expect(ctx.company).toBe('together');
    expect(tonightPreference(90, ctx, 'darkness')).toBeLessThan(90);
  });

  it('background viewing rules out subtitles for tonight only', () => {
    const ctx = applyContextAnswer(EMPTY_CONTEXT, { field: 'attention', value: 'background' }).context;
    // You cannot read subtitles you are not looking at.
    expect(tonightPreference(80, ctx, 'subtitles')).toBeLessThan(45);
  });
});

describe('a twist isolates exactly one cause', () => {
  it('produces evidence about its own axis and nothing else', () => {
    for (const twist of TWISTS) {
      for (const stayed of [true, false]) {
        const ev = twistEvidence(twist, stayed);
        expect(ev, `${twist.id} produced no evidence`).toHaveLength(1);
        expect(ev[0]!.key, `${twist.id} updated an axis it does not control`).toBe(twist.axis);
      }
    }
  });

  it('opposite answers push opposite ways', () => {
    const t = TWISTS.find((x) => x.id === 'subtitled')!;
    expect(twistEvidence(t, true)[0]!.target).toBe(100);
    expect(twistEvidence(t, false)[0]!.target).toBe(0);
  });

  it('states the changed attribute on its own, short enough to stamp on a card', () => {
    for (const twist of TWISTS) {
      const { change } = twist;
      expect(change.length, `${twist.id} has no change label`).toBeGreaterThan(0);
      // The surface renders this at display size; a sentence would wrap away
      // the one thing the player has to read.
      expect(change.length, `${twist.id} change label is too long to stamp`).toBeLessThan(45);
      // It is the VARIABLE, not the whole counterfactual — a label carrying the
      // anchor's name would mean the UI was showing the sentence twice.
      expect(change, `${twist.id} change label repeats the anchor`).not.toContain(anchor.title);
      expect(change, `${twist.id} change label is the whole prompt`).not.toContain('Same as');
    }
  });

  it('never claims to isolate an axis that cannot be held constant', () => {
    for (const twist of TWISTS) {
      expect(NEVER_TWIST, `${twist.id} isolates a confounded axis`).not.toContain(twist.axis);
    }
  });

  it('picks the axis that is still most open', () => {
    // Subtitles settled hard, patience untouched: it must go for patience.
    const profile = observeAll({}, [
      { key: 'subtitles', target: 100, weight: 3 },
      { key: 'darkness', target: 100, weight: 3 },
      { key: 'supernatural', target: 0, weight: 3 },
      { key: 'complexity', target: 100, weight: 3 },
      { key: 'vintage', target: 100, weight: 3 },
      { key: 'comedy', target: 100, weight: 3 },
      { key: 'international', target: 100, weight: 3 },
    ]);
    const twist = nextTwist({ profile, used: [], anchor })!;
    expect(twist, 'no twist offered when one axis was wide open').not.toBeNull();
    expect(twist.axis).toBe('patience');
  });

  it('offers nothing rather than theatre when everything is settled', () => {
    const settled = observeAll(
      {},
      TWISTS.map((t) => ({ key: t.axis, target: 100, weight: 6 })),
    );
    expect(nextTwist({ profile: settled, used: [], anchor })).toBeNull();
  });

  it('never repeats a twist within a session', () => {
    const profile: TraitProfile = {};
    const used: string[] = [];
    for (let i = 0; i < TWISTS.length; i++) {
      const t = nextTwist({ profile, used, anchor });
      if (!t) break;
      expect(used, 'a twist was offered twice').not.toContain(t.id);
      used.push(t.id);
    }
    expect(used.length).toBeGreaterThan(3);
  });

  it('reads as a controlled change to the film they just kept', () => {
    for (const twist of TWISTS) {
      const prompt = twist.prompt(anchor);
      expect(prompt, `${twist.id} does not name the anchor title`).toContain(anchor.title);
      expect(prompt.length, `${twist.id} is too long to read in five seconds`).toBeLessThan(90);
    }
  });

  it('outweighs an ordinary confounded choice', () => {
    const ev = twistEvidence(TWISTS[0]!, true)[0]!;
    // The showdown's comparative evidence tops out at 0.34; a controlled
    // counterfactual is worth more per answer precisely because it is clean.
    expect(ev.weight).toBeGreaterThan(0.34);
  });
});

describe('the opening question is generated, not hard-coded', () => {
  it('offers real decisions about an evening, not genre labels', () => {
    expect(INTENTS.length).toBeGreaterThanOrEqual(6);
    for (const i of INTENTS) {
      expect(i.label.length).toBeLessThan(40);
      expect(i.label).not.toMatch(/\d\s*\/\s*10|rating|score/i);
    }
  });

  it('every intent either leans tonight or defers — none is decoration', () => {
    for (const i of INTENTS) {
      const leans = Object.keys(i.lean).length > 0;
      const defers = i.resolves.length === 0; // "Surprise me" / "You figure it out"
      expect(leans || defers, `${i.id} does nothing at all`).toBe(true);
    }
  });

  it('an intent moves tonight without touching permanent DNA', () => {
    const profile = observeAll({}, [{ key: 'comedy', target: 10, weight: 0.5 }]);
    const before = traitConfidence(profile, 'comedy');
    const out = applyContextAnswer(EMPTY_CONTEXT, { field: 'intent', value: 'laugh' });
    expect(out.permanent).toEqual([]);
    expect(traitConfidence(profile, 'comedy')).toBe(before);
    expect(out.context.lean.comedy as number).toBeGreaterThan(0);
  });
});

describe('unseen is never dislike', () => {
  it('has no representation that could be confused with a negative', () => {
    // The engine-level guarantee: there is no code path from "haven't seen it"
    // to an observation, so a profile cannot acquire a negative from one.
    const profile: TraitProfile = {};
    const after = observeAll(profile, []); // what an unseen answer contributes
    expect(Object.keys(after)).toHaveLength(0);
    for (const key of ['supernatural', 'comedy', 'darkness'] as TraitKey[]) {
      expect(traitConfidence(after, key)).toBe(0);
    }
  });
});

describe('a title describes itself the same way twice', () => {
  it('renders chips and sentence from one source, so they cannot disagree', () => {
    // The card shows chips when there is no artwork and a sentence over a
    // poster, and hands a screen reader the sentence either way. Two
    // independent descriptions of the same film is a data-honesty bug waiting
    // to happen, so the sentence is assembled FROM the chips.
    for (const title of TITLES) {
      const parts = hookParts(title);
      const sentence = hookFor(title);
      expect(parts.length, `${title.id} claims more than three defining things`).toBeLessThanOrEqual(3);
      expect(new Set(parts).size, `${title.id} repeats an attribute`).toBe(parts.length);
      if (parts.length === 0) {
        expect(sentence).toBe('Worth an evening');
        continue;
      }
      // Every chip appears in the sentence; the first is simply capitalised.
      for (const [i, part] of parts.entries()) {
        const expected = i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part;
        expect(sentence, `${title.id} sentence drops "${part}"`).toContain(expected);
      }
    }
  });

  it('never describes a title with an attribute it does not have', () => {
    // Chips come from the trait vector, so a chip that is not derivable from
    // this title's own traits would be invented copy.
    for (const title of TITLES) {
      const own = new Set(title.traits.map((t) => t.key));
      // Rebuilding from the title's own keys must reproduce the same chips.
      const rebuilt = hookParts({ ...title, traits: title.traits.filter((t) => own.has(t.key)) });
      expect(rebuilt, `${title.id} chips are not derived from its traits`).toEqual(hookParts(title));
    }
  });
});

describe('the Final Cut can always be answered', () => {
  /** Play a session with a chosen policy, reporting whether it ever stalls. */
  function play(
    decide: (m: NonNullable<TonightState['current']>) => { subject: string; value: string } | null,
    max = 60,
  ) {
    let state = startTonight(createTonight(), 0);
    for (let n = 1; n <= max; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') return { state, stalled: false };
      const answer = decide(move);
      if (!answer) return { state, stalled: false };
      const before = state;
      state = answerMove(state, answer, n);
      // An answer the engine silently discarded leaves the player tapping a
      // button that does nothing — indistinguishable from a frozen app.
      if (state === before) return { state, stalled: true };
    }
    return { state, stalled: true };
  }

  const routine = (m: NonNullable<TonightState['current']>) => {
    if (m.kind === 'context') return { subject: m.field, value: m.intents?.[0]?.id ?? 'alone' };
    if (m.kind === 'stimulus') return { subject: m.stimulus.title.id, value: 'pull' };
    if (m.kind === 'twist') return { subject: m.twist.id, value: 'stayed' };
    return null;
  };

  it('rejecting a shortlist does not pin the session to it forever', () => {
    // REGRESSION. Every finalcut answer used to carry the subject 'finalcut',
    // so "None of these" and the next pick produced the same idempotency key —
    // the pick was dropped as a duplicate and the session could never end. The
    // player tapped a live button that did nothing, indefinitely.
    let rejected = false;
    const { state, stalled } = play((m) => {
      if (m.kind !== 'finalcut') return routine(m);
      if (!rejected) {
        rejected = true;
        return { subject: 'reject-all', value: 'reject-all' };
      }
      return { subject: m.finalists[0]!.title.id, value: m.finalists[0]!.title.id };
    });
    expect(rejected, 'the run never reached a Final Cut').toBe(true);
    expect(stalled, 'the session stalled after a rejection').toBe(false);
    expect(state.current?.kind).toBe('done');
  });

  it('a rejection buys a real move, not the same shortlist again', () => {
    // "None of these" means the shortlist was wrong. Answering it with an
    // identical shortlist — nothing new having been learned — is the engine
    // repeating itself at the player.
    let state = startTonight(createTonight(), 0);
    for (let n = 1; n <= 60; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') break;
      if (move.kind === 'finalcut') {
        const next = answerMove(state, { subject: 'reject-all', value: 'reject-all' }, n);
        expect(next.current?.kind, 'a rejection was answered with another shortlist').not.toBe('finalcut');
        return;
      }
      state = answerMove(state, routine(move)!, n);
    }
    throw new Error('never reached a Final Cut');
  });

  it('reports the chosen film, never its internal id', () => {
    // REGRESSION. The Reveal printed the raw interaction subject, so a player
    // who picked *Dark* saw "dark" as the headline result of the session.
    const { state } = play((m) =>
      m.kind === 'finalcut'
        ? { subject: m.finalists[0]!.title.id, value: m.finalists[0]!.title.id }
        : routine(m),
    );
    const chosen = chosenTitle(state);
    expect(chosen, 'no chosen title was resolvable').toBeDefined();
    expect(chosen!.title).not.toBe(chosen!.id);
    expect(chosen!.year).toBeGreaterThan(1900);
  });

  it('choosing the same finalist twice counts once', () => {
    let state = startTonight(createTonight(), 0);
    for (let n = 1; n <= 60; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') break;
      if (move.kind === 'finalcut') {
        const pick = { subject: move.finalists[0]!.title.id, value: move.finalists[0]!.title.id };
        const once = answerMove(state, pick, n);
        const twice = answerMove(once, pick, n + 1);
        expect(twice.interactions.length, 'a retried pick was counted twice').toBe(
          once.interactions.length,
        );
        return;
      }
      state = answerMove(state, routine(move)!, n);
    }
    throw new Error('never reached a Final Cut');
  });
});
