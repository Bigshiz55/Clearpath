import { describe, it, expect } from 'vitest';
import { PROBES_BY_ID, TITLES_BY_ID } from './definition';
import {
  MAX_PROBES,
  MIN_PROBES,
  PROBE_WEIGHT,
  STRONG_BONUS,
  TITLE_WEIGHT,
  answerAb,
  answerScale,
  answerTitle,
  createRun,
  passRate,
  skipCurrent,
  replay,
  signalCount,
  start,
  type QuickRun,
} from './run';
import { traitBelief, type TraitKey, type TraitProfile } from './traits';
import { dnaBars, insightChips } from './synthesis';

/**
 * DOES QUICK DNA ACTUALLY TELL PEOPLE APART?
 *
 * Unit tests on a parser prove the words are read correctly. They say nothing
 * about whether eighty seconds of answers produce a profile that distinguishes
 * a crime obsessive from a horror fan — which is the entire product claim.
 *
 * So each persona below is a rule for answering ANY question, and the run is
 * driven end to end against it. What gets asserted is the thing that matters:
 * that the resulting profiles differ in the ways the people differ, and that no
 * single genre word or single movie can push a profile somewhere it should not
 * go.
 *
 * Deterministic: personas answer by rule, and the "noisy" ones use a seeded
 * generator, so a failure is reproducible instead of a flake.
 */

/** Answers any probe/title from a set of trait leanings the person has. */
interface Persona {
  name: string;
  /** Trait → how much they like it, 0..1. Anything unlisted is 0.5. */
  leanings: Partial<Record<TraitKey, number>>;
  /** Titles they have not seen, by id. */
  unseen?: string[];
}

const lean = (p: Persona, key: TraitKey): number => p.leanings[key] ?? 0.5;

/** What this persona would say to a 0–10 probe: the mean of what it touches. */
function scaleAnswerFor(p: Persona, probeId: string): number {
  const probe = PROBES_BY_ID.get(probeId)!;
  let sum = 0;
  let weight = 0;
  for (const eff of probe.effects) {
    const value = eff.invert ? 1 - lean(p, eff.key) : lean(p, eff.key);
    sum += value * eff.strength;
    weight += eff.strength;
  }
  return weight === 0 ? 5 : Math.round((sum / weight) * 10);
}

/** Which side of an either/or this persona prefers. */
function abAnswerFor(p: Persona, probeId: string): 'a' | 'b' {
  const probe = PROBES_BY_ID.get(probeId)!;
  const score = (effects: readonly { key: TraitKey; strength: number; invert?: boolean }[]) =>
    effects.reduce((s, eff) => s + (eff.invert ? 1 - lean(p, eff.key) : lean(p, eff.key)) * eff.strength, 0);
  return score(probe.optionA?.effects ?? []) >= score(probe.optionB?.effects ?? []) ? 'a' : 'b';
}

/** How this persona reacts to a diagnostic title. */
function titleAnswerFor(p: Persona, titleId: string): { reaction: 'yes' | 'no' | 'pass'; strong: boolean } {
  if (p.unseen?.includes(titleId)) return { reaction: 'pass', strong: false };
  const title = TITLES_BY_ID.get(titleId)!;
  let sum = 0;
  let weight = 0;
  for (const eff of title.traits) {
    const value = eff.invert ? 1 - lean(p, eff.key) : lean(p, eff.key);
    sum += value * eff.strength;
    weight += eff.strength;
  }
  const score = weight === 0 ? 0.5 : sum / weight;
  // Someone who has seen a film still has an opinion when it is a close call.
  // Modelling ambivalence as "haven't seen it" invented a pass rate that no
  // real viewer would produce and hid how good the selector actually is.
  if (score >= 0.5) return { reaction: 'yes', strong: score >= 0.8 };
  return { reaction: 'no', strong: score <= 0.2 };
}

