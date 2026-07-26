/**
 * THE ADAPTIVE QUESTION ENGINE.
 *
 * A fixed questionnaire wastes most of its questions. If someone opens with
 * "I hate horror and I can't stand subtitles", asking them about horror and
 * subtitles next is five questions spent learning nothing.
 *
 * So the next question is chosen by expected information gain: how much
 * uncertainty it would remove across the attributes it probes, given what we
 * already believe. Two things always jump the queue, because leaving them
 * unresolved poisons everything downstream:
 *
 *   1. A genuine contradiction — we ask instead of guessing a winner.
 *   2. An exception we noticed but the user never stated — we confirm instead
 *      of quietly overriding a rule they gave us.
 *
 * Pure and deterministic: the same state always produces the same question, so
 * the interview is reproducible and unit-testable end to end.
 */
import type { Claim, Conflict, VoiceProfile } from './types';
import { CONFIDENCE_HALF, unconfirmedExceptions } from './profile';
import { attributePhrase } from './lexicon';

export type InterviewMode = 'quick' | 'full';

/** How many open questions each mode asks. Follow-ups are extra. */
export const QUESTION_COUNT: Record<InterviewMode, number> = { quick: 5, full: 12 };

export type QuestionStage = 'opening' | 'core' | 'edge' | 'closing';

export interface VoiceQuestion {
  id: string;
  prompt: string;
  /** Sub-line under the prompt. Sets expectations, never asks a second thing. */
  helper?: string;
  placeholder?: string;
  kind: 'open' | 'choice';
  options?: Array<{ value: string; label: string }>;
  /** Attribute keys this question is likely to teach us about. */
  teaches: string[];
  /** True when the honest answer is usually a title. */
  solicitsTitle?: boolean;
  /** How much of the profile the question moves at once. */
  breadth: number;
  stage: QuestionStage;
}

/**
 * The bank. Written to be answerable in a sentence — every one of these is a
 * question a person can answer out loud without thinking about taxonomy.
 */
