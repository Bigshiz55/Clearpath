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