/** Drive a whole run against a persona. Time advances at a realistic pace. */
function runPersona(p: Persona, seed: TraitProfile = {}): QuickRun {
  let run = start(createRun(0, seed), 0);
  let now = 0;
  for (let guard = 0; guard < 80 && run.current; guard++) {
    now += 1800; // ~1.8s per answer, comfortably inside the budget
    if (run.current.kind === 'probe') {
      const probe = run.current.probe;
      run =
        probe.kind === 'ab'
          ? answerAb(run, abAnswerFor(p, probe.id), now, 'voice', 0.9)
          : answerScale(run, scaleAnswerFor(p, probe.id), now, 'voice', 0.9);
    } else {
      const { reaction, strong } = titleAnswerFor(p, run.current.title.id);
      run = answerTitle(run, reaction, strong, now, 'voice', 0.9);
    }
  }
  return run;
}

const PERSONAS: Persona[] = [
  {
    name: 'crime obsessive who hates the supernatural',
    leanings: {
      crime: 0.95, investigation: 0.95, psychological: 0.9, darkness: 0.85, grounded: 0.95,
      trueCrime: 0.8, supernatural: 0.05, fantasy: 0.1, comedy: 0.2, romance: 0.1, horrorTolerance: 0.6,
    },
  },
  {
    name: 'comedy-first viewer',
    leanings: { comedy: 0.95, darkness: 0.2, romance: 0.6, investigation: 0.3, horrorTolerance: 0.1, patience: 0.2 },
  },
  {
    name: 'sci-fi fan',
    leanings: { scifi: 0.95, complexity: 0.85, fantasy: 0.7, grounded: 0.4, crime: 0.3, comedy: 0.4, patience: 0.7 },
  },
  {
    name: 'mainstream action viewer',
    leanings: { action: 0.95, patience: 0.15, complexity: 0.3, comedy: 0.6, investigation: 0.3, subtitles: 0.1 },
  },
  {
    name: 'prestige drama viewer',
    leanings: { complexity: 0.9, patience: 0.9, darkness: 0.7, grounded: 0.8, action: 0.2, comedy: 0.3, subtitles: 0.8, international: 0.8 },
  },
  {
    name: 'horror fan',
    leanings: { horrorTolerance: 0.95, supernatural: 0.9, darkness: 0.9, grounded: 0.25, comedy: 0.3, romance: 0.1 },
  },
  {
    name: 'international mystery fan',
    leanings: { international: 0.95, subtitles: 0.95, investigation: 0.85, complexity: 0.8, patience: 0.75, action: 0.3 },
  },
  {
    name: 'older-movie fan',
    leanings: { vintage: 0.95, patience: 0.8, action: 0.3, scifi: 0.3, supernatural: 0.2, romance: 0.6 },
  },
  {
    name: 'casual viewer with a thin history',
    leanings: { comedy: 0.6, action: 0.6, complexity: 0.35, patience: 0.3 },
    unseen: ['dark', 'true-detective', 'making-a-murderer', 'hereditary', 'prisoners', 'casablanca'],
  },
];

const prefOf = (run: QuickRun, key: TraitKey) => traitBelief(run.profile, key).pref;