export const QUESTION_BANK: readonly VoiceQuestion[] = [
  {
    id: 'last_loved',
    prompt: 'What is the last film or show you genuinely loved?',
    helper: 'One is plenty. Tell me why, if you know why.',
    placeholder: 'e.g. I loved Severance — the weirdness never let up',
    kind: 'open',
    teaches: [],
    solicitsTitle: true,
    breadth: 2.4,
    stage: 'opening',
  },
  {
    id: 'couldnt_get_into',
    prompt: 'What is something everyone else loves that you could not get into?',
    helper: 'This is often more useful than what you liked.',
    placeholder: 'e.g. I gave up on Succession, everyone in it is awful',
    kind: 'open',
    teaches: ['cynical', 'morally_grey'],
    solicitsTitle: true,
    breadth: 2.2,
    stage: 'opening',
  },
  {
    id: 'never_again',
    prompt: 'What will you never watch, no matter who recommends it?',
    kind: 'open',
    placeholder: 'e.g. I do not do horror, ever',
    teaches: ['horror', 'reality', 'musical', 'animation', 'sci_fi', 'romance_genre', 'documentary', 'war', 'western', 'superhero', 'gore'],
    breadth: 1.6,
    stage: 'core',
  },
  {
    id: 'pace',
    prompt: 'When a story takes its time, do you settle in or lose patience?',
    kind: 'open',
    placeholder: 'e.g. I need something happening, slow shows lose me',
    teaches: ['slow_pace', 'fast_pace'],
    breadth: 1.4,
    stage: 'core',
  },
  {
    id: 'tone',
    prompt: 'After a hard day, do you want something dark or something that lifts you?',
    kind: 'open',
    placeholder: 'e.g. dark, always — the heavier the better',
    teaches: ['dark_tone', 'feel_good', 'emotional'],
    breadth: 1.4,
    stage: 'core',
  },
  {
    id: 'attention',
    prompt: 'Do you want something you can half-watch, or something that demands your full attention?',
    kind: 'open',
    placeholder: 'e.g. I want to concentrate, I hate background TV',
    teaches: ['background_friendly', 'complex_plot'],
    breadth: 1.3,
    stage: 'core',
  },
  {
    id: 'subtitles',
    prompt: 'How do you feel about subtitles and foreign-language titles?',
    kind: 'open',
    placeholder: 'e.g. fine with subtitles, prefer English audio if it exists',
    teaches: ['subtitles', 'foreign_language', 'english_audio'],
    breadth: 1.2,
    stage: 'core',
  },
  {
    id: 'violence',
    prompt: 'Where is your line on violence?',
    kind: 'open',
    placeholder: 'e.g. I can take a lot as long as it is not gratuitous',
    teaches: ['violence', 'gore', 'scary'],
    breadth: 1.2,
    stage: 'core',
  },
  {
    id: 'people_or_plot',
    prompt: 'Do you care more about the people or about what happens to them?',
    kind: 'open',
    placeholder: 'e.g. the people — I will watch anything with a great character',
    teaches: ['character_driven', 'plot_driven'],
    breadth: 1.2,
    stage: 'core',
  },
  {
    id: 'commitment',
    prompt: 'Would you rather start an eight-season show or a six-part limited series?',
    kind: 'open',
    placeholder: 'e.g. limited series, I never finish the long ones',
    teaches: ['many_seasons', 'limited_series', 'serialized', 'episodic'],
    breadth: 1.2,
    stage: 'core',
  },
  {
    id: 'exception',
    prompt: 'Is there a genre you claim to hate but keep making exceptions for?',
    helper: 'Exceptions tell me more than rules do.',
    kind: 'open',
    placeholder: 'e.g. I hate sci-fi but I loved Arrival',
    teaches: [],
    solicitsTitle: true,
    breadth: 1.8,
    stage: 'edge',
  },
  {
    id: 'stakes',
    prompt: 'Saving the world, or one family falling apart?',
    kind: 'open',
    placeholder: 'e.g. small stories, every time',
    teaches: ['epic_stakes', 'intimate_stakes', 'superhero'],
    breadth: 1.1,
    stage: 'edge',
  },
  {
    id: 'real_or_not',
    prompt: 'Do you prefer stories that could actually happen?',
    kind: 'open',
    placeholder: 'e.g. I like true stories, fantasy loses me',
    teaches: ['grounded', 'true_story', 'fantasy', 'sci_fi', 'documentary'],
    breadth: 1.3,
    stage: 'edge',
  },
  {
    id: 'morality',
    prompt: 'Do you need someone to root for, or are you fine with everyone being awful?',
    kind: 'open',
    placeholder: 'e.g. I need one decent person in it',
    teaches: ['morally_grey', 'cynical', 'feel_good'],
    breadth: 1.2,
    stage: 'edge',
  },
  {
    id: 'humor',
    prompt: 'Does everything need a bit of humour in it?',
    kind: 'open',
    placeholder: 'e.g. yes, even the grim stuff needs jokes',
    teaches: ['comedy'],
    breadth: 0.9,
    stage: 'edge',
  },
  {
    id: 'endings',
    prompt: 'How much does an unresolved or cancelled ending ruin the whole thing?',
    kind: 'open',
    placeholder: 'e.g. completely — I will not start a cancelled show',
    teaches: ['unfinished', 'twists'],
    breadth: 0.9,
    stage: 'edge',
  },
  {
    id: 'rewatch',
    prompt: 'What do you put on when you do not want to think?',
    kind: 'open',
    placeholder: 'e.g. I rewatch old sitcoms',
    teaches: ['background_friendly', 'comedy', 'episodic'],
    solicitsTitle: true,
    breadth: 1.2,
    stage: 'edge',
  },
  {
    id: 'romance',
    prompt: 'Does a love story make it better or worse?',
    kind: 'open',
    placeholder: 'e.g. worse, unless it is actually the point',
    teaches: ['romance_genre', 'sex_content'],
    breadth: 0.9,
    stage: 'edge',
  },
  {
    id: 'tension',
    prompt: 'Do you enjoy being stressed out by a story?',
    kind: 'open',
    placeholder: 'e.g. no, I cannot do tense — I pause constantly',
    teaches: ['tense', 'thriller', 'scary'],
    breadth: 1.1,
    stage: 'edge',
  },
  {
    id: 'crime',
    prompt: 'Detectives, heists, courtrooms — any of that your thing?',
    kind: 'open',
    placeholder: 'e.g. I love a proper investigation',
    teaches: ['crime', 'investigation', 'thriller'],
    breadth: 1.1,
    stage: 'edge',
  },
  {
    id: 'mood_now',
    prompt: 'And just for tonight — what are you in the mood for?',
    helper: 'I will keep this separate from the permanent stuff.',
    kind: 'open',
    placeholder: 'e.g. tonight I want something light',
    teaches: [],
    breadth: 0.6,
    stage: 'closing',
  },
  {
    id: 'anything_else',
    prompt: 'Anything else I should know before I start picking?',
    kind: 'open',
    placeholder: 'Say it however you like',
    teaches: [],
    breadth: 0.8,
    stage: 'closing',
  },
] as const;

const STAGE_ORDER: Record<QuestionStage, number> = { opening: 0, core: 1, edge: 2, closing: 3 };

export interface QuestionState {
  mode: InterviewMode;
  /** Ids already asked, including follow-ups. */
  asked: string[];
  profile: VoiceProfile;
  claims: Claim[];
}

/**
 * Follow-up ids embed claim ids, and claim ids already contain colons, so the
 * separator has to be something a claim id can never hold.
 */
export const FOLLOWUP_SEP = '|';

/** True for a repair question (conflict or exception), false for a bank one. */
export function isFollowUp(questionId: string): boolean {
  return questionId.includes(FOLLOWUP_SEP);
}

/** Stable id for a conflict follow-up, so answering it is idempotent. */
export function conflictQuestionId(c: Conflict): string {
  return ['conflict', c.positiveClaimId, c.negativeClaimId].join(FOLLOWUP_SEP);
}

/** Stable id for an exception confirmation. */
export function exceptionQuestionId(ruleClaimId: string, exceptionClaimId: string): string {
  return ['exception', ruleClaimId, exceptionClaimId].join(FOLLOWUP_SEP);
}

