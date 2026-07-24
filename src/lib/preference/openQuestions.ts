/**
 * OPEN QUESTIONS — the uncertain corners of a user's taste, each phrased as a
 * Case Round purpose / mission. A question is "open" until we're confident about
 * the traits it targets. Ranking by uncertainty drives which round to offer next.
 * Pure.
 */
import type { DnaState } from './types';
import { effectiveTaste } from './explain';
import { resolveConfidence } from './confidence';

export interface QuestionSpec {
  id: string;
  /** Case Round title, e.g. "Grounded or Supernatural?". */
  title: string;
  /** Mission copy, e.g. "Help us understand your tolerance for supernatural stories." */
  mission: string;
  /** Target dimension axes (keys). */
  axes?: string[];
  /** Target genre slugs. */
  genres?: string[];
}

/** The catalog of investigable questions. Each maps to concrete traits. */
export const QUESTION_CATALOG: QuestionSpec[] = [
  { id: 'grounded_supernatural', title: 'Grounded or Supernatural?', mission: 'Help us understand your tolerance for supernatural stories.', axes: ['realism'], genres: ['supernatural'] },
  { id: 'pace', title: 'Slow Burn or Fast Pace?', mission: 'Help us learn how much patience you have for a slow build.', axes: ['pacing'] },
  { id: 'comedy_zone', title: 'Comedy Comfort Zone', mission: 'Help us find where your sense of humor lands.', axes: ['humor'] },
  { id: 'animation', title: 'Animation on Trial', mission: 'Do you dislike animation — or just certain styles?', genres: ['animation'] },
  { id: 'classics_new', title: 'Classics vs. New Releases', mission: 'Tell us whether older movies still work for you.', axes: [] },
  { id: 'darkness', title: 'How Dark Is Too Dark?', mission: 'Help us calibrate how heavy you like your stories.', axes: ['darkness'] },
  { id: 'action_noise', title: 'Action Without the Noise', mission: 'Help us separate the action you love from the action you avoid.', axes: ['violence', 'complexity'], genres: ['action'] },
  { id: 'foreign', title: 'Foreign-Language Test', mission: 'Are subtitles a barrier, or no problem at all?', genres: ['foreign'] },
  { id: 'mystery', title: 'Mystery Preferences', mission: 'Help us learn what kind of mystery hooks you.', axes: ['suspense'], genres: ['mystery'] },
  { id: 'romance', title: 'Romance Tolerance', mission: 'How central can a love story be before it is too much?', axes: ['romance'] },
  { id: 'complexity', title: 'Plot Complexity', mission: 'Do you want a cerebral puzzle or an easy watch?', axes: ['complexity'] },
  { id: 'reality_fantasy', title: 'Reality vs. Fantasy', mission: 'Where do you sit between grounded and fantastical?', axes: ['realism'], genres: ['fantasy'] },
];

/** Confidence at/above which a target trait counts as "resolved". */
export const RESOLVE_CONF = 0.5;

function genreConfidence(state: DnaState, slug: string): number {
  const e = state.experience.genres[slug];
  const a = state.attraction.genres[slug];
  const ce = e ? resolveConfidence(e).confidence : 0;
  const ca = a ? resolveConfidence(a).confidence : 0;
  return Math.max(ce, ca);
}

/** Aggregate 0..1 confidence across a question's target traits (min = weakest link). */
export function questionConfidence(spec: QuestionSpec, state: DnaState): number {
  const taste = effectiveTaste(state);
  const parts: number[] = [];
  for (const ax of spec.axes ?? []) parts.push(taste[ax]?.confidence ?? 0);
  for (const g of spec.genres ?? []) parts.push(genreConfidence(state, g));
  if (parts.length === 0) return 0; // e.g. "Classics vs New" has no trait proxy yet
  return Math.min(...parts);
}

export interface OpenQuestion {
  spec: QuestionSpec;
  confidence: number;
  uncertainty: number; // 1 - confidence
  resolved: boolean;
}

/** All questions with their state, unresolved first, most-uncertain first. */
export function openQuestions(state: DnaState, opts: { limit?: number } = {}): OpenQuestion[] {
  const rows = QUESTION_CATALOG.map((spec) => {
    const confidence = questionConfidence(spec, state);
    return { spec, confidence, uncertainty: 1 - confidence, resolved: confidence >= RESOLVE_CONF };
  });
  rows.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return b.uncertainty - a.uncertainty;
  });
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

/** The single most valuable next mission (top unresolved question), if any. */
export function nextMission(state: DnaState): OpenQuestion | null {
  const open = openQuestions(state).filter((q) => !q.resolved);
  return open[0] ?? null;
}
