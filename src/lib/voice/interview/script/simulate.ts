/**
 * THE MOCK TRANSPORT — a whole interview, start to finish, with no network.
 *
 * This is the deterministic stand-in for speech: an `AnswerSource` is handed
 * each question and returns the string a person would have said. The scripted
 * state machine cannot tell the difference between that and a real
 * transcription, which is exactly what makes the conversation testable —
 * every adaptive decision the live interview would make is reproduced here,
 * offline, with no key and no socket.
 *
 * `runInterview` also returns the full transcript and a decision log, so a test
 * can assert on the SHAPE of the conversation (what was asked, what was
 * skipped, and why) rather than only on its final numbers.
 *
 * PURE. Time is a counter, not a clock.
 */
import type { InterviewState, TasteSignal } from '../types';
import { advance, createInterview } from '../director';
import {
  acknowledgement,
  answerScripted,
  isScriptComplete,
  meaningfulTurns,
  nextQuestion,
  withProgress,
  type ScriptProgress,
} from './scriptedInterview';
import type { ScriptQuestion } from './questionBank';

/** Produces the user's utterance for a given question. */
export type AnswerSource = (question: ScriptQuestion, index: number) => string;

export interface SimTurn {
  index: number;
  questionId: string;
  stage: number;
  prompt: string;
  said: string;
  ack: string;
  scores: Record<string, number>;
  signals: TasteSignal[];
  reasked: boolean;
}

export interface SimResult {
  state: InterviewState;
  turns: SimTurn[];
  /** Human-readable transcript, alternating interviewer / user. */
  transcript: string[];
  /** Ordered question ids actually asked. */
  askedIds: string[];
  /** Drill-downs that were offered, and the ones deliberately skipped. */
  drilledGenres: string[];
  skippedGenres: string[];
  meaningfulTurns: number;
  progress: ScriptProgress;
}

const START_MS = 1_700_000_000_000;

/**
 * Run an entire interview against a mocked answer source.
 *
 * `maxTurns` is a runaway guard only; a well-formed script terminates on its
 * own because every answered question is removed from the plan.
 */
export function runInterview(answerFor: AnswerSource, userId = 'sim-user', maxTurns = 40): SimResult {
  let state = createInterview(userId, START_MS);
  const turns: SimTurn[] = [];
  const transcript: string[] = [];
  const askedIds: string[] = [];

  for (let i = 0; i < maxTurns; i++) {
    const question = nextQuestion(state);
    if (!question) break;

    const said = answerFor(question, i);
    const nowMs = START_MS + (i + 1) * 4_000;
    const result = answerScripted(state, said, state.turn + 1);
    if (!result) break;

    transcript.push(`interviewer: ${question.prompt}`);
    transcript.push(`user: ${said}`);
    askedIds.push(question.id);

    // Signals flow through the EXISTING reducer — same confidence model, same
    // claim memory, same contradiction detection as the free-form interview.
    state = advance(state, result.signals, nowMs);
    if (!result.needsReask) state = withProgress(state, result.progress);

    const ack = acknowledgement(result);
    if (ack) transcript.push(`interviewer: ${ack}`);

    turns.push({
      index: i,
      questionId: question.id,
      stage: question.stage,
      prompt: question.prompt,
      said,
      ack,
      scores: result.scores,
      signals: result.signals,
      reasked: result.needsReask,
    });
  }

  const progress = (state as InterviewState & { script?: ScriptProgress }).script ?? {
    answeredIds: [],
    genreScores: {},
    anchors: [],
  };

  const drilledGenres = askedIds
    .filter((id) => id.startsWith('s2-'))
    .map((id) => id.replace('s2-', ''));
  const skippedGenres = Object.keys(progress.genreScores).filter((g) => !drilledGenres.includes(g));

  return {
    state,
    turns,
    transcript,
    askedIds,
    drilledGenres,
    skippedGenres,
    meaningfulTurns: meaningfulTurns(state),
    progress,
  };
}

/** True when the interview reached its natural end. */
export function completed(result: SimResult): boolean {
  return isScriptComplete(result.state);
}

/**
 * A realistic answer source: strong on crime and sci-fi, cold on horror and
 * romance, with mixed watching-style preferences and two named titles. Shared
 * by the tests and the captured example transcript so both describe the same
 * person.
 */
export const TYPICAL_ANSWERS: Record<string, string> = {
  's1-a': '9, 4, 10',
  's1-b': 'two, six, seven',
  's1-c': 'three, eight, five',
  's2-crime': 'serial killers ten, heists six, courtroom four',
  's2-scifi': '8, 9, 10',
  's2-war': 'nine, five, seven',
  's3-a': 'love it, 9, 2',
  's3-b': '10, 7, 3',
  's3-c': '6, 9, 4',
  's4-love': 'Prisoners',
  's4-bail': 'Emily in Paris',
  's4-love-2': 'Breaking Bad',
};

/** Answer source backed by `TYPICAL_ANSWERS`, with a safe default. */
export const typicalAnswerSource: AnswerSource = (q) => TYPICAL_ANSWERS[q.id] ?? '5, 5, 5';
