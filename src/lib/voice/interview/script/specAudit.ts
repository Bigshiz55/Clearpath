/**
 * THE SPEC AUDIT — the interview's failure conditions, as code.
 *
 * A passing test suite proves the parts work. It does not prove the CONVERSATION
 * is right, and an interview can be wrong while every unit is green: it can open
 * vaguely, stop after one answer, ask for titles before it can interpret them,
 * interrogate a genre the user already dismissed, or ignore what it was just
 * told. Those are product failures, so they are named here and checked directly
 * against a completed run rather than left implicit in scattered assertions.
 *
 * `auditInterview` is deliberately usable on ANY transcript — including a
 * deliberately bad synthetic one — so the guards can be shown to bite instead of
 * merely being present. A guard never demonstrated against a violation is a
 * guard nobody has tested.
 *
 * PURE.
 */
import { MIN_MEANINGFUL_TURNS, DRILL_THRESHOLD } from './questionBank';

export type SpecViolation =
  | 'vague-opening'
  | 'ended-after-one-answer'
  | 'anchors-before-genre-calibration'
  | 'unearned-drill-down'
  | 'too-few-meaningful-turns';

/** The minimum an audit needs to know about a run. */
export interface AuditableRun {
  /** Ordered ids of the questions actually asked. */
  askedIds: string[];
  /** The opening prompt, as spoken. */
  openingPrompt: string;
  /** Stage-1 genre key → score. */
  genreScores: Record<string, number>;
  /** Meaningful (question-answering) user turns. */
  meaningfulTurns: number;
}

/** Openers that make the whole design pointless. */
const VAGUE_OPENERS = [
  'tell me about movies you like',
  'tell me about the movies you like',
  'tell me what you like',
  'what kind of movies do you like',
  'what do you like to watch',
  'tell me about yourself',
];

const stageOf = (id: string): number =>
  id.startsWith('s1-') ? 1 : id.startsWith('s2-') ? 2 : id.startsWith('s3-') ? 3 : id.startsWith('s4-') ? 4 : 0;

/** Every way this run violates the interview specification. Empty is good. */
export function auditInterview(run: AuditableRun): SpecViolation[] {
  const violations: SpecViolation[] = [];
  const opening = (run.openingPrompt ?? '').toLowerCase();

  // 1. An open-ended opener, or an opener that is not a scored question.
  if (VAGUE_OPENERS.some((v) => opening.includes(v)) || !/one to ten|1 to 10|gut check/.test(opening)) {
    violations.push('vague-opening');
  }

  // 2. Stopping after a single answer.
  if (run.askedIds.length <= 1) violations.push('ended-after-one-answer');

  // 3. A title anchor before genre calibration finished.
  const firstAnchor = run.askedIds.findIndex((id) => stageOf(id) === 4);
  const lastGenre = run.askedIds.map(stageOf).lastIndexOf(1);
  if (firstAnchor !== -1 && firstAnchor < lastGenre) {
    violations.push('anchors-before-genre-calibration');
  }

  // 4. A drill-down into a genre the user did not rate highly.
  for (const id of run.askedIds) {
    if (stageOf(id) !== 2) continue;
    const genre = id.replace('s2-', '');
    const score = run.genreScores[genre];
    if (score === undefined || score < DRILL_THRESHOLD) violations.push('unearned-drill-down');
  }

  // 5. Too short to be meaningful.
  if (run.meaningfulTurns < MIN_MEANINGFUL_TURNS) violations.push('too-few-meaningful-turns');

  return [...new Set(violations)];
}

/**
 * Adaptivity cannot be judged from one transcript — a fixed questionnaire and a
 * responsive interview look identical in isolation. It shows only in the
 * DIFFERENCE between two users, so this compares two runs and reports whether
 * the earlier answers changed anything at all downstream.
 */
export function isAdaptive(runA: AuditableRun, runB: AuditableRun): boolean {
  const differentScores = JSON.stringify(runA.genreScores) !== JSON.stringify(runB.genreScores);
  if (!differentScores) return true; // nothing to adapt to; not evidence either way
  return JSON.stringify(runA.askedIds) !== JSON.stringify(runB.askedIds);
}
