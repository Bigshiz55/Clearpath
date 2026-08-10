import { describe, it, expect } from 'vitest';
import { EMPTY_DNA, mergeDna, parseDna, type StoredDna } from './persist';
import { choose, createGame, everShown, reactToTitle, startGame, type GameState } from './game';
import { dnaKnown } from './families';

/**
 * REPLAYING HAS TO ADD SOMETHING.
 *
 * Two promises are being kept here, and the second is the one a player would
 * notice being broken: a later game starts from what earlier games learned, and
 * NOTHING IS EVER PUT TO SOMEONE TWICE. Being shown the same six options on a
 * second run is the clearest possible sign that a quiz was not listening.
 */

/** Play a whole game, tapping the first available option each time. */
function play(state: GameState): GameState {
  let s = startGame(state, 0);
  for (let i = 0; i < 80 && s.current; i++) {
    s = s.current.layout === 'poster'
      ? reactToTitle(s, i % 3 === 0 ? 'no' : 'yes', 1000 + i, 900)
      : choose(s, s.current.choices.slice(0, s.current.picks).map((c) => c.id), 1000 + i, 900);
  }
  return s;
}

/** Exactly what the component folds in: everything SHOWN, not merely consumed. */
const fold = (prior: StoredDna, g: GameState) => {
  const shown = everShown(g);
  return mergeDna(
    prior,
    {
      profile: g.profile,
      usedChoiceIds: shown.choiceIds,
      usedTitleIds: shown.titleIds,
      decisions: g.decisions.length,
    },
    true,
  );
};

describe('stored DNA survives a bad or missing entry', () => {
  it('reads nothing, rubbish and the wrong shape as "no DNA yet"', () => {
    expect(parseDna(null)).toEqual(EMPTY_DNA);
    expect(parseDna('not json')).toEqual(EMPTY_DNA);
    expect(parseDna('{"profile":null}')).toEqual(EMPTY_DNA);
    expect(parseDna('[]')).toEqual(EMPTY_DNA);
  });

  it('drops non-string ids rather than carrying them into a game', () => {
    const dna = parseDna('{"profile":{},"usedChoiceIds":["a",7,null,"b"]}');
    expect(dna.usedChoiceIds).toEqual(['a', 'b']);
  });
});

describe('merging is additive on every axis', () => {
  it('never loses an id that was already seen', () => {
    const prior: StoredDna = { ...EMPTY_DNA, usedChoiceIds: ['x'], usedTitleIds: ['t'] };
    const merged = mergeDna(
      prior,
      { profile: {}, usedChoiceIds: ['y'], usedTitleIds: ['u'], decisions: 3 },
      true,
    );
    expect(merged.usedChoiceIds.sort()).toEqual(['x', 'y']);
    expect(merged.usedTitleIds.sort()).toEqual(['t', 'u']);
  });

  it('does not double-count an id seen in two games', () => {
    const prior: StoredDna = { ...EMPTY_DNA, usedChoiceIds: ['x'] };
    const merged = mergeDna(
      prior,
      { profile: {}, usedChoiceIds: ['x'], usedTitleIds: [], decisions: 1 },
      true,
    );
    expect(merged.usedChoiceIds).toEqual(['x']);
  });

  it('counts a completed play but not an abandoned one', () => {
    const g = { profile: {}, usedChoiceIds: [], usedTitleIds: [], decisions: 5 };
    expect(mergeDna(EMPTY_DNA, g, true).plays).toBe(1);
    expect(mergeDna(EMPTY_DNA, g, false).plays).toBe(0);
    // Decisions accumulate either way — an abandoned game still taught us.
    expect(mergeDna(EMPTY_DNA, g, false).decisions).toBe(5);
  });
});

describe('a second play is all new ground', () => {
  it('repeats nothing from the first game', () => {
    const first = play(createGame(0));
    const dna = fold(EMPTY_DNA, first);
    const second = play(createGame(0, dna.profile, dna));

    const askedFirst = new Set(first.decisions.flatMap((d) => d.shown));
    const askedSecond = second.decisions.flatMap((d) => d.shown);
    expect(askedSecond.length, 'the second game asked nothing at all').toBeGreaterThan(5);
    const repeats = askedSecond.filter((id) => askedFirst.has(id));
    expect(repeats, `repeated: ${repeats.join(', ')}`).toEqual([]);
  });

  it('starts from what the first game learned rather than from nothing', () => {
    const first = play(createGame(0));
    const dna = fold(EMPTY_DNA, first);
    const second = startGame(createGame(0, dna.profile, dna), 0);
    expect(Object.keys(second.profile).length).toBeGreaterThan(5);
    expect(second.profile).toEqual(first.profile);
  });

  it('still deals a real game to someone who has seen almost everything', () => {
    // Three full plays is well past the bank; a fourth must not open on the
    // payoff screen having asked nothing.
    let dna = EMPTY_DNA;
    for (let i = 0; i < 3; i++) dna = fold(dna, play(createGame(0, dna.profile, dna)));
    const fourth = startGame(createGame(0, dna.profile, dna), 0);
    expect(fourth.current, 'a returning player was handed an empty game').not.toBeNull();
    const played = play(createGame(0, dna.profile, dna));
    expect(played.decisions.length).toBeGreaterThan(5);
  });

  it('keeps learning: more plays never means less known', () => {
    let dna = EMPTY_DNA;
    let previous = 0;
    for (let i = 0; i < 3; i++) {
      dna = fold(dna, play(createGame(0, dna.profile, dna)));
      const now = dnaKnown(dna.profile);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBeGreaterThan(0.5);
  });
});
