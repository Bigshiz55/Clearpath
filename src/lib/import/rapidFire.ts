/**
 * RAPID FIRE — turning an import into a Watch DNA.
 *
 * An import gives us hundreds of rows that mean "this played on a screen".
 * `signalModel.ts` prices that at 0.2, against 1.1 for a thumbs-up, precisely
 * because pressing play is not an opinion. So a big import is wide and shallow:
 * lots of rows, almost no taste.
 *
 * This module is the conversion. It takes the consolidated observations and
 * turns them into a short, ordered queue of questions whose ANSWERS are
 * explicit — and explicit is worth five to eight times as much per title.
 *
 * The three rules that make it honest, all of which the tests pin:
 *
 *   • "I DON'T REMEMBER" SENDS NOTHING. Not a dislike, not a weak positive,
 *     nothing. Forgetting a film is not a verdict on it, and this app has
 *     already been bitten once by a Skip button that recorded `not_interested`
 *     and turned "never heard of it" into a fabricated opinion.
 *   • "THAT WASN'T ME" DELETES the observation rather than negating it. A
 *     shared Netflix profile is the single biggest polluter of imported
 *     history, and someone else's viewing is not evidence about you in either
 *     direction.
 *   • THE ABANDONED ONES GO FIRST. `continue_watching` sits at 0.15 in the
 *     signal model *because we cannot tell interrupted from abandoned* — the
 *     comment there says exactly that. We can simply ask, and the answer is the
 *     most valuable one available: `did_not_finish` is weight 1.3, heavier than
 *     a thumbs-up, because giving up is a far clearer verdict than finishing.
 *
 * Pure. No I/O, no clock — `now` is a parameter.
 */
import type { ImportContext, ImportSignal, UserVerdict } from './signalModel';
import { signalForVerdict } from './signalModel';

/** Questions per sitting. Twenty is a couple of minutes, not a chore. */
export const BATCH_SIZE = 20;

/**
 * How a title is framed. An abandoned show and a film you finished are not the
 * same question, and asking "did you like it?" about something you bailed on
 * gets a worse answer than asking why you bailed.
 */
export type QuestionKind = 'watched' | 'abandoned' | 'rewatched';

export interface RapidFireItem {
  /** Stable id — the title, normalised. Survives a re-import. */
  key: string;
  title: string;
  mediaType: 'movie' | 'tv';
  kind: QuestionKind;
  /** What the import detected, before the user says anything. */
  context: ImportContext;
  /** The evidence line, to jog memory. Always from real parsed data. */
  evidence: string;
  /** ISO date of the last viewing, when the file had one. */
  lastWatched: string | null;
  /** Ordering score — see `priorityFor`. */
  priority: number;
}

/**
 * ORDERING.
 *
 * The DNA engine has a real `expectedInfoGain` (`preference/infogain.ts`), but
 * it needs a title's 18-axis fingerprint, and at import time we have a string
 * from a CSV and nothing else. So this is an explicit, documented PROXY rather
 * than a pretend information-gain calculation — asking about what we know is
 * most informative *as a class of observation*, not per title.
 *
 * Ranked by how much the answer is worth:
 *   abandoned  — the signal nobody else can get, and the heaviest one we have
 *   rewatched  — repeat viewing is already behavioural evidence; confirming it
 *                promotes 0.7 to 1.6
 *   long series — hours invested, so the opinion is well formed
 *   one film    — a single play is the weakest thing in the file
 */
export const PRIORITY = {
  abandoned: 100,
  rewatched: 80,
  longSeries: 70,
  someSeries: 55,
  film: 40,
  sampled: 20,
} as const;

/** A recent title is easier to remember, so its answer is more reliable. */
export const RECENCY_BONUS_MAX = 20;
const DAY = 86_400_000;
const RECENCY_FADES_AFTER_DAYS = 730;

export function recencyBonus(lastWatched: string | null, now: number): number {
  if (!lastWatched) return 0;
  const ms = Date.parse(lastWatched);
  if (!Number.isFinite(ms)) return 0;
  const days = Math.max(0, (now - ms) / DAY);
  if (days >= RECENCY_FADES_AFTER_DAYS) return 0;
  return Math.round(RECENCY_BONUS_MAX * (1 - days / RECENCY_FADES_AFTER_DAYS));
}

