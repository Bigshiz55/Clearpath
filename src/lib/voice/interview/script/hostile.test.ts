import { describe, it, expect } from 'vitest';
import { advance, createInterview } from '../director';
import { signalsToPreferenceEvents } from '../dnaUpdate';
import type { InterviewState } from '../types';
import {
  answerScripted,
  isDecline,
  isScriptComplete,
  meaningfulTurns,
  nextQuestion,
  withProgress,
  MAX_ATTEMPTS_PER_QUESTION,
} from './scriptedInterview';
import { MIN_MEANINGFUL_TURNS } from './questionBank';

/**
 * THE HOSTILE USER.
 *
 * The happy path was already green when both of these shipped:
 *
 *  1. Answering a title anchor with "I don't know" recorded a FILM CALLED
 *     "I don't know" as something the user loved, and wrote it into their real
 *     `preference_events`. The most ordinary sentence a person can say
 *     permanently corrupted their Watch DNA.
 *  2. Answering anything unparseable twice re-asked the SAME question forever.
 *     The interview dead-ended on question one with no way out.
 *
 * Neither is exotic. Both are what a real person does in the first thirty
 * seconds. So this file drives the engine the way a person actually behaves —
 * shrugging, rambling, going silent, changing their mind — and asserts the
 * invariants that must hold no matter what comes out of their mouth.
 *
 * Deterministic: the "randomised" runs use a seeded generator, so a failure is
 * reproducible rather than a flake nobody can chase.
 */

/** Tiny seeded PRNG — reproducible sessions, no `Math.random`. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

/** Everything a real person says, including the things that broke it. */
const UTTERANCES = [
  '10, 7, 3',
  'ten ten seven',
  'love it, six, absolutely not',
  '8',                                   // short — incomplete
  "I don't know",                        // decline
  'not sure really',                     // decline
  'umm',                                 // noise
  '   ',                                 // silence
  'well I suppose I quite like the first one, maybe a seven, and honestly the second one leaves me cold so two, and the last one, gosh, call it a nine',
  'seven — no wait, make that a nine, and then three and four',
  'Prisoners',
  'Breaking Bad',
  'hmm',
  'skip',
  '5, 5, 5',
  'crime ten, drama seven, comedy three',
];

/** Run one full interview against a seeded stream of real-world answers. */
function runHostile(seed: number): {
  state: InterviewState;
  asked: string[];
  turns: number;
  completed: boolean;
} {
  const rand = rng(seed);
  let state = createInterview(`hostile-${seed}`, 0);
  const asked: string[] = [];

  // Hard ceiling far above any legitimate interview: if we hit it, the engine
  // failed to terminate and the test says so rather than hanging.
  for (let i = 0; i < 200; i++) {
    const q = nextQuestion(state);
    if (!q) break;
    asked.push(q.id);
    const said = UTTERANCES[Math.floor(rand() * UTTERANCES.length)] ?? '5, 5, 5';
    const result = answerScripted(state, said, state.turn + 1);
    if (!result) break;
    state = advance(state, result.signals, 1000 * (i + 1));
    if (!result.needsReask) state = withProgress(state, result.progress);
    else state = withProgress(state, result.progress); // keep the reask counter
  }

  return {
    state,
    asked,
    turns: meaningfulTurns(state),
    completed: isScriptComplete(state),
  };
}

