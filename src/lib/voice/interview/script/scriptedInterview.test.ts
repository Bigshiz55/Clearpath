import { describe, it, expect } from 'vitest';
import { advance, createInterview } from '../director';
import { signalsToPreferenceEvents } from '../dnaUpdate';
import type { InterviewState } from '../types';
import {
  answerScripted,
  earnedDrillDowns,
  isScriptComplete,
  meaningfulTurns,
  nextQuestion,
  plannedQuestions,
  progressOf,
  sentimentForScore,
  strengthForScore,
  withProgress,
} from './scriptedInterview';
import { DRILL_THRESHOLD, MIN_MEANINGFUL_TURNS, STAGE1_GENRE_KEYS } from './questionBank';
import { runInterview, typicalAnswerSource, completed, type AnswerSource } from './simulate';

/**
 * THE SHAPE OF THE CONVERSATION IS THE PRODUCT, so these tests assert the shape
 * — not just that some numbers came out. Each `describe` below corresponds to a
 * way the interview would be WRONG even while every unit still "worked":
 * opening vaguely, stopping early, asking for titles before it can interpret
 * them, interrogating genres the user already dismissed, or ignoring what it
 * was just told.
 */

const LOW_ANSWERS: Record<string, string> = {
  's1-a': '2, 3, 1',
  's1-b': '1, 2, 3',
  's1-c': '2, 1, 2',
  's3-a': '3, 2, 1',
  's3-b': '2, 3, 2',
  's3-c': '1, 2, 3',
  's4-love': 'nothing much honestly',
  's4-bail': 'most things',
  's4-love-2': 'I suppose Heat',
};
const lowAnswerSource: AnswerSource = (q) => LOW_ANSWERS[q.id] ?? '2, 2, 2';

const HORROR_ANSWERS: Record<string, string> = {
  's1-a': '1, 2, 3',
  's1-b': '10, 2, 1',
  's1-c': '2, 1, 1',
};
const horrorAnswerSource: AnswerSource = (q) => HORROR_ANSWERS[q.id] ?? '2, 2, 2';

// ── The interview must not open vaguely ────────────────────────────────────

describe('the interview opens with a scored question, not an open prompt', () => {
  it('asks a stage-1 scored genre triple first', () => {
    const first = nextQuestion(createInterview('u', 0));
    expect(first).not.toBeNull();
    expect(first?.stage).toBe(1);
    expect(first?.kind).toBe('scale');
  });

  it('never opens with an open-ended "tell me what you like"', () => {
    const first = nextQuestion(createInterview('u', 0));
    const prompt = (first?.prompt ?? '').toLowerCase();
    // The exact failure this design exists to prevent: a vague opener produces
    // a vague answer, and a vague answer is the worst possible first input.
    for (const banned of [
      'tell me about movies you like',
      'tell me about the movies',
      'what kind of movies',
      'what do you like to watch',
      'tell me what you like',
    ]) {
      expect(prompt).not.toContain(banned);
    }
    expect(prompt).toMatch(/one to ten|1 to 10|gut check/);
  });
});

// ── The interview must not end after one answer ────────────────────────────

describe('the interview does not end early', () => {
  it('is not complete after a single answer', () => {
    let state = createInterview('u', 0);
    const result = answerScripted(state, '9, 4, 10', 1);
    expect(result).not.toBeNull();
    state = withProgress(advance(state, result!.signals, 1000), result!.progress);
    expect(isScriptComplete(state)).toBe(false);
    expect(nextQuestion(state)).not.toBeNull();
  });

  it('reaches at least the meaningful-turn floor for an enthusiastic user', () => {
    const run = runInterview(typicalAnswerSource);
    expect(completed(run)).toBe(true);
    expect(run.meaningfulTurns).toBeGreaterThanOrEqual(MIN_MEANINGFUL_TURNS);
  });

  it('reaches the floor even when the user rates everything low', () => {
    // The pathological case: nothing scores highly, so NO drill-down is earned.
    // The interview must still be substantial — without inventing drill-downs.
    const run = runInterview(lowAnswerSource);
    expect(completed(run)).toBe(true);
    expect(run.drilledGenres).toEqual([]);
    expect(run.meaningfulTurns).toBeGreaterThanOrEqual(MIN_MEANINGFUL_TURNS);
  });
});

// ── Title anchors come last ────────────────────────────────────────────────

describe('title anchors come after genre calibration', () => {
  it('asks every stage-1 genre question before any title anchor', () => {
    const run = runInterview(typicalAnswerSource);
    const lastStage1 = Math.max(...run.askedIds.map((id, i) => (id.startsWith('s1-') ? i : -1)));
    const firstAnchor = run.askedIds.findIndex((id) => id.startsWith('s4-'));
    expect(firstAnchor).toBeGreaterThan(lastStage1);
  });

  it('puts anchors after the watching-style stage too', () => {
    const run = runInterview(typicalAnswerSource);
    const lastStage3 = Math.max(...run.askedIds.map((id, i) => (id.startsWith('s3-') ? i : -1)));
    const firstAnchor = run.askedIds.findIndex((id) => id.startsWith('s4-'));
    expect(firstAnchor).toBeGreaterThan(lastStage3);
  });

  it('never plans an anchor before a stage-1 question', () => {
    const planned = plannedQuestions({ answeredIds: [], genreScores: {}, anchors: [] });
    const firstAnchorIdx = planned.findIndex((q) => q.stage === 4);
    const lastGenreIdx = planned.map((q) => q.stage).lastIndexOf(1);
    expect(firstAnchorIdx).toBeGreaterThan(lastGenreIdx);
  });
});

// ── Drill-downs are earned, never wasted ───────────────────────────────────

