import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { traitBelief, traitConfidence, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { dnaKnown } from '@/lib/dnagame/families';
import { informationGain, nextMatchup, pairKey, pull } from './matchup';
import { TARGET_DECISIONS, answer, createSession, evidenceFor, startSession, type ShowdownState } from './session';

/**
 * DOES IT ACTUALLY LEARN ANYTHING?
 *
 * Proving that tapping a poster changes the screen would prove nothing. The
 * claims that matter are that two people who answer DIFFERENTLY end up with
 * different beliefs, get asked different questions as a result, and would be
 * recommended different films — and that someone who has already told us a lot
 * stops being asked what we already know.
 *
 * Every simulated player below is a rule, not a script: they look at the two
 * titles they are actually shown and pick by their own taste. That is what
 * makes the outcome evidence rather than a fixture.
 */

/** A simulated person: how much they want a title, from its trait vector. */
type Taste = Partial<Record<TraitKey, number>>;

function appetite(taste: Taste, title: (typeof TITLES)[number]): number {
  let score = 0;
  for (const e of title.traits) {
    const want = taste[e.key];
    if (want === undefined) continue;
    const signed = e.invert ? -e.strength : e.strength;
    score += signed * (want - 0.5) * 2;
  }
  return score;
}

/** Play a whole session as this person. Deterministic. */
function play(taste: Taste, seed: Partial<ShowdownState> = {}): ShowdownState {
  let s = startSession(createSession({ profile: seed.profile ?? {} }), 0);
  for (let i = 0; i < TARGET_DECISIONS + 4 && s.current; i++) {
    const { left, right } = s.current;
    const l = appetite(taste, left);
    const r = appetite(taste, right);
    // Someone who actively dislikes both says so — that is what Neither is for.
    const verdict = l < -0.4 && r < -0.4 ? 'neither' : l >= r ? 'left' : 'right';
    s = answer(s, verdict, 1000 + i, 900);
  }
  return s;
}

const DARK_REALIST: Taste = {
  darkness: 1, psychological: 1, grounded: 0.95, investigation: 0.9, crime: 0.85,
  supernatural: 0.05, comedy: 0.1, fantasy: 0.05, animation: 0.05, musical: 0.05,
};
const BRIGHT_ESCAPIST: Taste = {
  comedy: 1, family: 0.95, animation: 0.9, fantasy: 0.85, musical: 0.8, romance: 0.7,
  darkness: 0.05, psychological: 0.1, horrorTolerance: 0.05, trueCrime: 0.05,
};

describe('two different people learn two different profiles', () => {
  const dark = play(DARK_REALIST);
  const bright = play(BRIGHT_ESCAPIST);

  it('both sessions actually ran', () => {
    expect(dark.decisions.length).toBeGreaterThanOrEqual(8);
    expect(bright.decisions.length).toBeGreaterThanOrEqual(8);
  });

  it('the profiles disagree where the people disagree', () => {
    // Confidence-weighted, because that is what any consumer reads.
    const eff = (p: TraitProfile, k: TraitKey) =>
      50 + (traitBelief(p, k).pref - 50) * traitConfidence(p, k);

    expect(eff(dark.profile, 'darkness')).toBeGreaterThan(eff(bright.profile, 'darkness') + 15);
    expect(eff(bright.profile, 'comedy')).toBeGreaterThan(eff(dark.profile, 'comedy') + 10);
  });

  it('they were not even asked the same questions', () => {
    const asked = (s: ShowdownState) => new Set(s.decisions.map((d) => pairKey(d.leftId, d.rightId)));
    const a = asked(dark);
    const b = asked(bright);
    const shared = [...a].filter((k) => b.has(k)).length;
    // Some overlap is correct — the opening question is the same for everyone,
    // since neither has told us anything yet. Most of it should diverge.
    expect(shared).toBeLessThan(Math.min(a.size, b.size) * 0.7);
  });

  it('and they would be recommended different films', () => {
    // The same ranking shape a recommender uses: fit the trait vector to the
    // profile, weighted by how confident that profile is.
    const rank = (p: TraitProfile) =>
      [...TITLES]
        .map((t) => ({
          id: t.id,
          fit: t.traits.reduce((sum, e) => {
            const belief = traitBelief(p, e.key);
            const wanted = e.invert ? 100 - belief.pref : belief.pref;
            return sum + ((wanted - 50) / 50) * e.strength * traitConfidence(p, e.key);
          }, 0),
        }))
        .sort((x, y) => y.fit - x.fit)
        .slice(0, 5)
        .map((x) => x.id);

    const topDark = rank(dark.profile);
    const topBright = rank(bright.profile);
    const overlap = topDark.filter((id) => topBright.includes(id)).length;
    expect(overlap, `both were recommended ${topDark.join(', ')}`).toBeLessThanOrEqual(1);
  });
});

describe('it stops asking what it already knows', () => {
  it('a well-known profile is asked harder questions than a blank one', () => {
    const known = play(DARK_REALIST).profile;

    const cold = nextMatchup({ profile: {}, seenPairs: [], unseenTitles: [], recentAxes: [] })!;
    const warm = nextMatchup({ profile: known, seenPairs: [], unseenTitles: [], recentAxes: [] })!;

    expect(cold).not.toBeNull();
    expect(warm).not.toBeNull();
    // The opening question for someone we know nothing about is not the
    // opening question for someone we know well.
    expect(pairKey(warm.left.id, warm.right.id)).not.toBe(pairKey(cold.left.id, cold.right.id));

    // And the same pair is worth less once the axes it tests are settled.
    const before = informationGain(cold.left, cold.right, {}).gain;
    const after = informationGain(cold.left, cold.right, known).gain;
    expect(after, 'a settled pair is still scoring as if it were open').toBeLessThan(before);
  });

  it('a returning player runs out of worthwhile questions sooner', () => {
    const first = play(DARK_REALIST);
    // Same person, coming back with everything the first session learned and
    // every pair it already asked.
    let s = startSession(
      createSession({ profile: first.profile, seenPairs: first.seenPairs }),
      0,
    );
    let asked = 0;
    for (let i = 0; i < TARGET_DECISIONS && s.current; i++) {
      s = answer(s, 'left', 2000 + i, 900);
      asked++;
    }
    // It may still find things to ask — but the questions it asks are worth
    // less than the ones a blank profile was asked, because the easy ground is
    // gone. That is the claim: no redundant re-confirmation.
    const firstAvgGain = first.decisions.reduce((a, d) => a + d.gain, 0) / first.decisions.length;
    const secondAvgGain = asked > 0 ? s.decisions.reduce((a, d) => a + d.gain, 0) / asked : 0;
    expect(secondAvgGain, 'the second session is re-asking easy questions').toBeLessThan(firstAvgGain);
  });

  it('knowing more never means knowing less', () => {
    const s = play(DARK_REALIST);
    expect(dnaKnown(s.profile)).toBeGreaterThan(dnaKnown({}));
  });
});

describe('a matchup is never wasted', () => {
  it('never pairs a title with itself', () => {
    let s = startSession(createSession(), 0);
    for (let i = 0; i < TARGET_DECISIONS && s.current; i++) {
      expect(s.current.left.id).not.toBe(s.current.right.id);
      s = answer(s, i % 2 === 0 ? 'left' : 'right', 1000 + i, 900);
    }
  });

  it('never repeats a pair', () => {
    const s = play(DARK_REALIST);
    const keys = s.decisions.map((d) => pairKey(d.leftId, d.rightId));
    expect(new Set(keys).size, 'a matchup was asked twice').toBe(keys.length);
  });

  it('every matchup it deals actually separates something', () => {
    let s = startSession(createSession(), 0);
    for (let i = 0; i < TARGET_DECISIONS && s.current; i++) {
      const { left, right, testing } = s.current;
      expect(testing.length, 'a matchup was dealt that tests nothing').toBeGreaterThan(0);
      // The headline axis must genuinely be contested by these two titles.
      expect(Math.abs(pull(left, testing[0]!) - pull(right, testing[0]!))).toBeGreaterThan(0);
      s = answer(s, 'left', 1000 + i, 900);
    }
  });

  it('prefers pairs people can actually have an opinion about', () => {
    const obscure = TITLES.filter((t) => t.recognition < 0.6).map((t) => t.id);
    let s = startSession(createSession(), 0);
    let obscureShown = 0;
    for (let i = 0; i < 6 && s.current; i++) {
      if (obscure.includes(s.current.left.id)) obscureShown++;
      if (obscure.includes(s.current.right.id)) obscureShown++;
      s = answer(s, 'left', 1000 + i, 900);
    }
    // Not banned — sometimes an obscure film is the only thing that separates
    // an axis — but it must not dominate the opening run.
    expect(obscureShown).toBeLessThan(6);
  });
});
