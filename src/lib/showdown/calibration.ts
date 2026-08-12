/**
 * THE 1–10 DRILL-DOWN — asked when the comparisons have argued with themselves.
 *
 * ── WHAT WAS MISSING ──────────────────────────────────────────────────────
 * The game already had a follow-up called `intensity`, and it is not this. It
 * asks "How much do you want {title}?" and offers three buttons — a question
 * about ONE FILM, on the way past. What it could never ask is the question a
 * player can actually answer precisely:
 *
 *     "We keep getting mixed signals on horror. How much do you actually
 *      want it?"                                    1 ————————— 10
 *
 * That is a question about an AXIS, and an axis is the thing the recommender
 * reasons in. Twelve pairwise choices can leave one genuinely undecided —
 * horror won twice and lost twice — and no further pair will fix it, because
 * the player is not confused: they like a specific KIND of horror. Asking them
 * outright is the only cheap way through.
 *
 * ── WHY IT IS NOT A SLIDER SCREEN ─────────────────────────────────────────
 * "Do not turn the game into sliders" is the whole design constraint. So this
 * never fires on a counter, and never because a round number of answers went
 * by. It fires on CONTRADICTION, measured: an axis qualifies only when the
 * session has pushed it up AND down with real weight behind both. The amount
 * that cancels out is the score, and the most self-contradictory axis wins.
 *
 * A player who has been perfectly consistent is never interrupted, which is
 * correct — there is nothing to ask them.
 *
 * ── AND THE ANSWER IS WORTH EXACTLY WHAT IT SETTLES ───────────────────────
 * A stated 1–10 is confident, so the temptation is to weight it heavily. That
 * is wrong twice over. `traits.ts` already says it: "a calibration answer must
 * never outrank a title you actually watched." And a player resolving a small
 * wobble has told us less than one resolving a deep split.
 *
 * So the weight IS the contested mass, capped. Answering settles the argument
 * that prompted the question and buys nothing beyond it — which also means this
 * cannot become a back door for rewriting a profile that months of real
 * evidence built (A9).
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { QUICK_TRAITS, type TraitKey } from '@/lib/voice/quickdna/traits';
import type { PermanentTraitEvidence } from './evidence';

/** One thing the session observed about one axis. */
export interface AxisObservation {
  key: TraitKey;
  /** Where this observation pulls the axis, 0–100. 50 is "no opinion". */
  target: number;
  /** How hard it pulls. */
  weight: number;
}

export interface AxisConflict {
  key: TraitKey;
  /** Evidence mass pushing the axis up, and down. */
  up: number;
  down: number;
  /**
   * The mass that CANCELS — how much the session disagreed with itself.
   * `min(up, down)`, so a single strong pull in one direction scores zero
   * however large it is. Only a genuine split counts.
   */
  contested: number;
  /** Observations that took part in the disagreement. */
  splitCount: number;
}

export interface CalibrationQuestion {
  key: TraitKey;
  /** The axis in the player's words, e.g. "Appetite for fear". */
  label: string;
  /** The sentence they read. Names the contradiction, never a counter. */
  prompt: string;
  contested: number;
  splitCount: number;
}

/**
 * A pull this small is noise, not an opinion. Below it an observation cannot
 * take part in a contradiction — otherwise two shrugs in opposite directions
 * would look like a player torn about horror.
 */
const MIN_PULL = 0.15;

/**
 * How much self-contradiction earns an interruption.
 *
 * Deliberately not near zero. Every question this asks is a question the game
 * did not spend on a matchup, and a player interrupted to adjudicate a wobble
 * learns only that the game is fussy.
 */
export const MIN_CONTESTED = 0.9;

/** Ceiling on what one stated answer may be worth. */
export const MAX_CALIBRATION_WEIGHT = 2.5;

const pull = (o: AxisObservation): number => (o.weight * Math.abs(o.target - 50)) / 50;

/** Score every axis the session argued with itself about, worst first. */
export function contestedAxes(observations: readonly AxisObservation[]): AxisConflict[] {
  const byKey = new Map<TraitKey, { up: number; down: number; splitCount: number }>();

  for (const o of observations) {
    const p = pull(o);
    if (p < MIN_PULL) continue; // a shrug is not a position
    const bucket = byKey.get(o.key) ?? { up: 0, down: 0, splitCount: 0 };
    if (o.target > 50) bucket.up += p;
    else if (o.target < 50) bucket.down += p;
    else continue; // exactly 50 states nothing
    bucket.splitCount += 1;
    byKey.set(o.key, bucket);
  }

  const out: AxisConflict[] = [];
  for (const [key, b] of byKey) {
    // BOTH directions must be present. An axis pulled hard one way is
    // well-understood, not contested, and asking about it wastes the question.
    if (b.up <= 0 || b.down <= 0) continue;
    out.push({ key, up: b.up, down: b.down, contested: Math.min(b.up, b.down), splitCount: b.splitCount });
  }
  return out.sort((a, b) => b.contested - a.contested || a.key.localeCompare(b.key));
}