/** What an observation is worth asking about, before recency. */
export function priorityFor(kind: QuestionKind, context: ImportContext): number {
  if (kind === 'abandoned') return PRIORITY.abandoned;
  if (kind === 'rewatched') return PRIORITY.rewatched;
  switch (context) {
    case 'completed_series':
      return PRIORITY.longSeries;
    case 'viewing_history':
      return PRIORITY.film;
    case 'continue_watching':
      return PRIORITY.abandoned;
    default:
      return PRIORITY.someSeries;
  }
}

/** The raw shape the queue builder accepts — deliberately not tied to Netflix. */
export interface Observation {
  title: string;
  mediaType: 'movie' | 'tv';
  context: ImportContext;
  evidence: string;
  lastWatched: string | null;
  /** True when the file shows it was played more than once. */
  repeated?: boolean;
  /** True when it was started and demonstrably not finished. */
  abandoned?: boolean;
}

export function normaliseKey(title: string, mediaType: 'movie' | 'tv'): string {
  return `${mediaType}:${title.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function kindFor(o: Observation): QuestionKind {
  if (o.abandoned || o.context === 'continue_watching') return 'abandoned';
  if (o.repeated || o.context === 'repeated_viewing') return 'rewatched';
  return 'watched';
}

/**
 * Build the ordered queue.
 *
 * Deduplicates by key, skips anything already answered, sorts by priority and
 * then deterministically by title so the same import always produces the same
 * queue — a list that reshuffles between sittings makes "answer 20 more"
 * meaningless.
 */
export function buildQueue(
  observations: readonly Observation[],
  opts: { answered?: readonly string[]; now: number; limit?: number } = { now: 0 },
): RapidFireItem[] {
  const answered = new Set(opts.answered ?? []);
  const byKey = new Map<string, RapidFireItem>();

  for (const o of observations) {
    if (!o.title.trim()) continue;
    const key = normaliseKey(o.title, o.mediaType);
    if (answered.has(key) || byKey.has(key)) continue;
    const kind = kindFor(o);
    byKey.set(key, {
      key,
      title: o.title,
      mediaType: o.mediaType,
      kind,
      context: o.context,
      evidence: o.evidence,
      lastWatched: o.lastWatched,
      priority: priorityFor(kind, o.context) + recencyBonus(o.lastWatched, opts.now),
    });
  }

  const all = [...byKey.values()].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.title.localeCompare(b.title);
  });
  return opts.limit == null ? all : all.slice(0, opts.limit);
}

// ---------------------------------------------------------------------------
// The answers
// ---------------------------------------------------------------------------

export type AnswerKey =
  | 'loved'
  | 'liked'
  | 'fine'
  | 'disliked'
  | 'bailed'
  | 'interrupted'
  | 'not_me'
  | 'dont_remember';

export interface AnswerOption {
  key: AnswerKey;
  label: string;
  /** 'good' | 'bad' | 'neutral' — for tone only, never for weighting. */
  tone: 'good' | 'bad' | 'neutral';
}

const LIKING: AnswerOption[] = [
  { key: 'loved', label: 'Loved it', tone: 'good' },
  { key: 'liked', label: 'Liked it', tone: 'good' },
  { key: 'fine', label: 'It was fine', tone: 'neutral' },
  { key: 'disliked', label: 'Didn’t like it', tone: 'bad' },
];

/** Always offered, always last: the two escape hatches that must exist. */
const ESCAPES: AnswerOption[] = [
  { key: 'not_me', label: 'Wasn’t me', tone: 'neutral' },
  { key: 'dont_remember', label: 'Don’t remember', tone: 'neutral' },
];

export function answersFor(kind: QuestionKind): AnswerOption[] {
  if (kind === 'abandoned') {
    return [
      { key: 'bailed', label: 'Gave up on it', tone: 'bad' },
      { key: 'interrupted', label: 'Life got in the way', tone: 'neutral' },
      { key: 'liked', label: 'Still watching it', tone: 'good' },
      ...ESCAPES,
    ];
  }
  return [...LIKING, ...ESCAPES];
}

/** The question text. Framed by kind, because they are different questions. */
export function questionFor(item: RapidFireItem): string {
  if (item.kind === 'abandoned') return 'You started this and stopped. Which was it?';
  if (item.kind === 'rewatched') return 'You went back to this more than once. How was it?';
  return 'You watched this. How was it?';
}

export interface Resolution {
  /** The verdict recorded against the user's profile. Null = record nothing. */
  verdict: UserVerdict | null;
  /** The weighted signal, or null when the answer carries no taste evidence. */
  signal: ImportSignal | null;
  /**
   * True when the imported observation should be DELETED rather than kept —
   * "that wasn't me" means the row was never evidence about this person.
   */
  dropsObservation: boolean;
  /** True when the title should still be marked as seen (so we stop suggesting it). */
  marksSeen: boolean;
}

/**
 * Answer → what we actually record.
 *
 * The two escape hatches are the whole reason this function exists rather than
 * a lookup table inline in the component.
 */
export function resolveAnswer(answer: AnswerKey): Resolution {
  switch (answer) {
    case 'loved':
      return { verdict: 'loved', signal: signalForVerdict('loved'), dropsObservation: false, marksSeen: true };
    case 'liked':
      return { verdict: 'liked', signal: signalForVerdict('liked'), dropsObservation: false, marksSeen: true };
    case 'fine':
      return { verdict: 'okay', signal: signalForVerdict('okay'), dropsObservation: false, marksSeen: true };
    case 'disliked':
      return { verdict: 'disliked', signal: signalForVerdict('disliked'), dropsObservation: false, marksSeen: true };
    case 'bailed':
      // The heaviest signal available, and the one no competitor can collect.
      return {
        verdict: 'did_not_finish',
        signal: signalForVerdict('did_not_finish'),
        dropsObservation: false,
        marksSeen: true,
      };
    case 'interrupted':
      // Not a judgement on the title — a fact about their week. `not_now` has
      // `decay: 'mood'`, so it fades instead of counting against it forever.
      return { verdict: 'not_now', signal: signalForVerdict('not_now'), dropsObservation: false, marksSeen: true };
    case 'not_me':
      // Someone else's viewing. Delete it — and do NOT mark it seen, because
      // this person has not seen it and should still be offered it.
      return { verdict: 'other_profile', signal: null, dropsObservation: true, marksSeen: false };
    case 'dont_remember':
      // NOTHING. They watched it — that much is a fact, so it stays marked seen
      // — but no opinion is recorded in either direction.
      return { verdict: null, signal: null, dropsObservation: false, marksSeen: true };
  }
}

// ---------------------------------------------------------------------------
// Session accounting
// ---------------------------------------------------------------------------

export interface SessionSummary {
  answered: number;
  remaining: number;
  /** Answers that produced real taste evidence. */
  taught: number;
  /** Rows removed as somebody else's viewing. */
  dropped: number;
  /** Answered honestly with "don't remember" — counted, never weighted. */
  unremembered: number;
  /** Plain-language read-back. Never overstates what was learned. */
  message: string;
}

export function summarise(answers: readonly AnswerKey[], totalQueued: number): SessionSummary {
  let taught = 0;
  let dropped = 0;
  let unremembered = 0;
  for (const a of answers) {
    const r = resolveAnswer(a);
    if (r.dropsObservation) dropped += 1;
    else if (r.signal) taught += 1;
    else unremembered += 1;
  }
  const answered = answers.length;
  const remaining = Math.max(0, totalQueued - answered);

  const parts: string[] = [];
  if (taught > 0) parts.push(`${taught} real opinion${taught === 1 ? '' : 's'} added to your DNA`);
  if (dropped > 0) parts.push(`${dropped} taken off as someone else’s`);
  if (unremembered > 0) parts.push(`${unremembered} left alone`);

  return {
    answered,
    remaining,
    taught,
    dropped,
    unremembered,
    message: parts.length > 0 ? parts.join(' · ') : 'Nothing recorded yet.',
  };
}
