/**
 * THE REWATCH QUIZ.
 *
 * Same shape as the Quick Taste Quiz — a versioned bank of statements, four
 * responses, sections — because the format works and a second interaction
 * grammar for the same gesture would just be a thing to learn twice. It
 * deliberately imports the taste quiz's RESPONSE_VALUES rather than restating
 * them, so "Mostly" can never come to mean two different numbers.
 *
 * It asks a different question, though. The taste quiz learns WHAT you like.
 * This learns HOW you rewatch, on two axes that genuinely split people:
 *
 *   COMFORT ←→ REDISCOVERY. Some people rewatch the same six films forever and
 *   the repetition is the point. Others revisit to find what they missed, and a
 *   title they have already seen four times is the last thing they want.
 *
 *   COOLING. How long a gap someone needs before a film feels new again. This
 *   ranges from weeks to a decade and nothing else in the app knows it.
 *
 * What it produces is bounded by construction: a RewatchProfile whose influence
 * on any score is capped at ±10 in `rewatch.ts`, and which is a strict no-op
 * until at least one question is answered.
 *
 * Pure. No I/O, no clock.
 */
import { RESPONSE_VALUES, type ResponseKey } from '@/lib/taste/quickQuiz';
import type { RewatchProfile } from './rewatch';

export const REWATCH_BANK_VERSION = '1.0.0';
/** Short on purpose — this is a supplement to the taste quiz, not a rival. */
export const REWATCH_SESSION_LENGTH = 8;

export type RewatchSectionId = 'why' | 'timing' | 'what_earns_it' | 'limits';

export const REWATCH_SECTIONS: ReadonlyArray<{ id: RewatchSectionId; label: string }> = [
  { id: 'why', label: 'Why you go back' },
  { id: 'timing', label: 'How long you leave it' },
  { id: 'what_earns_it', label: 'What earns a second watch' },
  { id: 'limits', label: 'What rules one out' },
];

/** Which axis a statement moves, and which way. */
export type RewatchAxis = 'comfort' | 'cooling';

export interface RewatchQuestion {
  id: string;
  section: RewatchSectionId;
  /** The statement, written so that agreeing is unambiguous. */
  prompt: string;
  axis: RewatchAxis;
  /** +1 = agreeing pushes the axis up; −1 = agreeing pushes it down. */
  polarity: 1 | -1;
  /** How much this statement is worth relative to the others. */
  weight?: number;
}

export const REWATCH_BANK: readonly RewatchQuestion[] = [
  // ── Why you go back ────────────────────────────────────────────────────
  {
    id: 'rw-why-comfort',
    section: 'why',
    prompt: 'I rewatch things because they are familiar, not because I expect to find anything new.',
    axis: 'comfort',
    polarity: 1,
  },
  {
    id: 'rw-why-discover',
    section: 'why',
    prompt: 'When I rewatch something, I am looking for what I missed the first time.',
    axis: 'comfort',
    polarity: -1,
  },
  {
    id: 'rw-why-background',
    section: 'why',
    prompt: 'I will happily put on something I know by heart and half-watch it.',
    axis: 'comfort',
    polarity: 1,
  },
  {
    id: 'rw-why-waste',
    section: 'why',
    prompt: 'Rewatching feels like a waste when there is so much I have not seen.',
    axis: 'comfort',
    polarity: -1,
    weight: 1.2,
  },
  {
    id: 'rw-why-mood',
    section: 'why',
    prompt: 'There are a handful of films I return to whenever I am in a particular mood.',
    axis: 'comfort',
    polarity: 1,
  },

  // ── How long you leave it ──────────────────────────────────────────────
  {
    id: 'rw-time-soon',
    section: 'timing',
    prompt: 'I am happy to watch something again within a few months.',
    axis: 'cooling',
    polarity: -1,
    weight: 1.2,
  },
  {
    id: 'rw-time-forget',
    section: 'timing',
    prompt: 'I need to have genuinely forgotten most of it before I will go back.',
    axis: 'cooling',
    polarity: 1,
    weight: 1.2,
  },
  {
    id: 'rw-time-annual',
    section: 'timing',
    prompt: 'Some things I watch every single year without it getting old.',
    axis: 'cooling',
    polarity: -1,
  },
  {
    id: 'rw-time-decade',
    section: 'timing',
    prompt: 'A film I loved a decade ago is far more tempting than one I loved last year.',
    axis: 'cooling',
    polarity: 1,
  },
  {
    id: 'rw-time-endings',
    section: 'timing',
    prompt: 'Knowing exactly how it ends takes most of the point out of it.',
    axis: 'cooling',
    polarity: 1,
  },

  // ── What earns a second watch ──────────────────────────────────────────
  {
    id: 'rw-earn-loved',
    section: 'what_earns_it',
    prompt: 'Only the things I genuinely loved are worth a second watch.',
    axis: 'comfort',
    polarity: 1,
  },
  {
    id: 'rw-earn-dense',
    section: 'what_earns_it',
    prompt: 'Something dense or confusing is more worth revisiting than something I understood completely.',
    axis: 'comfort',
    polarity: -1,
    weight: 1.2,
  },
  {
    id: 'rw-earn-changed',
    section: 'what_earns_it',
    prompt: 'I like seeing whether something still holds up now that I am older.',
    axis: 'comfort',
    polarity: -1,
  },
  {
    id: 'rw-earn-repeat',
    section: 'what_earns_it',
    prompt: 'A film I have already seen four times can absolutely be the right call tonight.',
    axis: 'comfort',
    polarity: 1,
    weight: 1.2,
  },

  // ── What rules one out ─────────────────────────────────────────────────
  {
    id: 'rw-limit-recent',
    section: 'limits',
    prompt: 'If I saw it this year, it is off the table.',
    axis: 'cooling',
    polarity: 1,
  },
  {
    id: 'rw-limit-long',
    section: 'limits',
    prompt: 'I would rather revisit a favourite than gamble two hours on something unknown.',
    axis: 'comfort',
    polarity: 1,
  },
  {
    id: 'rw-limit-once',
    section: 'limits',
    prompt: 'Most things are a once-only, however good they were.',
    axis: 'comfort',
    polarity: -1,
  },
];