describe('a shrug is never data', () => {
  it('recognises the ordinary ways of saying "no answer"', () => {
    for (const s of [
      "I don't know", 'I dont know', 'not sure', 'not really', 'no idea', 'dunno',
      'unsure', "can't think", 'nothing', 'skip', 'pass', 'none', 'n/a', 'hmm',
      'umm', 'er', '', '   ', 'umm not sure really', 'I guess I don’t know'.replace('’', "'"),
    ]) {
      expect(isDecline(s), `"${s}" should read as a decline`).toBe(true);
    }
  });

  it('does not mistake a real answer for a decline', () => {
    for (const s of ['Prisoners', 'Breaking Bad', '10, 7, 3', 'Knives Out', 'No Country for Old Men']) {
      expect(isDecline(s), `"${s}" is a real answer`).toBe(false);
    }
  });

  it('a declined title anchor records NOTHING — no phantom film', () => {
    let state = createInterview('u', 0);
    // Advance to the first anchor.
    for (let i = 0; i < 30; i++) {
      const q = nextQuestion(state);
      if (!q || q.kind === 'anchor') break;
      const r = answerScripted(state, '8, 8, 8', state.turn + 1)!;
      state = withProgress(advance(state, r.signals, 1000 * i), r.progress);
    }
    const anchor = nextQuestion(state);
    expect(anchor?.kind).toBe('anchor');

    const r = answerScripted(state, "I don't know", state.turn + 1)!;
    expect(r.signals).toEqual([]);
    expect(r.progress.anchors).toEqual([]);

    // And nothing reaches the preference log.
    const after = advance(state, r.signals, 99_000);
    const events = signalsToPreferenceEvents(after.signals);
    for (const e of events) {
      expect(e.titleId).not.toMatch(/know|sure|idea|dunno/i);
    }
  });
});

describe('the interview can never dead-end', () => {
  it('moves on after repeated unreadable answers instead of looping forever', () => {
    let state = createInterview('u', 0);
    const first = nextQuestion(state)!.id;

    for (let i = 0; i < MAX_ATTEMPTS_PER_QUESTION; i++) {
      const r = answerScripted(state, 'uhhh I dunno', state.turn + 1)!;
      state = withProgress(advance(state, r.signals, 1000 * i), r.progress);
    }

    expect(nextQuestion(state)?.id, 'still stuck on the first question').not.toBe(first);
    expect(meaningfulTurns(state)).toBe(1);
  });

  it('records nothing for a question it gave up on', () => {
    let state = createInterview('u', 0);
    for (let i = 0; i < MAX_ATTEMPTS_PER_QUESTION; i++) {
      const r = answerScripted(state, 'no idea', state.turn + 1)!;
      state = withProgress(advance(state, r.signals, 1000 * i), r.progress);
    }
    // Consumed, but with no invented scores.
    expect(Object.keys((state.script?.genreScores) ?? {})).toEqual([]);
    expect(state.signals).toEqual([]);
  });

  it('a user who says "I dunno" to EVERYTHING still reaches a clean end', () => {
    let state = createInterview('u', 0);
    for (let i = 0; i < 200; i++) {
      const q = nextQuestion(state);
      if (!q) break;
      const r = answerScripted(state, "I don't know", state.turn + 1)!;
      state = withProgress(advance(state, r.signals, 1000 * i), r.progress);
    }
    expect(isScriptComplete(state), 'the interview never finished').toBe(true);
    expect(state.signals).toEqual([]); // nothing invented on their behalf
  });
});

