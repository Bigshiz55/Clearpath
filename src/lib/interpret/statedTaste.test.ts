/**
 * A STATEMENT CAN CARRY DURABLE TASTE, AND IT WAS BEING THROWN AWAY.
 *
 * THE DEFECT, FOUND BY THE NL ACCEPTANCE MATRIX. "I love slow burns but I hate
 * gore." is `kind: 'statement'` with an empty `requestClause` — correctly: it
 * contains no order. But the tone extraction ran only over EXECUTABLE clauses,
 * so both taste signals vanished entirely: not recorded as tones, not recorded
 * as background, simply gone. The acknowledgement said "Noted." while nothing
 * had been noted. Meanwhile a COMPANION clause ("my wife likes comedies") had
 * its own genre/tone pass — the user was the one person whose stated taste the
 * interpreter refused to hear.
 *
 * WHAT THIS IS NOT. A statement stays a statement: `kind` is untouched, no
 * search runs, and the reply is still the acknowledgement. Taste is not a
 * request; it is evidence the next request spends. Companion attribution is
 * untouched — their clauses have their own pass and their own holder. And a
 * clause about the PAST ("I used to like slashers") records nothing, because
 * "used to" is a statement about who the viewer was, not who they are.
 */
import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';
import { acknowledgeStatement } from '@/lib/ask/statementBoundary';

const toneOf = (text: string, term: string) => interpret(text).tones.find((t) => t.term === term);
const genreOf = (text: string, span: string) => interpret(text).genres.find((g) => g.span === span);

describe('stated taste survives without a request clause', () => {
  it('the sentence that exposed it', () => {
    const i = interpret('I love slow burns but I hate gore.');
    expect(i.kind, 'a statement must stay a statement').toBe('statement');
    expect(i.requestClause).toBe('');
    const slow = i.tones.find((t) => t.term === 'slow');
    const gore = i.tones.find((t) => t.term === 'gore');
    expect(slow?.wanted, 'loved → wanted').toBe(true);
    expect(gore?.wanted, 'hated → ruled out').toBe(false);
  });

  it('the acknowledgement now names what was heard', () => {
    const said = acknowledgeStatement(interpret('I love slow burns but I hate gore.'));
    expect(said).toMatch(/slow/);
    expect(said).toMatch(/gore/);
    expect(said).toMatch(/What are you in the mood for\?/);
  });

  it('a liked genre is recorded, a disliked one is ruled out', () => {
    expect(genreOf('I like courtroom dramas.', 'dramas')?.wanted).toBe(true);
    const dumb = interpret("I don't like dumb comedies.");
    expect(dumb.kind).toBe('statement');
    expect(dumb.tones.find((t) => t.term === 'dumb')?.wanted).toBe(false);
  });

  it('companion taste stays the companion’s — never folded into the user', () => {
    const i = interpret('My wife likes comedies.');
    const held = i.genres.filter((g) => g.span === 'comedies');
    expect(held).toHaveLength(1);
    expect(held[0]!.holder).toBe('companion');
  });

  it('background prose contributes nothing', () => {
    const i = interpret('I had a beef burrito for dinner and loved Rocky.');
    expect(i.genres).toEqual([]);
    expect(i.tones).toEqual([]);
    expect(i.titles).toEqual([expect.objectContaining({ span: 'Rocky', relation: 'liked' })]);
  });

  it('the past tense of a taste that ended records nothing', () => {
    const i = interpret('I used to like slashers but not anymore.');
    expect(i.genres).toEqual([]);
    expect(i.tones).toEqual([]);
  });

  it('a statement with taste still refuses to search', () => {
    const i = interpret('I love slow burns but I hate gore.');
    expect(i.kind).toBe('statement');
  });

  it('a sentence that carries BOTH taste and a request keeps both, unchanged', () => {
    const i = interpret("I liked Rocky a few weeks ago. I'm looking for another boxing movie.");
    expect(i.kind).toBe('recommendation');
    expect(i.subjects.map((s) => s.span)).toEqual(['boxing']);
    expect(i.titles).toEqual([expect.objectContaining({ span: 'Rocky', relation: 'liked' })]);
  });

  it('third-party opinion about an unnamed title stays silent', () => {
    const i = interpret('my wife hated it but I liked it');
    expect(i.kind).toBe('statement');
    expect(i.genres).toEqual([]);
    expect(i.tones).toEqual([]);
  });
});