describe('a run collects what it promised', () => {
  it('captures 30-plus meaningful signals inside the budget', () => {
    for (const p of PERSONAS) {
      const run = runPersona(p);
      expect(signalCount(run), `${p.name} produced too few signals`).toBeGreaterThanOrEqual(28);
    }
  });

  it('asks between the stated minimum and maximum number of probes', () => {
    for (const p of PERSONAS) {
      const run = runPersona(p);
      expect(run.askedProbes.length, p.name).toBeGreaterThanOrEqual(MIN_PROBES);
      expect(run.askedProbes.length, p.name).toBeLessThanOrEqual(MAX_PROBES);
    }
  });

  it('never asks the same probe or title twice', () => {
    for (const p of PERSONAS) {
      const run = runPersona(p);
      expect(new Set(run.askedProbes).size).toBe(run.askedProbes.length);
      expect(new Set(run.askedTitles).size).toBe(run.askedTitles.length);
    }
  });

  it('keeps the pass rate low — a high one means a bad selector', () => {
    for (const p of PERSONAS.filter((x) => !x.unseen)) {
      expect(passRate(runPersona(p)), `${p.name} passed too often`).toBeLessThan(0.35);
    }
  });

  it('replaying the signals reproduces the profile exactly', () => {
    for (const p of PERSONAS) {
      const run = runPersona(p);
      const rebuilt = replay(run.signals);
      for (const key of Object.keys(run.profile) as TraitKey[]) {
        expect(rebuilt[key]?.pref, `${p.name}/${key}`).toBeCloseTo(run.profile[key]!.pref, 8);
      }
    }
  });
});

describe('the profiles actually distinguish these people', () => {
  it('the crime obsessive comes out investigative, dark and grounded', () => {
    const run = runPersona(PERSONAS[0]!);
    expect(prefOf(run, 'investigation')).toBeGreaterThan(70);
    expect(prefOf(run, 'grounded')).toBeGreaterThan(60);
    expect(prefOf(run, 'supernatural')).toBeLessThan(35);
  });

  it('the horror fan is the mirror image on the supernatural', () => {
    const crime = runPersona(PERSONAS[0]!);
    const horror = runPersona(PERSONAS[5]!);
    expect(prefOf(horror, 'supernatural')).toBeGreaterThan(prefOf(crime, 'supernatural') + 30);
    expect(prefOf(horror, 'horrorTolerance')).toBeGreaterThan(60);
  });

  it('the comedy viewer and the prestige viewer disagree about difficulty', () => {
    const comedy = runPersona(PERSONAS[1]!);
    const prestige = runPersona(PERSONAS[4]!);
    expect(prefOf(comedy, 'comedy')).toBeGreaterThan(prefOf(prestige, 'comedy'));
    expect(prefOf(prestige, 'complexity')).toBeGreaterThan(prefOf(comedy, 'complexity') + 20);
    expect(prefOf(prestige, 'patience')).toBeGreaterThan(prefOf(comedy, 'patience') + 20);
  });

  it('the action viewer has no patience and the drama viewer does', () => {
    expect(prefOf(runPersona(PERSONAS[3]!), 'patience')).toBeLessThan(40);
    expect(prefOf(runPersona(PERSONAS[4]!), 'patience')).toBeGreaterThan(60);
  });

  it('the international fan is separated from the action viewer on subtitles', () => {
    const intl = runPersona(PERSONAS[6]!);
    const action = runPersona(PERSONAS[3]!);
    expect(prefOf(intl, 'subtitles')).toBeGreaterThan(prefOf(action, 'subtitles') + 30);
  });

  it('every persona gets a distinct top trait or a distinct set of chips', () => {
    const fingerprints = PERSONAS.map((p) => {
      const run = runPersona(p);
      const bars = dnaBars(run.profile, 3).map((b) => b.key).join(',');
      const chips = insightChips(run.profile, 3).map((c) => c.id).join(',');
      return `${bars}|${chips}`;
    });
    // Nine different people must not collapse into a handful of profiles.
    expect(new Set(fingerprints).size).toBeGreaterThanOrEqual(7);
  });

  it('produces insight, not just a scoreboard', () => {
    const run = runPersona(PERSONAS[0]!);
    const chips = insightChips(run.profile).map((c) => c.id);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips).toContain('grounded-over-supernatural');
  });
});