describe('randomised sessions hold every invariant', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

  it('every session terminates', () => {
    for (const seed of SEEDS) {
      const run = runHostile(seed);
      expect(run.completed, `seed ${seed} never completed`).toBe(true);
    }
  });

  it('no question is ever asked twice in a row after being answered', () => {
    for (const seed of SEEDS) {
      const run = runHostile(seed);
      const answered = run.state.script?.answeredIds ?? [];
      expect(new Set(answered).size, `seed ${seed} answered a question twice`).toBe(answered.length);
    }
  });

  it('exactly one question is on the table at any moment', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      let state = createInterview(`one-${seed}`, 0);
      const rand = rng(seed);
      for (let i = 0; i < 60; i++) {
        const a = nextQuestion(state);
        const b = nextQuestion(state);
        expect(a?.id).toBe(b?.id); // pure, stable, single-valued
        if (!a) break;
        const said = UTTERANCES[Math.floor(rand() * UTTERANCES.length)] ?? '5, 5, 5';
        const r = answerScripted(state, said, state.turn + 1)!;
        state = withProgress(advance(state, r.signals, 1000 * i), r.progress);
      }
    }
  });

  it('anchors always come last, whatever the user says', () => {
    for (const seed of SEEDS) {
      const answered = runHostile(seed).state.script?.answeredIds ?? [];
      const firstAnchor = answered.findIndex((id) => id.startsWith('s4-'));
      if (firstAnchor === -1) continue;
      const lastNonAnchor = answered.reduce((acc, id, i) => (id.startsWith('s4-') ? acc : i), -1);
      expect(firstAnchor, `seed ${seed} asked a title before finishing the scored stages`).toBeGreaterThan(lastNonAnchor);
    }
  });

  it('reaches the meaningful-turn floor whenever the user actually answers', () => {
    for (const seed of SEEDS) {
      const run = runHostile(seed);
      expect(run.turns, `seed ${seed} was too short`).toBeGreaterThanOrEqual(MIN_MEANINGFUL_TURNS);
    }
  });

  it('never invents a score that was not spoken', () => {
    for (const seed of SEEDS) {
      const scores = runHostile(seed).state.script?.genreScores ?? {};
      for (const [genre, score] of Object.entries(scores)) {
        expect(Number.isInteger(score), `${genre} = ${score}`).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    }
  });

  it('one utterance is scored exactly once', () => {
    // Feeding the SAME answer object through the reducer twice must not double
    // the signals — signal ids are derived from the turn, so a replayed turn
    // collapses instead of accumulating.
    let state = createInterview('dup', 0);
    const r = answerScripted(state, '9, 8, 7', 1)!;
    const once = advance(state, r.signals, 1000);
    const twice = advance(once, r.signals, 2000);
    expect(twice.signals.length).toBe(once.signals.length);
  });
});

describe('silence and noise', () => {
  it('empty or whitespace-only input never consumes a question on the first try', () => {
    const state = createInterview('u', 0);
    for (const noise of ['', '   ', '\n', 'umm', 'hmm']) {
      const r = answerScripted(state, noise, 1)!;
      expect(r.signals, `"${noise}" produced signals`).toEqual([]);
      expect(r.needsReask, `"${noise}" consumed the question`).toBe(true);
    }
  });

  it('a rambling answer still yields exactly one score per item', () => {
    const state = createInterview('u', 0);
    const rambly =
      'well I suppose I quite like the first one, maybe a seven, and honestly ' +
      'the second one leaves me cold so two, and the last one, gosh, call it a nine';
    const r = answerScripted(state, rambly, 1)!;
    expect(r.signals).toHaveLength(3);
    expect(Object.values(r.scores)).toEqual([7, 2, 9]);
  });
});

describe('the re-ask counter must survive the round trip', () => {
  it('is carried in progress, so a caller that persists progress cannot loop', () => {
    // The counter lives in ScriptProgress precisely so the SERVER persists it
    // with everything else. Both callers previously skipped `withProgress` on a
    // re-ask — "nothing was answered, so nothing to save" — which threw the
    // counter away and made every unparseable answer an infinite loop.
    const state = createInterview('u', 0);
    const first = answerScripted(state, 'mumble mumble', 1)!;
    expect(first.needsReask).toBe(true);
    expect(first.progress.reasks?.[first.question.id]).toBe(1);

    // Persisting that progress is what lets the SECOND attempt give up.
    const carried = withProgress(state, first.progress);
    const second = answerScripted(carried, 'still mumbling', 2)!;
    expect(second.needsReask).toBe(false);
    expect(second.declined).toBe(true);
    expect(second.progress.answeredIds).toContain(second.question.id);
  });

  it('a caller that DROPS progress on re-ask would loop — proving the counter matters', () => {
    const state = createInterview('u', 0);
    let s = state;
    for (let i = 0; i < 5; i++) {
      const r = answerScripted(s, 'mumble', i + 1)!;
      if (!r.needsReask) break;
      // Deliberately NOT persisting — the old buggy behaviour.
      s = advance(s, r.signals, 1000 * i);
    }
    // Still stuck on question one: this is what the fix prevents.
    expect(nextQuestion(s)?.id).toBe(nextQuestion(state)?.id);
  });
});