/**
 * The single most worthwhile 1–10 question right now, or null.
 *
 * Null is the common answer and the right default. Most rounds should be the
 * game, not the questionnaire.
 */
export function selectCalibration(
  observations: readonly AxisObservation[],
  opts: { asked?: readonly TraitKey[]; minContested?: number } = {},
): CalibrationQuestion | null {
  const asked = new Set(opts.asked ?? []);
  const floor = opts.minContested ?? MIN_CONTESTED;

  for (const c of contestedAxes(observations)) {
    if (asked.has(c.key)) continue; // never ask the same axis twice in a run
    if (c.contested < floor) break; // sorted, so nothing below this qualifies
    return {
      key: c.key,
      label: QUICK_TRAITS[c.key],
      prompt: promptFor(c.key),
      contested: c.contested,
      splitCount: c.splitCount,
    };
  }
  return null;
}

/**
 * The wording.
 *
 * Every one says WHY it is being asked, because "rate horror 1–10" out of
 * nowhere is a form field, and "we keep getting mixed signals on horror" is the
 * game admitting what it could not work out. The second is worth answering.
 */
function promptFor(key: TraitKey): string {
  const subject = SUBJECT[key] ?? QUICK_TRAITS[key].toLowerCase();
  return `We keep getting mixed signals on ${subject}. How much do you actually want it?`;
}

/**
 * Short, natural subjects for the prompt. Only where the catalogue label reads
 * badly mid-sentence — "mixed signals on appetite for fear" is clumsy where
 * "mixed signals on horror" is not. Anything absent falls back to the label.
 */
const SUBJECT: Partial<Record<TraitKey, string>> = {
  horrorTolerance: 'horror',
  darkness: 'how dark you like it',
  romance: 'romance',
  comedy: 'comedy',
  supernatural: 'the supernatural',
  scifi: 'sci-fi',
  fantasy: 'fantasy',
  action: 'action',
  patience: 'slow burns',
  complexity: 'demanding stories',
  psychological: 'psychological tension',
  crime: 'crime',
  trueCrime: 'true crime',
  documentary: 'documentaries',
  animation: 'animation',
  grounded: 'how grounded you want it',
  subtitles: 'subtitles',
  international: 'non-English titles',
  vintage: 'older films',
  war: 'war stories',
  western: 'westerns',
  musical: 'musicals',
  superhero: 'superheroes',
};

/** 1–10 → a position on the 0–100 axis. 1 is "never", 10 is "as much as possible". */
export function targetForValue(value: number): number {
  const v = Math.min(10, Math.max(1, Math.round(value)));
  return ((v - 1) / 9) * 100;
}

/**
 * What the stated answer is worth.
 *
 * The contested mass, floored so an answer always counts for something and
 * capped so it can never dominate a profile built from real viewing.
 */
export function calibrationWeight(q: Pick<CalibrationQuestion, 'contested'>): number {
  return Math.min(MAX_CALIBRATION_WEIGHT, Math.max(1, q.contested));
}

export function calibrationEvidence(
  q: CalibrationQuestion,
  value: number,
): PermanentTraitEvidence[] {
  return [
    {
      kind: 'permanent',
      key: q.key,
      target: targetForValue(value),
      weight: calibrationWeight(q),
      /* ATTRIBUTION 1 — THE ONLY PLACE IN THE GAME THAT EARNS IT.
         Every comparative answer is confounded: two films differ on several
         axes at once, so a pick has to be split across them and each axis gets
         a fraction. This question names ONE axis and the player answers about
         that axis and nothing else. It is the single cleanest observation the
         game can collect, which is precisely why it is worth interrupting for —
         and why the WEIGHT still has to stay capped, or perfect attribution
         would become a lever for rewriting somebody in one tap. */
      attribution: 1,
    },
  ];
}

/**
 * "Show that the answer actually refined something."
 *
 * A number that vanishes into a profile teaches the player nothing. This states
 * the trade they just made, in their own terms, and names the count of split
 * decisions it reconciled — which is a real quantity, not a flourish.
 */
export function calibrationResolution(q: CalibrationQuestion, value: number): string {
  const v = Math.min(10, Math.max(1, Math.round(value)));
  const settles = `settles ${q.splitCount} split ${q.splitCount === 1 ? 'decision' : 'decisions'}`;
  if (v <= 2) return `Noted — ${q.label.toLowerCase()} is a no. That ${settles}.`;
  if (v <= 4) return `Only in small doses. That ${settles}.`;
  if (v >= 9) return `Locked in — this is a headline for you. That ${settles}.`;
  if (v >= 7) return `Strong yes. That ${settles}.`;
  return `Depends on the film, then. That ${settles}.`;
}
