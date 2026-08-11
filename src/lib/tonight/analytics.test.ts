import { describe, it, expect, afterEach } from 'vitest';
import {
  emitTonight,
  moveAnswered,
  moveShown,
  sessionEnded,
  sessionStarted,
  setTonightSink,
  type TonightEvent,
} from './analytics';
import { answerMove, createTonight, startTonight, type TonightState } from './orchestrator';

/**
 * The two things an analytics layer can do wrong that matter.
 *
 * It can report numbers nobody produced, and it can report answers nobody
 * gave. Both make the data worse than having none, because the data is then
 * believed. Everything below is aimed at those two failures.
 */

afterEach(() => setTonightSink(null));

function capture(): TonightEvent[] {
  const events: TonightEvent[] = [];
  setTonightSink((e) => events.push(e));
  return events;
}

const routine = (m: NonNullable<TonightState['current']>) => {
  if (m.kind === 'context') return { subject: m.field, value: m.intents?.[0]?.id ?? 'alone' };
  if (m.kind === 'stimulus') return { subject: m.stimulus.title.id, value: 'pull' };
  if (m.kind === 'twist') return { subject: m.twist.id, value: 'stayed' };
  if (m.kind === 'finalcut') {
    return { subject: m.finalists[0]!.title.id, value: m.finalists[0]!.title.id };
  }
  return null;
};

describe('nothing is sent anywhere by default', () => {
  it('emits nothing at all until a sink is installed', () => {
    // Choosing where a person's viewing taste is stored is not a decision a
    // module makes by quietly defaulting to an endpoint.
    let called = false;
    setTonightSink(null);
    emitTonight({ name: 'tonight_started', sessionId: 's', step: 0 });
    expect(called).toBe(false);

    setTonightSink(() => {
      called = true;
    });
    emitTonight({ name: 'tonight_started', sessionId: 's', step: 0 });
    expect(called).toBe(true);
  });

  it('a broken sink cannot break the session in front of a player', () => {
    setTonightSink(() => {
      throw new Error('collector is down');
    });
    expect(() => emitTonight({ name: 'tonight_started', sessionId: 's', step: 0 })).not.toThrow();
  });
});

describe('events report only what the engine computed', () => {
  it('reports the recorded interaction, not the tap', () => {
    // A retried or double tap records no interaction. Emitting on the tap would
    // inflate every answer count by however impatient players are, which is
    // then read as engagement.
    let state = startTonight(createTonight(), 0);
    const move = state.current!;
    const answer = routine(move)!;

    const next = answerMove(state, answer, 1);
    expect(moveAnswered(state, next, 's', 100), 'a real answer produced no event').not.toBeNull();

    const retry = answerMove(next, answer, 2);
    expect(retry.interactions.length).toBe(next.interactions.length);
    expect(moveAnswered(next, retry, 's', 100), 'an ignored retry produced an event').toBeNull();
  });

  it('every number matches the state it was read from', () => {
    let state = startTonight(createTonight(), 0);
    for (let n = 1; n <= 6; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') break;
      const answer = routine(move);
      if (!answer) break;
      state = answerMove(state, answer, n);
    }

    const event = sessionEnded(state, 's', 'completed', 1234);
    expect(event.step).toBe(state.interactions.length);
    expect(event.evidenced).toBe(
      state.interactions.filter((i) => i.scope === 'permanent' && i.applied.length > 0).length,
    );
    expect(event.opening).toBe(Math.round(state.openingKnown * 100));
    expect(event.elapsedMs).toBe(1234);
    // Completeness is a percentage the Reveal also shows; the two must agree.
    expect(event.known).toBeGreaterThanOrEqual(0);
    expect(event.known).toBeLessThanOrEqual(100);
  });

  it('a context answer is reported as session scope, never permanent', () => {
    // The event stream must not imply a mood changed who someone is.
    let state = startTonight(createTonight(), 0);
    const move = state.current!;
    expect(move.kind).toBe('context');
    const next = answerMove(state, routine(move)!, 1);
    const event = moveAnswered(state, next, 's')!;
    expect(event.scope).toBe('session');
    expect(event.move).toBe('context');
  });

  it('an unseen answer is reported as session scope', () => {
    let state = startTonight(createTonight(), 0);
    for (let n = 1; n <= 12; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') break;
      if (move.kind === 'stimulus') {
        const next = answerMove(state, { subject: move.stimulus.title.id, value: 'unseen' }, n);
        const event = moveAnswered(state, next, 's')!;
        expect(event.answer).toBe('unseen');
        expect(event.scope, 'ignorance was reported as taste').toBe('session');
        return;
      }
      state = answerMove(state, routine(move)!, n);
    }
    throw new Error('never reached a stimulus');
  });

  it('a rejected shortlist gets its own name', () => {
    // The most important negative signal in the product: the recommendation was
    // wrong. Folding it in with ordinary answers hides it.
    let state = startTonight(createTonight(), 0);
    for (let n = 1; n <= 40; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') break;
      if (move.kind === 'finalcut') {
        const next = answerMove(state, { subject: 'reject-all', value: 'reject-all' }, n);
        expect(moveAnswered(state, next, 's')!.name).toBe('tonight_shortlist_rejected');
        return;
      }
      state = answerMove(state, routine(move)!, n);
    }
    throw new Error('never reached a Final Cut');
  });

  it('a session that learned nothing says so', () => {
    const state = startTonight(createTonight(), 0);
    const event = sessionEnded(state, 's', 'left', 500);
    expect(event.learnedNothing).toBe(true);
    expect(event.name).toBe('tonight_left');
  });
});