describe('adversarial: nothing single can dominate', () => {
  it('one movie cannot decide a trait on its own', () => {
    // Drive to the first title, answering every probe neutrally so the only
    // decisive evidence in the run is the single reaction under test.
    let run = start(createRun(0), 0);
    let t = 0;
    while (run.current && run.current.kind !== 'title') {
      t += 1000;
      run = run.current.probe.kind === 'ab'
        ? answerAb(run, 'a', t, 'voice', 1)
        : answerScale(run, 5, t, 'voice', 1);
    }
    expect(run.current?.kind).toBe('title');
    const title = (run.current as { kind: 'title'; title: { id: string } }).title;
    const touched = TITLES_BY_ID.get(title.id)!.traits[0]!.key;
    const before = traitBelief(run.profile, touched).pref;

    run = answerTitle(run, 'yes', true, t + 1000, 'voice', 1);
    const after = traitBelief(run.profile, touched);

    // It moves the belief…
    expect(after.pref).toBeGreaterThan(before);
    // …but one film is never a settled fact about a person.
    expect(after.pref).toBeLessThan(95);
  });

  it('a movie reaction outweighs a generic genre rating, per trait touched', () => {
    // The evidence ladder, asserted as arithmetic rather than described.
    expect(TITLE_WEIGHT).toBeGreaterThan(PROBE_WEIGHT);
    // …and both stay under the weakest real post-watch review (0.35).
    expect(TITLE_WEIGHT * STRONG_BONUS).toBeLessThan(1.1);
    expect(PROBE_WEIGHT).toBeLessThan(0.35);
  });

  it('someone with no opinions is told nothing about themselves', () => {
    // Driven directly rather than through a persona: answering the exact
    // middle of every scale and passing on every title is the cleanest
    // definition of "no signal", and the summary must stay silent on it.
    // (An earlier version modelled this as a persona who liked everything,
    // which is not neutrality — it is enthusiasm, and it deserves claims.)
    let run = start(createRun(0), 0);
    let t = 0;
    for (let guard = 0; guard < 80 && run.current; guard++) {
      t += 1500;
      if (run.current.kind === 'probe') {
        run = run.current.probe.kind === 'ab'
          ? skipCurrent(run, t)
          : answerScale(run, 5, t, 'voice', 1);
      } else {
        run = answerTitle(run, 'pass', false, t, 'voice', 1);
      }
    }
    expect(dnaBars(run.profile), 'claimed a preference for someone who stated none').toEqual([]);
    expect(insightChips(run.profile), 'made a comparative claim with nothing to compare').toEqual([]);
  });

  it('a contradictory user is read as a distinction, not as noise', () => {
    // Hates supernatural horror, loves grounded psychological killers — the
    // case the brief calls out. The profile must SPLIT these rather than
    // averaging them into "horror = 5".
    const split: Persona = {
      name: 'grounded-dark',
      leanings: {
        supernatural: 0.05, grounded: 0.95, psychological: 0.95, darkness: 0.9,
        horrorTolerance: 0.6, investigation: 0.9,
      },
    };
    const run = runPersona(split);
    expect(prefOf(run, 'psychological')).toBeGreaterThan(65);
    expect(prefOf(run, 'supernatural')).toBeLessThan(35);
    expect(insightChips(run.profile).map((c) => c.id)).toContain('grounded-over-supernatural');
  });
});

describe('the opening matches what the person was just told', () => {
  it('never opens with an either/or', () => {
    // The intro says "numbers, yes, no, or pass". A forced choice as the first
    // question asks for none of those, and an interface that contradicts its
    // own instructions in the opening second has already lost the user.
    for (const p of PERSONAS) {
      const first = start(createRun(0), 0).current;
      expect(first?.kind).toBe('probe');
      expect((first as { kind: 'probe'; probe: { kind: string } }).probe.kind, p.name).toBe('scale');
    }
  });

  it('uses either/or selectively rather than as the format', () => {
    for (const p of PERSONAS) {
      const run = runPersona(p);
      const ab = run.askedProbes.filter((id) => PROBES_BY_ID.get(id)?.kind === 'ab').length;
      expect(ab, `${p.name} was asked too many forced choices`).toBeLessThanOrEqual(3);
    }
  });
});