export const REWATCH_BY_ID: ReadonlyMap<string, RewatchQuestion> = new Map(
  REWATCH_BANK.map((q) => [q.id, q]),
);

export interface RewatchAnswer {
  questionId: string;
  response: ResponseKey;
  /** Epoch ms — supplied by the caller, never read from a clock in here. */
  at: number;
}

/**
 * Pick a session: spread across the sections rather than running down the bank,
 * so eight answers still touch every axis. Deterministic given the same inputs
 * — no shuffle, because a quiz that reorders under the user's hands is the bug
 * the taste quiz already had to fix once.
 */
export function selectRewatchQuestions(
  opts: { asked?: readonly string[]; count?: number } = {},
): RewatchQuestion[] {
  const asked = new Set(opts.asked ?? []);
  const count = opts.count ?? REWATCH_SESSION_LENGTH;
  const bySection = new Map<RewatchSectionId, RewatchQuestion[]>();
  for (const q of REWATCH_BANK) {
    if (asked.has(q.id)) continue;
    const list = bySection.get(q.section) ?? [];
    list.push(q);
    bySection.set(q.section, list);
  }

  const out: RewatchQuestion[] = [];
  let round = 0;
  while (out.length < count) {
    let addedThisRound = 0;
    for (const s of REWATCH_SECTIONS) {
      const list = bySection.get(s.id);
      const q = list?.[round];
      if (!q) continue;
      out.push(q);
      addedThisRound += 1;
      if (out.length >= count) break;
    }
    if (addedThisRound === 0) break;
    round += 1;
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Answers → profile.
 *
 * A weighted mean per axis, so answering four comfort statements and one timing
 * statement does not make the timing axis louder than the comfort one. Zero
 * answers returns `samples: 0`, which `rewatch.ts` treats as "change nothing" —
 * so an untaken quiz can never quietly move a score.
 */
export function answersToRewatchProfile(answers: readonly RewatchAnswer[]): RewatchProfile {
  const sums: Record<RewatchAxis, { value: number; weight: number }> = {
    comfort: { value: 0, weight: 0 },
    cooling: { value: 0, weight: 0 },
  };
  let counted = 0;

  for (const a of answers) {
    const q = REWATCH_BY_ID.get(a.questionId);
    if (!q) continue;
    const rv = RESPONSE_VALUES[a.response];
    if (!rv) continue;
    counted += 1;
    // "Depends" is a real answer and it means the middle — it carries weight
    // but contributes nothing directional, rather than being dropped.
    if (a.response === 'depends') {
      sums[q.axis].weight += q.weight ?? 1;
      continue;
    }
    const w = q.weight ?? 1;
    sums[q.axis].value += rv.value * q.polarity * w;
    sums[q.axis].weight += w;
  }

  const mean = (axis: RewatchAxis): number => {
    const s = sums[axis];
    return s.weight > 0 ? s.value / s.weight : 0;
  };

  return {
    comfort: clamp(mean('comfort'), -1, 1),
    // cooling lives on 0..1 with 0.5 neutral, so the −1..1 mean is halved and offset.
    cooling: clamp(0.5 + mean('cooling') / 2, 0, 1),
    samples: counted,
  };
}

/** A one-line read-back of the profile, in the user's terms. Never invented. */
export function describeRewatchProfile(p: RewatchProfile): string {
  if (p.samples <= 0) return 'Nothing learned yet — the quiz takes about a minute.';
  const comfort =
    p.comfort >= 0.35
      ? 'You rewatch for comfort'
      : p.comfort <= -0.35
        ? 'You rewatch to rediscover'
        : 'You rewatch for comfort and for rediscovery about equally';
  const cooling =
    p.cooling >= 0.65
      ? 'and you need a long gap first'
      : p.cooling <= 0.35
        ? 'and you do not need long between goes'
        : 'and you need a moderate gap first';
  return `${comfort}, ${cooling}.`;
}