describe('the stream is complete', () => {
  it('a whole session produces a start, a move per act, and an end', () => {
    const events = capture();
    let state = startTonight(createTonight(), 0);
    emitTonight(sessionStarted(state, 's'));
    emitTonight(moveShown(state, 's'));

    for (let n = 1; n <= 40; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') break;
      const answer = routine(move);
      if (!answer) break;
      const next = answerMove(state, answer, n);
      const event = moveAnswered(state, next, 's', n * 100);
      if (event) emitTonight(event);
      state = next;
      if (state.current && state.current.kind !== 'done') emitTonight(moveShown(state, 's'));
    }
    emitTonight(sessionEnded(state, 's', 'completed', 9000));

    expect(events[0]!.name).toBe('tonight_started');
    expect(events[events.length - 1]!.name).toBe('tonight_completed');
    // Every answered move has a shown move before it, so drop-off per act is
    // computable rather than inferred.
    const shown = events.filter((e) => e.name === 'tonight_move_shown').length;
    const answered = events.filter(
      (e) => e.name === 'tonight_move_answered' || e.name === 'tonight_shortlist_rejected',
    ).length;
    expect(shown).toBeGreaterThanOrEqual(answered);
    expect(new Set(events.map((e) => e.sessionId)).size, 'the stream spans sessions').toBe(1);
  });

  it('carries no free text, because there is none to leak', () => {
    const events = capture();
    let state = startTonight(createTonight(), 0);
    emitTonight(moveShown(state, 's'));
    for (let n = 1; n <= 20; n++) {
      const move = state.current;
      if (!move || move.kind === 'done') break;
      const answer = routine(move);
      if (!answer) break;
      const next = answerMove(state, answer, n);
      const event = moveAnswered(state, next, 's');
      if (event) emitTonight(event);
      state = next;
    }

    for (const e of events) {
      // Subjects are catalogue identifiers and answers come from fixed
      // vocabularies. Anything with a space would mean prose got in.
      if (e.subject) expect(e.subject, `subject "${e.subject}" is not an identifier`).not.toMatch(/\s/);
      if (e.answer) expect(e.answer, `answer "${e.answer}" is not an identifier`).not.toMatch(/\s/);
    }
  });
});