describe('drill-downs only follow genres the user actually rated highly', () => {
  it('drills nothing when every genre scored low', () => {
    expect(earnedDrillDowns({ answeredIds: [], genreScores: { crime: 2, horror: 3 }, anchors: [] })).toEqual([]);
  });

  it('every drill-down asked corresponds to a genre at or above the threshold', () => {
    const run = runInterview(typicalAnswerSource);
    expect(run.drilledGenres.length).toBeGreaterThan(0);
    for (const genre of run.drilledGenres) {
      expect(run.progress.genreScores[genre]).toBeGreaterThanOrEqual(DRILL_THRESHOLD);
    }
  });

  it('never drills a genre scored below the threshold', () => {
    const run = runInterview(typicalAnswerSource);
    for (const [genre, score] of Object.entries(run.progress.genreScores)) {
      if (score < DRILL_THRESHOLD) expect(run.drilledGenres).not.toContain(genre);
    }
  });

  it('caps drill-downs so a broad-taste user is not interrogated', () => {
    const all: Record<string, number> = {};
    for (const key of STAGE1_GENRE_KEYS) all[key] = 10;
    expect(earnedDrillDowns({ answeredIds: [], genreScores: all, anchors: [] }).length).toBeLessThanOrEqual(3);
  });
});

// ── Later questions depend on earlier answers ──────────────────────────────

describe('earlier answers change later questions', () => {
  it('a crime-lover and a horror-lover get different drill-downs', () => {
    const crimeRun = runInterview(typicalAnswerSource);
    const horrorRun = runInterview(horrorAnswerSource);
    expect(crimeRun.drilledGenres).toContain('crime');
    expect(horrorRun.drilledGenres).toContain('horror');
    expect(horrorRun.drilledGenres).not.toContain('crime');
    expect(crimeRun.askedIds).not.toEqual(horrorRun.askedIds);
  });

  it('drill-downs are ordered by how strongly the genre scored', () => {
    // typical: sci-fi 10, crime 9, war 8 → that exact order.
    const run = runInterview(typicalAnswerSource);
    expect(run.drilledGenres).toEqual(['scifi', 'crime', 'war']);
  });

  it('the plan is a pure function of the answers so far', () => {
    const a = plannedQuestions({ answeredIds: [], genreScores: { crime: 10 }, anchors: [] }).map((q) => q.id);
    const b = plannedQuestions({ answeredIds: [], genreScores: { crime: 10 }, anchors: [] }).map((q) => q.id);
    expect(a).toEqual(b);
  });
});

// ── One machine for every transport ────────────────────────────────────────

describe('typed and spoken input drive the same machine', () => {
  it('produces identical state for the same answers regardless of source', () => {
    const spoken = runInterview(typicalAnswerSource);
    // A "typed" transport is just another way of producing the same string.
    const typed = runInterview((q, i) => typicalAnswerSource(q, i));
    expect(typed.askedIds).toEqual(spoken.askedIds);
    expect(typed.progress.genreScores).toEqual(spoken.progress.genreScores);
    expect(typed.meaningfulTurns).toBe(spoken.meaningfulTurns);
  });

  it('an unreadable answer re-asks instead of inventing a score', () => {
    const state = createInterview('u', 0);
    const result = answerScripted(state, 'no idea really', 1);
    expect(result?.needsReask).toBe(true);
    expect(result?.signals).toEqual([]);
    // The question is NOT consumed, so the loop asks it again.
    expect(result?.progress.answeredIds).toEqual([]);
  });
});

// ── Resume ─────────────────────────────────────────────────────────────────

describe('resume lands on the exact next turn', () => {
  it('continues at the same question after a JSON round-trip', () => {
    let state = createInterview('u', 0);
    for (let i = 0; i < 4; i++) {
      const q = nextQuestion(state);
      if (!q) break;
      const r = answerScripted(state, typicalAnswerSource(q, i), state.turn + 1)!;
      state = withProgress(advance(state, r.signals, 1000 * (i + 1)), r.progress);
    }
    const before = nextQuestion(state)?.id;

    // Exactly what persistence does: jsonb out and back.
    const rehydrated = JSON.parse(JSON.stringify(state)) as InterviewState;
    expect(nextQuestion(rehydrated)?.id).toBe(before);
    expect(meaningfulTurns(rehydrated)).toBe(4);
    expect(progressOf(rehydrated).genreScores).toEqual(progressOf(state).genreScores);
  });

  it('an interview with no script field still starts at the beginning', () => {
    const legacy = createInterview('u', 0);
    delete (legacy as Partial<InterviewState>).script;
    expect(nextQuestion(legacy)?.stage).toBe(1);
  });
});

// ── It feeds the existing model, not a new one ─────────────────────────────

describe('answers flow into the existing DNA pipeline', () => {
  it('moves overall confidence off zero', () => {
    const run = runInterview(typicalAnswerSource);
    expect(run.state.overallConfidence).toBeGreaterThan(0);
    expect(run.state.signals.length).toBeGreaterThan(0);
  });

  it('named titles become ordinary preference events', () => {
    const run = runInterview(typicalAnswerSource);
    const events = signalsToPreferenceEvents(run.state.signals);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.source).toBe('voice_interview');
  });

  it('maps scores onto the sentiment scale the engine already speaks', () => {
    expect(sentimentForScore(10)).toBe('love');
    expect(sentimentForScore(7)).toBe('like');
    expect(sentimentForScore(5)).toBe('neutral');
    expect(sentimentForScore(3)).toBe('dislike');
    expect(sentimentForScore(1)).toBe('hate');
  });

  it('treats a strong dislike as just as informative as a strong like', () => {
    expect(strengthForScore(1)).toBeCloseTo(strengthForScore(10), 5);
    expect(strengthForScore(5)).toBeLessThan(strengthForScore(10));
  });
});
