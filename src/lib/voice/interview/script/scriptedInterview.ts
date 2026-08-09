/**
 * THE RAPID-FIRE STATE MACHINE — ASK → LISTEN → PARSE → SAVE → NEXT.
 *
 * One pure reducer drives the whole interview, so the SAME machine runs whether
 * the answer arrived as speech, as a typed line in the accessibility fallback,
 * or as a scripted string in a test. That is the point: a mocked transport and
 * a live one differ only in how the string is produced, never in what happens
 * to it. Every adaptive decision is therefore reproducible offline.
 *
 *   nextQuestion(state)            → what to ask now, or null when finished
 *   answerScripted(state, text, t) → parse, convert to signals, save, advance
 *
 * ADAPTIVITY IS DERIVED, NOT STORED AS PROSE. Stage 2 is computed from the
 * stage-1 scores each time it is needed, so a resumed interview reaches exactly
 * the same next question as one that never stopped — there is no second source
 * of truth to drift.
 *
 * Answers become `TasteSignal`s and nothing else. They flow into the existing
 * confidence model, claim memory, contradiction detection and
 * `preference_events` bridge. There is no parallel taste model here.
 *
 * PURE. `nowMs` is the only time source and is passed in.
 */
import type { InterviewState, TasteSignal, Sentiment, TasteCategory } from '../types';
import {
  DRILL_THRESHOLD,
  MAX_DRILL_DOWNS,
  MIN_MEANINGFUL_TURNS,
  STAGE1_QUESTIONS,
  STAGE3_QUESTIONS,
  STAGE4_QUESTIONS,
  drillDownFor,
  type ScaleItem,
  type ScaleQuestion,
  type ScriptQuestion,
  type Stage,
} from './questionBank';
import { SCALE_MAX, parseGroupedAnswer } from './numberParse';

/**
 * Progress through the script. Stored on `InterviewState.script` and kept
 * deliberately small: the asked ids and the genre scores are enough to
 * reconstruct every later decision.
 */
export interface ScriptProgress {
  /** Question ids already answered, in order. */
  answeredIds: string[];
  /** Stage-1 genre key → 1–10 score. Drives the whole of stage 2. */
  genreScores: Record<string, number>;
  /** Named titles captured in stage 4, with polarity. */
  anchors: { title: string; polarity: 'positive' | 'negative' }[];
}

export const EMPTY_PROGRESS: ScriptProgress = { answeredIds: [], genreScores: {}, anchors: [] };

/** The script state on an interview, tolerating a row saved before it existed. */
export function progressOf(state: InterviewState): ScriptProgress {
  const p = (state as InterviewState & { script?: ScriptProgress }).script;
  if (!p || typeof p !== 'object') return EMPTY_PROGRESS;
  return {
    answeredIds: Array.isArray(p.answeredIds) ? p.answeredIds : [],
    genreScores: p.genreScores && typeof p.genreScores === 'object' ? p.genreScores : {},
    anchors: Array.isArray(p.anchors) ? p.anchors : [],
  };
}

/**
 * The drill-downs this user has earned, highest-scoring genre first. Computed
 * from the stage-1 scores every time, so it cannot drift from the answers.
 * A genre below `DRILL_THRESHOLD` is never drilled — asking someone to
 * sub-classify a genre they scored 2 spends a turn to learn nothing.
 */
export function earnedDrillDowns(progress: ScriptProgress): ScaleQuestion[] {
  return Object.entries(progress.genreScores)
    .filter(([, score]) => score >= DRILL_THRESHOLD)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_DRILL_DOWNS)
    .map(([key]) => drillDownFor(key))
    .filter((q): q is ScaleQuestion => q !== null);
}

/**
 * The full ordered plan for this user: stage 1, then the earned drill-downs,
 * then stage 3, then the anchors. The third anchor is included only when the
 * plan would otherwise fall short of the meaningful-turn floor — a broad-taste
 * user earns drill-downs and does not need it; a user who liked nothing gets
 * one more anchor instead of a drill-down they did not earn.
 */
export function plannedQuestions(progress: ScriptProgress): ScriptQuestion[] {
  const drills = earnedDrillDowns(progress);
  const base: ScriptQuestion[] = [
    ...STAGE1_QUESTIONS,
    ...drills,
    ...STAGE3_QUESTIONS,
    ...STAGE4_QUESTIONS.slice(0, 2),
  ];
  if (base.length >= MIN_MEANINGFUL_TURNS) return base;
  return [...base, ...STAGE4_QUESTIONS.slice(2)];
}

/** What to ask next, or `null` when the interview is finished. */
export function nextQuestion(state: InterviewState): ScriptQuestion | null {
  const progress = progressOf(state);
  const answered = new Set(progress.answeredIds);
  return plannedQuestions(progress).find((q) => !answered.has(q.id)) ?? null;
}

/** Which stage the interview is in right now (4 once every question is done). */
export function currentStage(state: InterviewState): Stage {
  return nextQuestion(state)?.stage ?? 4;
}

/** True once every planned question has been answered. */
export function isScriptComplete(state: InterviewState): boolean {
  return nextQuestion(state) === null;
}

