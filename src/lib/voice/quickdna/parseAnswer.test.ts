import { describe, it, expect } from 'vitest';
import { isAcceptable, parseAbAnswer, parseScaleAnswer, parseTitleAnswer } from './parseAnswer';

/**
 * The same microphone serves three different questions, so the danger is not
 * mishearing words — it is reading the right words in the wrong context. "No"
 * is a zero when asked about crime and a dislike when asked about Knives Out,
 * and "haven't seen it" must never be filed as a dislike, because that puts an
 * opinion the person does not hold into their permanent taste record.
 */

const react = (s: string) => {
  const a = parseTitleAnswer(s);
  return a.kind === 'title' ? a.reaction : a.kind;
};

describe('reacting to a title', () => {
  it('reads the ordinary yeses and noes', () => {
    for (const s of ['yes', 'yep', 'yeah', 'sure', 'liked it', 'good']) expect(react(s)).toBe('yes');
    for (const s of ['no', 'nope', 'nah', "didn't like it", 'boring', 'meh']) expect(react(s)).toBe('no');
  });

  it('never files "haven\'t seen it" as a dislike', () => {
    // Each of these contains a word that a naive matcher reads as negative.
    for (const s of [
      "haven't seen it", 'have not seen it', 'never seen that', 'never saw it',
      "don't know it", 'no idea', "can't remember", 'pass',
    ]) {
      expect(react(s), `"${s}" must be a pass`).toBe('pass');
    }
  });

  it('keeps the stronger statement as stronger evidence', () => {
    const loved = parseTitleAnswer('loved it');
    expect(loved).toMatchObject({ kind: 'title', reaction: 'yes', strong: true });
    const hated = parseTitleAnswer('hated it');
    expect(hated).toMatchObject({ kind: 'title', reaction: 'no', strong: true });
    expect(parseTitleAnswer('yes')).toMatchObject({ strong: false });
  });

  it('reads "didn\'t like it" as a no, despite containing "like"', () => {
    expect(react("didn't like it")).toBe('no');
    expect(react('did not like it')).toBe('no');
  });

  it('accepts a number given to a movie as an opinion', () => {
    expect(react('nine')).toBe('yes');
    expect(react('two')).toBe('no');
    expect(parseTitleAnswer('ten')).toMatchObject({ reaction: 'yes', strong: true });
  });

  it('hears "go back" rather than mining it for a reaction', () => {
    expect(parseTitleAnswer('go back').kind).toBe('back');
  });

  it('says nothing when it heard nothing', () => {
    for (const s of ['', '   ', 'hmm']) expect(parseTitleAnswer(s).kind).toBe('none');
  });
});

describe('answering a 0-10 probe', () => {
  it('reads numbers, hedges and opinions', () => {
    expect(parseScaleAnswer('nine')).toMatchObject({ kind: 'scale', value: 9 });
    expect(parseScaleAnswer('probably a nine')).toMatchObject({ value: 9 });
    expect(parseScaleAnswer('none')).toMatchObject({ value: 0 });
    expect(parseScaleAnswer('love it')).toMatchObject({ value: 10 });
  });

  it('treats a spoken correction as a restatement, not a rewind', () => {
    // "make that a seven" means seven — sending the user back a question
    // instead would be maddening and lose the answer they just gave.
    const a = parseScaleAnswer('make that a seven');
    expect(a).toMatchObject({ kind: 'scale', value: 7, corrected: true });
    expect(parseScaleAnswer('I meant eight')).toMatchObject({ kind: 'scale', value: 8 });
  });

  it('still honours an explicit request to go back', () => {
    expect(parseScaleAnswer('go back').kind).toBe('back');
  });

  it('refuses two different numbers rather than picking one', () => {
    expect(parseScaleAnswer('seven or eight').kind).toBe('none');
  });

  it('drops below the accept bar on a poor microphone reading', () => {
    expect(isAcceptable(parseScaleAnswer('eight', 0.05))).toBe(false);
    expect(isAcceptable(parseScaleAnswer('eight', 0.9))).toBe(true);
    // Safari reports 0 for everything; that must not re-ask every question.
    expect(isAcceptable(parseScaleAnswer('eight', 0))).toBe(true);
  });
});

describe('answering an either/or', () => {
  const A = ['whodunit', 'first', 'a'];
  const B = ['procedural', 'police', 'second', 'b'];

  it('picks the side that was named', () => {
    expect(parseAbAnswer('whodunit', A, B)).toMatchObject({ kind: 'ab', option: 'a' });
    expect(parseAbAnswer('the police one', A, B)).toMatchObject({ option: 'b' });
    expect(parseAbAnswer('second', A, B)).toMatchObject({ option: 'b' });
  });

  it('refuses when both sides or neither is named', () => {
    expect(parseAbAnswer('whodunit or procedural', A, B).kind).toBe('none');
    expect(parseAbAnswer('either is fine', A, B).kind).toBe('none');
  });

  it('hears skip and back', () => {
    expect(parseAbAnswer('skip', A, B).kind).toBe('skip');
    expect(parseAbAnswer('go back', A, B).kind).toBe('back');
  });
});