/** Split a follow-up id back into its parts. */
export function parseFollowUpId(questionId: string): { kind: string; a: string; b: string } | null {
  const parts = questionId.split(FOLLOWUP_SEP);
  if (parts.length !== 3) return null;
  return { kind: parts[0] ?? '', a: parts[1] ?? '', b: parts[2] ?? '' };
}

/** Remaining uncertainty about an attribute, 0..1. */
export function uncertainty(profile: VoiceProfile, key: string): number {
  const ev = profile.attributes[key]?.evidence ?? 0;
  return CONFIDENCE_HALF / (ev + CONFIDENCE_HALF);
}

/**
 * Expected information gain: how much uncertainty this question could remove.
 * Title-soliciting questions keep some value even once the attributes they
 * touch are settled, because a named title teaches things no dial can.
 */
export function expectedGain(q: VoiceQuestion, profile: VoiceProfile): number {
  let gain = 0;
  for (const key of q.teaches) gain += uncertainty(profile, key);
  if (q.teaches.length > 0) gain /= Math.sqrt(q.teaches.length);
  if (q.solicitsTitle) gain += 0.9 / (1 + profile.titles.length);
  if (q.teaches.length === 0 && !q.solicitsTitle) gain += 0.35;
  return gain * q.breadth;
}

function conflictQuestion(c: Conflict): VoiceQuestion {
  return {
    id: conflictQuestionId(c),
    prompt: c.question,
    helper: 'You told me both. I would rather ask than guess.',
    kind: 'choice',
    options: c.options,
    teaches: [c.attribute],
    breadth: 2,
    stage: 'core',
  };
}

function exceptionConfirmation(ruleAttribute: string, titleText: string, id: string): VoiceQuestion {
  return {
    id,
    prompt: `You avoid ${attributePhrase(ruleAttribute)}, but you liked ${titleText}. Is that an exception?`,
    helper: 'I noticed this — you did not say it. Tell me which it is.',
    kind: 'choice',
    options: [
      { value: 'exception', label: `Yes — ${titleText} is an exception` },
      { value: 'rule_wrong', label: `No — I do not really avoid ${attributePhrase(ruleAttribute)}` },
      { value: 'title_wrong', label: `No — I did not actually like ${titleText}` },
    ],
    teaches: [ruleAttribute],
    breadth: 1.8,
    stage: 'core',
  };
}

/**
 * The next question, or null when the interview is done.
 *
 * Pending contradictions and unconfirmed exceptions come first and do NOT count
 * against the question budget — resolving them is repair work, not new ground.
 */
export function nextQuestion(state: QuestionState): VoiceQuestion | null {
  const asked = new Set(state.asked);

  for (const c of state.profile.conflicts) {
    const id = conflictQuestionId(c);
    if (!asked.has(id)) return conflictQuestion(c);
  }

  for (const e of unconfirmedExceptions(state.profile, state.claims)) {
    const id = exceptionQuestionId(e.ruleClaimId, e.exceptionClaimId);
    if (asked.has(id)) continue;
    const titleText = e.title?.text;
    if (!titleText) continue;
    return exceptionConfirmation(e.ruleAttribute, titleText, id);
  }

  const openAsked = state.asked.filter((id) => !isFollowUp(id)).length;
  if (openAsked >= QUESTION_COUNT[state.mode]) return null;

  const remaining = QUESTION_BANK.filter((q) => !asked.has(q.id));
  if (remaining.length === 0) return null;

  // Stage gating: openings first, closings last, so the interview has a shape
  // even though the middle is chosen adaptively.
  const budget = QUESTION_COUNT[state.mode];
  const allowClosing = openAsked >= budget - 2;
  // The first question is always an opening one: an interview that starts by
  // interrogating your position on subtitles does not feel like a conversation.
  const pool = remaining.filter((q) => {
    if (openAsked === 0) return q.stage === 'opening';
    if (q.stage === 'opening') return openAsked < 2;
    if (q.stage === 'closing') return allowClosing;
    return true;
  });
  const candidates = pool.length > 0 ? pool : remaining;

  let best = candidates[0] ?? null;
  let bestScore = -Infinity;
  for (const q of candidates) {
    const score = expectedGain(q, state.profile) - STAGE_ORDER[q.stage] * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

/** Where the user is, for the progress indicator. */
export function progress(state: QuestionState): { asked: number; total: number; pendingRepairs: number } {
  const openAsked = state.asked.filter((id) => !isFollowUp(id)).length;
  const askedSet = new Set(state.asked);
  const pendingRepairs =
    state.profile.conflicts.filter((c) => !askedSet.has(conflictQuestionId(c))).length +
    unconfirmedExceptions(state.profile, state.claims).filter(
      (e) => !askedSet.has(exceptionQuestionId(e.ruleClaimId, e.exceptionClaimId)),
    ).length;
  return { asked: Math.min(openAsked, QUESTION_COUNT[state.mode]), total: QUESTION_COUNT[state.mode], pendingRepairs };
}

/** Look up a bank question by id (follow-ups are not in the bank). */
export function bankQuestion(id: string): VoiceQuestion | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}