/** Turns actually spent answering questions — the "meaningful turns" count. */
export function meaningfulTurns(state: InterviewState): number {
  return progressOf(state).answeredIds.length;
}

// ── Answers → signals ──────────────────────────────────────────────────────

/** A 1–10 score becomes the sentiment the rest of the engine already speaks. */
export function sentimentForScore(score: number): Sentiment {
  if (score >= 9) return 'love';
  if (score >= 7) return 'like';
  if (score >= 5) return 'neutral';
  if (score >= 3) return 'dislike';
  return 'hate';
}

/** Conviction rises toward both ends: a 1 is as informative as a 10. */
export function strengthForScore(score: number): number {
  const mid = (SCALE_MAX + 1) / 2;
  return Math.min(1, Math.abs(score - mid) / (mid - 1));
}

function signalForItem(item: ScaleItem, score: number, turn: number, index: number, raw: string): TasteSignal {
  return {
    id: `script:${turn}:${index}`,
    turn,
    kind: 'genre',
    subject: item.label,
    sentiment: sentimentForScore(score),
    strength: strengthForScore(score),
    categories: item.categories as TasteCategory[],
    raw,
  };
}

/** Everything an answer to one question tells us, as signals. */
export function signalsForAnswer(question: ScriptQuestion, text: string, turn: number): TasteSignal[] {
  if (question.kind === 'anchor') {
    const title = text.trim();
    if (!title) return [];
    const positive = question.polarity === 'positive';
    return [
      {
        id: `script:${turn}:0`,
        turn,
        kind: 'title',
        subject: title,
        sentiment: positive ? 'love' : 'dislike',
        strength: positive ? 0.95 : 0.6,
        categories: [],
        raw: title,
      },
    ];
  }

  const parsed = parseGroupedAnswer(text, question.items.map((i) => i.aliases));
  const out: TasteSignal[] = [];
  question.items.forEach((item, i) => {
    const score = parsed.values[i];
    if (score === undefined || Number.isNaN(score)) return; // never invent a score
    out.push(signalForItem(item, score, turn, i, text.trim()));
  });
  return out;
}

// ── The reducer ────────────────────────────────────────────────────────────

export interface ScriptedTurn {
  /** The question that was just answered. */
  question: ScriptQuestion;
  /** Signals derived from the answer (empty when nothing parsed). */
  signals: TasteSignal[];
  /** Per-item scores, for a scale question. */
  scores: Record<string, number>;
  /** True when the answer was unreadable and the question should be re-asked. */
  needsReask: boolean;
  /** The next script progress. */
  progress: ScriptProgress;
}

/**
 * Fold one user utterance into the script. Returns the signals for the caller
 * to hand to the existing `advance()` reducer, plus the new script progress.
 *
 * An unparseable answer does NOT consume the question: `needsReask` is true and
 * the id is not marked answered, so the loop asks again rather than recording a
 * number the user never said.
 */
export function answerScripted(state: InterviewState, text: string, turn: number): ScriptedTurn | null {
  const question = nextQuestion(state);
  if (!question) return null;

  const progress = progressOf(state);
  const signals = signalsForAnswer(question, text, turn);

  if (signals.length === 0) {
    return { question, signals: [], scores: {}, needsReask: true, progress };
  }

  const scores: Record<string, number> = {};
  const genreScores = { ...progress.genreScores };
  const anchors = [...progress.anchors];

  if (question.kind === 'scale') {
    const parsed = parseGroupedAnswer(text, question.items.map((i) => i.aliases));
    question.items.forEach((item, i) => {
      const score = parsed.values[i];
      if (score === undefined || Number.isNaN(score)) return;
      scores[item.key] = score;
      // Only stage 1 feeds the drill-down gate.
      if (question.stage === 1) genreScores[item.key] = score;
    });
  } else {
    anchors.push({ title: text.trim(), polarity: question.polarity });
  }

  return {
    question,
    signals,
    scores,
    needsReask: false,
    progress: {
      answeredIds: [...progress.answeredIds, question.id],
      genreScores,
      anchors,
    },
  };
}

/** Attach new script progress to a state (immutably). */
export function withProgress(state: InterviewState, progress: ScriptProgress): InterviewState {
  return { ...state, script: progress } as InterviewState;
}

// ── Acknowledgements ───────────────────────────────────────────────────────

/**
 * A very short spoken acknowledgement. Rapid-fire means the interviewer gets
 * roughly four words before it starts costing the user time, so these are
 * chosen deterministically from the answer itself rather than generated.
 */
export function acknowledgement(turnResult: ScriptedTurn): string {
  if (turnResult.needsReask) return 'Sorry — one to ten?';
  if (turnResult.question.kind === 'anchor') {
    return turnResult.question.polarity === 'positive' ? 'Good one.' : 'Noted.';
  }
  const values = Object.values(turnResult.scores);
  if (values.length === 0) return 'Got it.';
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max >= 9 && min <= 3) return 'Strong opinions — good.';
  if (max >= 9) return 'Love that.';
  if (max <= 3) return 'Fair enough.';
  return 'Got it.';
}
