/**
 * VOICE DNA INTERVIEW — the pure interview state machine (no I/O, no model call).
 *
 * It owns the deterministic control flow the spec calls for:
 *   • four stages (genre pulse → genre drill → watching style → title anchors);
 *   • adaptive selection — drill only the genres worth the next ~5 seconds;
 *   • smart skipping — never drill a genre the user clearly dislikes;
 *   • a real time budget with a 60s hard ceiling and an anchor deadline.
 *
 * The LLM interprets the spoken answer into scores; THIS module decides what to
 * ask next and when to stop. Keeping it pure means the whole interview policy is
 * unit-testable with zero audio, which is where its correctness has to be proven.
 */

import {
  GENRE_PULSE,
  WATCHING_STYLE,
  TITLE_ANCHORS,
  drillsForGenre,
  type QuestionBlock,
  type AnchorPrompt,
} from './questionBank';

/** Seconds. The spec's budget: median ~40s, anchor by 55s, hard stop at 60s. */
export const HARD_CEILING_S = 60;
export const ANCHOR_DEADLINE_S = 55;
export const FILTER_PRIORITY_S = 45;
export const PULSE_BUDGET_S = 18;

/** A genre scored at/above this is a strong drill-down candidate. */
export const DRILL_STRONG = 8;
/** …and at/above this it justifies a SECOND drill block. */
export const DRILL_VERY_STRONG = 9;
/** A genre at/below this is a clear dislike — never spend time drilling it. */
export const DRILL_SKIP_MAX = 3;

export interface InterviewState {
  elapsedSeconds: number;
  /** Block / anchor ids already asked (so nothing repeats). */
  asked: string[];
  /** signalKey → 1..10 captured so far. */
  signals: Record<string, number>;
}

export type NextStep =
  | { kind: 'block'; block: QuestionBlock }
  | { kind: 'anchor'; anchor: AnchorPrompt }
  | { kind: 'done'; reason: 'time' | 'complete' };

export function createInterview(): InterviewState {
  return { elapsedSeconds: 0, asked: [], signals: {} };
}

const asked = (s: InterviewState, id: string) => s.asked.includes(id);

/** Fold a block's answers into the captured signals (values aligned to items). */
export function recordBlockAnswer(
  state: InterviewState,
  block: QuestionBlock,
  values: (number | null)[],
  spentSeconds: number,
): InterviewState {
  const signals = { ...state.signals };
  block.items.forEach((item, i) => {
    const v = values[i];
    if (v != null) signals[item.signalKey] = v;
  });
  return {
    elapsedSeconds: state.elapsedSeconds + Math.max(0, spentSeconds),
    asked: [...state.asked, block.id],
    signals,
  };
}

/** Mark an anchor prompt as asked and advance the clock. */
export function recordAnchorAsked(state: InterviewState, anchor: AnchorPrompt, spentSeconds: number): InterviewState {
  return { ...state, elapsedSeconds: state.elapsedSeconds + Math.max(0, spentSeconds), asked: [...state.asked, anchor.id] };
}

/** Genre signals captured so far, strongest first. */
function rankedGenres(state: InterviewState): Array<{ key: string; score: number }> {
  return Object.entries(state.signals)
    .filter(([k]) => k.startsWith('genre:'))
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * The next best step. Deterministic and time-aware:
 *  1. finish (or short-circuit to the anchor) when the clock demands it;
 *  2. run the genre pulse first (QUALIFY breadth before depth);
 *  3. drill the strongest un-drilled genre by information gain, skipping dislikes;
 *  4. capture watching-style hard filters;
 *  5. end on the love-titles anchor.
 */
export function selectNextStep(state: InterviewState): NextStep {
  const t = state.elapsedSeconds;

  // Past the ceiling → stop, even mid-plan.
  if (t >= HARD_CEILING_S) return { kind: 'done', reason: 'time' };

  // Near the deadline → the single highest-value remaining act is the love
  // anchor. Ask it if we have not; otherwise we are done.
  if (t >= ANCHOR_DEADLINE_S) {
    const love = TITLE_ANCHORS.find((a) => a.polarity === 'love');
    if (love && !asked(state, love.id)) return { kind: 'anchor', anchor: love };
    return { kind: 'done', reason: 'time' };
  }

  // STAGE 1 — genre pulse. Ask remaining pulse blocks (priority order) until the
  // pulse budget is spent, so we always qualify breadth before drilling depth.
  if (t < PULSE_BUDGET_S) {
    const nextPulse = [...GENRE_PULSE].sort((a, b) => b.priority - a.priority).find((b) => !asked(state, b.id));
    if (nextPulse) return { kind: 'block', block: nextPulse };
  }

  // Below the filter-priority line we still prefer high-value genre drills.
  if (t < FILTER_PRIORITY_S) {
    const drill = pickDrill(state);
    if (drill) return { kind: 'block', block: drill };
  }

  // STAGE 3 — watching-style hard filters (one or two blocks).
  const style = [...WATCHING_STYLE].sort((a, b) => b.priority - a.priority).find((b) => !asked(state, b.id));
  if (style) return { kind: 'block', block: style };

  // A late drill if we somehow have time and an obvious strong genre remains.
  const lateDrill = pickDrill(state);
  if (lateDrill && t < ANCHOR_DEADLINE_S) return { kind: 'block', block: lateDrill };

  // STAGE 4 — anchors. Love first, then the (optional) dislike.
  const love = TITLE_ANCHORS.find((a) => a.polarity === 'love');
  if (love && !asked(state, love.id)) return { kind: 'anchor', anchor: love };
  const dislike = TITLE_ANCHORS.find((a) => a.polarity === 'dislike');
  if (dislike && !asked(state, dislike.id) && t < ANCHOR_DEADLINE_S) return { kind: 'anchor', anchor: dislike };

  return { kind: 'done', reason: 'complete' };
}

/**
 * Choose the highest-information genre drill to run next, or null. A genre is a
 * candidate only when its pulse score is STRONG (never a dislike); a second drill
 * for the same genre requires a VERY STRONG score. Among candidates, the stronger
 * genre and higher-priority block win.
 */
function pickDrill(state: InterviewState): QuestionBlock | null {
  const genres = rankedGenres(state);
  for (const { key, score } of genres) {
    if (score <= DRILL_SKIP_MAX) continue; // clear dislike — do not drill
    if (score < DRILL_STRONG) continue; // not strong enough to earn the time
    const drills = drillsForGenre(key).filter((b) => !asked(state, b.id));
    if (drills.length === 0) continue;
    const alreadyDrilledThisGenre = drillsForGenre(key).some((b) => asked(state, b.id));
    // A second block for the same genre only when the taste is very strong.
    if (alreadyDrilledThisGenre && score < DRILL_VERY_STRONG) continue;
    return drills[0]!;
  }
  return null;
}

/** A rough progress percentage for the "% BUILT" readout (never exceeds 100). */
export function progressPct(state: InterviewState): number {
  const signalCount = Object.keys(state.signals).length;
  // ~24 captured signals is a full profile; blend signal count with the clock.
  const bySignals = Math.min(1, signalCount / 24);
  const byTime = Math.min(1, state.elapsedSeconds / 45);
  return Math.round(Math.max(bySignals, byTime * 0.9) * 100);
}
