/**
 * "NOTED" MUST NOT BE A FALSE CLAIM.
 *
 * The statement boundary acknowledges taste and runs nothing — correct. But in
 * conversation mode the state used to ride back UNCHANGED, so the next turn
 * ("ok, what should we watch?") executed as though nothing had been said. The
 * acknowledgement claimed "Noted" over evidence that was already gone.
 *
 * These tests drive the REAL fold: interpret() reads the sentence, then
 * absorbStatement lands it in the same CanonicalRequest every later turn
 * executes from, and stateToQuery proves the next request would actually
 * carry it. No side channel, no test-only store.
 */
import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';
import { genreIdFor } from '@/lib/ask/canonicalExecution';
import { absorbStatement, EMPTY_REQUEST, stateToQuery, chipsFor } from './conversationState';

const absorb = (text: string, prev = EMPTY_REQUEST) =>
  absorbStatement(prev, interpret(text), genreIdFor);

describe('a statement’s taste survives into the next turn', () => {
  it('the sentence that exposed it', () => {
    const { state, notes } = absorb('I love slow burns but I hate gore.');
    expect(state.tones, 'loved slow burns → a standing lean').toContain('slow');
    // gore has no genre home in this state — that limit is SAID, never silent.
    expect(notes.join(' ')).toMatch(/gore/);
    expect(notes.join(' ')).toMatch(/can.t hold/);
  });

  it('a disliked genre excludes on the NEXT turn, through the real execution path', () => {
    const { state } = absorb('I like thrillers but I hate horror.');
    const q = stateToQuery(state);
    expect(q.genreIds).toContain(53);
    expect(q.excludeGenreIds).toContain(27);
  });

  it('a vetoed tone with a genre alias takes the exclusion home', () => {
    const { state } = absorb("I don't like scary stuff.");
    expect(state.excludeGenreIds).toContain(27);
  });

  it('a liked title becomes a similarity reference', () => {
    const { state } = absorb('I loved Rocky.');
    expect(state.referenceTitles).toContain('Rocky');
  });

  it('latest polarity wins — a change of mind replaces, never contradicts', () => {
    const first = absorb('I hate comedies.');
    const second = absorbStatement(first.state, interpret('Actually I like comedies.'), genreIdFor);
    expect(second.state.includeGenreIds).toContain(35);
    expect(second.state.excludeGenreIds).not.toContain(35);
  });

  it('what was carried renders as chips the user can see and remove', () => {
    const { state } = absorb('I like thrillers but I hate horror.');
    const labels = chipsFor(state).map((c) => c.id);
    expect(labels.some((l) => l.includes('53') || l.toLowerCase().includes('thriller'))).toBe(true);
  });

  it('a statement with nothing carriable produces no false "keeping" note', () => {
    const { notes } = absorb('my wife hated it but I liked it');
    expect(notes.join(' ')).not.toMatch(/Keeping for this conversation/);
  });
});
