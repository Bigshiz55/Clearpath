/**
 * A PERSON IS NOT A THEME, AND A BARE NOUN PHRASE IS STILL A REQUEST.
 *
 * These two defects are the language half of the production incident traced in
 * the black-box gate: "Give me a Stallone movie" returned ZERO titles because
 * the surname reached the finder as a STRICT SUBJECT — "show only titles where
 * *stallone* is genuinely central" — which no film can satisfy, an actor not
 * being a theme. The legacy path reached that state through
 * `detectGeneralSubject(rawUtterance)`; this file pins that the CANONICAL layer
 * must not hand the same mistake downstream in a new coat.
 *
 * The fix is NOT "a person disables subjects". Both can be true at once, and
 * `a Tom Hanks courtroom movie` is the case that proves it: person Tom Hanks
 * AND subject courtroom. What must never happen is the person's own name
 * ALSO becoming the subject.
 *
 * The second defect is upstream of the first: a bare noun phrase
 * ("a courtroom movie") carries no imperative, so it was classified as
 * background and produced no request at all. A noun phrase headed by a media
 * noun IS an order — it names the thing being asked for and nothing else.
 * The rule is anchored at BOTH ends so it cannot re-admit the collision cases
 * the clause default exists to reject: "work was a horror show" does not begin
 * with a determiner and stays background.
 */
import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';

const subjects = (t: string) => interpret(t).subjects.filter((s) => s.wanted).map((s) => s.span);
const people = (t: string) => interpret(t).people.map((p) => p.span);

describe('a named person never becomes a subject', () => {
  it('the surname in "a Stallone movie" is not a theme', () => {
    expect(subjects('Give me a Stallone movie')).not.toContain('stallone');
  });

  it('the full name in "a Sylvester Stallone movie" is not a theme', () => {
    const i = interpret('Give me a Sylvester Stallone movie');
    expect(i.people.map((p) => p.span)).toContain('Sylvester Stallone');
    expect(i.subjects.filter((s) => s.wanted)).toHaveLength(0);
  });

  it('survives the anecdote that produced the live failure', () => {
    const i = interpret('I watched 3 movies yesterday. Give me a Sylvester Stallone movie.');
    expect(i.people.map((p) => p.span)).toContain('Sylvester Stallone');
    expect(i.subjects.filter((s) => s.wanted)).toHaveLength(0);
    expect(i.requestedCount).toBe(1);
  });
});

describe('a person and a subject can both be true', () => {
  it('a Tom Hanks courtroom movie is BOTH', () => {
    const i = interpret('a Tom Hanks courtroom movie');
    expect(i.kind).toBe('recommendation');
    expect(i.people.map((p) => p.span)).toContain('Tom Hanks');
    expect(i.subjects.filter((s) => s.wanted).map((s) => s.span)).toEqual(['courtroom']);
  });

  it('a Sylvester Stallone boxing movie is BOTH', () => {
    const i = interpret('a Sylvester Stallone boxing movie');
    expect(i.people.map((p) => p.span)).toContain('Sylvester Stallone');
    expect(i.subjects.filter((s) => s.wanted).map((s) => s.span)).toEqual(['boxing']);
  });

  it('a bare subject noun phrase is a request on its own', () => {
    const i = interpret('a courtroom movie');
    expect(i.kind).toBe('recommendation');
    expect(i.media).toBe('movie');
    expect(i.subjects.filter((s) => s.wanted).map((s) => s.span)).toEqual(['courtroom']);
    expect(people('a courtroom movie')).toHaveLength(0);
  });
});

describe('the background default is not weakened by the noun-phrase rule', () => {
  /* Each of these contains a media noun. None of them is an order, and the
     mutation testing behind this layer showed that admitting them is how a
     background clause hands its vocabulary to the engine. */
  it.each([
    'work was a horror show',
    'I watched 3 movies yesterday',
    'I saw a great movie last night',
    'the drive home was a horror show',
  ])('%j stays out of the request', (text) => {
    const i = interpret(text);
    expect(i.subjects.filter((s) => s.wanted)).toHaveLength(0);
  });

  it('the burrito is still background', () => {
    const i = interpret('Had a burrito for dinner. Give me a boxing movie');
    expect(i.subjects.filter((s) => s.wanted).map((s) => s.span)).toEqual(['boxing']);
    expect(i.background.map((b) => b.text)).toContain('Had a burrito for dinner.');
  });
});

describe('count scoping is read from the request clause only', () => {
  it.each([
    ['I watched 3 movies yesterday. Give me a Sylvester Stallone movie.', 1],
    ['I watched a movie yesterday. Give me 3 Sylvester Stallone movies.', 3],
    ['I watched 3 movies yesterday. Give me 5 Sylvester Stallone movies.', 5],
    ['3 Sylvester Stallone movies', 3],
  ])('%j → %i', (text, expected) => {
    expect(interpret(text as string).requestedCount).toBe(expected);
  });
});
