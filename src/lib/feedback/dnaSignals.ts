/**
 * Reason code → targeted Taste-DNA axis nudges.
 *
 * The whole point of "we learn WHY": a specific pass reason should move ONLY the
 * attribute it's about, not the whole title. "Too long" / "Don't like the cast"
 * don't exist as one of the 15 taste axes, so they're captured as feedback but
 * apply no axis nudge (they steer runtime / cast preference, tracked separately).
 * The reasons that DO map to an axis nudge it toward a target position, weighted
 * by how strong the reason is and how committed the feedback was.
 *
 * Pure + client-safe (data only). Axis keys must match `DIMENSION_KEYS`.
 */
import { REASONS } from '@/lib/feedback/reasons';
import type { FeedbackType } from '@/lib/actions/passFeedback';

export interface AxisTarget {
  axis: string; // a DIMENSION_KEYS value
  target: number; // 0..100 position to pull the user's preference toward
}

/** Only the reasons that cleanly correspond to a taste axis. Everything else is
 *  intentionally absent — we don't fake an axis signal we can't justify. */
const REASON_AXIS: Record<string, AxisTarget[]> = {
  // pacing (0 slow-burn .. 100 fast)
  too_slow: [{ axis: 'pacing', target: 75 }],
  want_faster: [{ axis: 'pacing', target: 82 }],
  kept_hooked: [{ axis: 'pacing', target: 68 }],
  // darkness / tone (0 feel-good .. 100 dark & heavy)
  too_dark: [{ axis: 'darkness', target: 22 }],
  want_lighter: [{ axis: 'darkness', target: 20 }],
  too_serious: [{ axis: 'darkness', target: 32 }, { axis: 'humor', target: 62 }],
  too_silly: [{ axis: 'humor', target: 28 }],
  // content edge / violence (0 tame .. 100 brutal)
  too_violent: [{ axis: 'violence', target: 15 }],
  // realism (0 fantastical .. 100 grounded)
  supernatural: [{ axis: 'realism', target: 82 }],
  sci_fi: [{ axis: 'realism', target: 78 }],
  not_believable: [{ axis: 'realism', target: 82 }],
  too_unrealistic: [{ axis: 'realism', target: 80 }],
  // complexity (0 easy watch .. 100 cerebral)
  too_confusing: [{ axis: 'complexity', target: 28 }],
  smart_original: [{ axis: 'complexity', target: 70 }],
  // tension / suspense
  too_scary: [{ axis: 'suspense', target: 30 }, { axis: 'darkness', target: 30 }],
  // character focus (positive only — a disliked character read is ambiguous)
  loved_characters: [{ axis: 'character', target: 74 }],
};

/** How much a reason's axis nudge counts, by how committed the feedback was. */
const FEEDBACK_MULT: Record<FeedbackType, number> = {
  didnt_like: 1.6, // watched it and disliked — strongest
  not_for_me: 1.0,
  seen: 1.2, // watched it and rated — the chips refine
  removed_without_reason: 0, // no reasons anyway
  not_right_now: 0, // TEMPORARY — never touches permanent DNA
};

const UNIT = 3; // base evidence weight per nudge (saturates against dimensionMatch's /12)

export interface AxisSignal {
  axis: string;
  target: number;
  weight: number;
}

/**
 * The axis nudges for a set of reason codes under a feedback type. Empty for
 * `not_right_now` (temporary) and for reasons with no axis mapping.
 */
export function axisSignalsFor(codes: string[], feedbackType: FeedbackType): AxisSignal[] {
  const mult = FEEDBACK_MULT[feedbackType];
  if (mult <= 0 || codes.length === 0) return [];
  const out: AxisSignal[] = [];
  for (const code of codes) {
    const targets = REASON_AXIS[code];
    if (!targets) continue;
    const strength = REASONS[code]?.strength ?? 0.5;
    for (const t of targets) {
      out.push({ axis: t.axis, target: t.target, weight: strength * mult * UNIT });
    }
  }
  return out;
}
