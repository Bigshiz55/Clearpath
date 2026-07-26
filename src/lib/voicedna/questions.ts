/**
 * THE ADAPTIVE INTERVIEW ENGINE.
 *
 * The interview is a sequence of STAGES — favourites, what does not work, your
 * viewing style, deal-breakers, exceptions — and each stage is a set of SLOTS.
 * A slot is a main question. What makes it an interview rather than a form is
 * what happens between the slots:
 *
 *   * Naming a title generates a "why" follow-up for that title, and the chips
 *     in it depend on what the title actually is: someone who loved Sherlock is
 *     asked about deduction and the cases, not about spectacle.
 *   * Picking deal-breakers generates a strength question for each one, because
 *     "too much romance" and "never show me a child being hurt" are not the
 *     same instruction.
 *   * A contradiction or an unstated exception interrupts everything and is put
 *     to the user directly, off-budget.
 *   * A slot whose ground is already covered — by earlier answers or by an
 *     import — is skipped rather than asked for form's sake.
 *
 * The next question is therefore a pure function of the state. No queue, no
 * cursor, nothing to get out of sync: the same answers always produce the same
 * interview, which is what makes the whole thing testable.
 */
import type { Claim, Conflict, Reaction, VoiceProfile } from './types';
import { CONFIDENCE_HALF, unconfirmedExceptions } from './profile';
import { attributePhrase } from './lexicon';
import { decodeChips, decodeTitles } from './answerCodec';
import {
  COMEDY_OPTIONS, DEALBREAKER_CHIPS, DEALBREAKER_STRENGTHS, DISLIKE_REASONS, DNF_PROGRESS,
  DNF_REASONS, FORMAT_QUESTIONS, GENRE_CHIPS, GENRE_DEPTH, TONE_OPTIONS, loveReasonsFor,
  type ReasonChip,
} from './reasons';

export type InterviewMode = 'quick' | 'full';

/** Main questions per mode. Follow-ups and repairs are extra, by design. */
export const MAIN_COUNT: Record<InterviewMode, number> = { quick: 5, full: 16 };

/** Per-title follow-ups we will ask before it starts feeling like an audit. */
export const MAX_WHY_FOLLOWUPS: Record<InterviewMode, number> = { quick: 3, full: 8 };
/** Deal-breakers we grade individually. The rest are recorded at their default. */
export const MAX_STRENGTH_FOLLOWUPS: Record<InterviewMode, number> = { quick: 2, full: 5 };

/** Below this expected gain a non-required slot is not worth the user's time. */
export const GAIN_FLOOR = 0.35;

export type StageId =
  | 'favourites' | 'dislikes' | 'abandoned' | 'genres'
  | 'dealbreakers' | 'format' | 'exceptions' | 'rewatch';

/** The progress labels the user sees. Several stages share one label. */
export const STAGE_LABEL: Record<StageId, string> = {
  favourites: 'Your favourites',
  dislikes: 'What does not work',
  abandoned: 'What does not work',
  genres: 'Your viewing style',
  format: 'Your viewing style',
  dealbreakers: 'Your deal-breakers',
  exceptions: 'Exceptions',
  rewatch: 'Exceptions',
};

/** Stage order. The interview always walks this front to back. */
export const STAGE_ORDER: readonly StageId[] = [
  'favourites', 'dislikes', 'abandoned', 'genres', 'dealbreakers', 'format', 'exceptions', 'rewatch',
];

/** The distinct labels, in order, for the progress rail. */
export const PROGRESS_LABELS: readonly string[] = STAGE_ORDER
  .map((s) => STAGE_LABEL[s])
  .filter((label, i, all) => all.indexOf(label) === i)
  .concat('Review');

export type QuestionKind = 'titles' | 'chips' | 'choice' | 'open';

export interface QuestionOption {
  value: string;
  label: string;
  hint?: string;
}

export interface VoiceQuestion {
  id: string;
  stage: StageId;
  /** The progress label this question sits under. */
  stageLabel: string;
  prompt: string;
  helper?: string;
  kind: QuestionKind;
  options?: QuestionOption[];
  /** Chips answers are multi-select; choice answers are single. */
  multi?: boolean;
  placeholder?: string;
  /** Titles questions: how many the user may add, and what naming one means. */
  maxTitles?: number;
  impliedReaction?: Reaction;
  /** Free text is accepted alongside chips or titles. */
  allowFreeText?: boolean;
  /** True for follow-ups and repairs — these do not spend the main budget. */
  isFollowUp?: boolean;
  /** Attributes this question would teach us about. */
  teaches: string[];
}

interface Slot {
  id: string;
  stage: StageId;
  prompt: string;
  helper?: string;
  kind: QuestionKind;
  chips?: readonly ReasonChip[];
  options?: QuestionOption[];
  multi?: boolean;
  placeholder?: string;
  maxTitles?: number;
  impliedReaction?: Reaction;
  allowFreeText?: boolean;
  /** In the quick interview? */
  quick: boolean;
  /** Always ask, even when the ground looks covered. */
  required?: boolean;
  teaches: string[];
  relevantWhen?: (f: Facts) => boolean;
}

/** Everything a slot may consult when deciding whether it is worth asking. */
export interface Facts {
  answers: Record<string, string>;
  profile: VoiceProfile;
  claims: Claim[];
  mode: InterviewMode;
  /** Evidence already held from imports/quiz, keyed by attribute. */
  priorEvidence: Record<string, number>;
}

const chipOptions = (chips: readonly ReasonChip[]): QuestionOption[] =>
  chips.map((c) => ({ value: c.value, label: c.label }));

const chipTeaches = (chips: readonly ReasonChip[]): string[] =>
  Array.from(new Set(chips.map((c) => c.attribute).filter((a): a is string => Boolean(a))));

/** Has the user given us any evidence on this attribute yet? */
function evidenceOf(f: Facts, key: string): number {
  return (f.profile.attributes[key]?.evidence ?? 0) + (f.priorEvidence[key] ?? 0);
}

// ── The slots ──────────────────────────────────────────────────────────────

const SLOTS: readonly Slot[] = [
  {
    id: 'fav_titles',
    stage: 'favourites',
    prompt: 'What are three films or shows you absolutely loved?',
    helper: 'One is plenty to start. Add them one at a time — I will ask what you loved about each.',
    kind: 'titles',
    maxTitles: 3,
    impliedReaction: 'loved',
    allowFreeText: true,
    placeholder: 'Search for a title, or just type it',
    quick: true,
    required: true,
    teaches: [],
  },
  {
    id: 'dislike_title',
    stage: 'dislikes',
    prompt: 'What is something you expected to like but didn’t?',
    helper: 'This is usually more useful than what you loved.',
    kind: 'titles',
    maxTitles: 1,
    impliedReaction: 'disliked',
    allowFreeText: true,
    placeholder: 'Search for a title, or just type it',
    quick: true,
    required: true,
    teaches: [],
  },
  {
    id: 'popular_dislike',
    stage: 'dislikes',
    prompt: 'What is something everyone raves about that you could not stand?',
    kind: 'titles',
    maxTitles: 1,
    impliedReaction: 'hated',
    allowFreeText: true,
    placeholder: 'Search for a title, or just type it',
    quick: false,
    teaches: [],
  },
  {
    id: 'dnf_title',
    stage: 'abandoned',
    prompt: 'What have you stopped watching before the end?',
    helper: 'Giving up is not the same as disliking, and I will not treat it that way.',
    kind: 'titles',
    maxTitles: 1,
    impliedReaction: 'abandoned',
    allowFreeText: true,
    placeholder: 'Search for a title, or just type it',
    quick: false,
    teaches: [],
  },
  {
    id: 'genres',
    stage: 'genres',
    prompt: 'Which kinds of story usually pull you in?',
    helper: 'Pick as many as fit.',
    kind: 'chips',
    chips: GENRE_CHIPS,
    multi: true,
    allowFreeText: true,
    quick: true,
    required: true,
    teaches: chipTeaches(GENRE_CHIPS),
  },
  {
    id: 'tone',
    stage: 'genres',
    prompt: 'After a hard day, what do you reach for?',
    kind: 'choice',
    chips: TONE_OPTIONS,
    quick: true,
    teaches: chipTeaches(TONE_OPTIONS),
  },
  {
    id: 'comedy_check',
    stage: 'genres',
    prompt: 'Does everything need a bit of humour in it?',
    helper: 'You have not mentioned comedy either way, so I am guessing.',
    kind: 'choice',
    chips: COMEDY_OPTIONS,
    quick: false,
    teaches: chipTeaches(COMEDY_OPTIONS),
    // Exactly the adaptive case: ask only when comedy is a genuine blank.
    relevantWhen: (f) => evidenceOf(f, 'comedy') <= 0,
  },
  {
    id: 'dealbreakers',
    stage: 'dealbreakers',
    prompt: 'What can ruin a film or show for you?',
    helper: 'I will ask how badly for each one — not everything you pick becomes a ban.',
    kind: 'chips',
    chips: DEALBREAKER_CHIPS,
    multi: true,
    allowFreeText: true,
    quick: true,
    required: true,
    teaches: chipTeaches(DEALBREAKER_CHIPS),
  },
  ...FORMAT_QUESTIONS.map<Slot>((q) => ({
    id: q.id,
    stage: 'format' as const,
    prompt: q.prompt,
    kind: 'choice' as const,
    chips: q.options,
    quick: false,
    teaches: chipTeaches(q.options),
    ...(q.relevantWhen ? { relevantWhen: (f: Facts) => q.relevantWhen!(f.answers) } : {}),
  })),
  {
    id: 'exception_open',
    stage: 'exceptions',
    prompt: 'Is there a genre you claim to hate but keep making exceptions for?',
    helper: 'Exceptions tell me more than rules do.',
    kind: 'open',
    placeholder: 'e.g. I hate sci-fi but I loved Arrival',
    quick: false,
    teaches: [],
  },
  {
    id: 'rewatch_title',
    stage: 'rewatch',
    prompt: 'What would you happily watch again?',
    kind: 'titles',
    maxTitles: 1,
    impliedReaction: 'loved',
    allowFreeText: true,
    placeholder: 'Search for a title, or just type it',
    quick: false,
    teaches: [],
  },
  {
    id: 'guilty_pleasure',
    stage: 'rewatch',
    prompt: 'What do you enjoy even though it does not fit your usual taste?',
    helper: 'No judgement — this is often the most useful answer in the whole interview.',
    kind: 'open',
    placeholder: 'e.g. I will watch any daft disaster movie',
    quick: false,
    teaches: [],
  },
];

export const ALL_SLOTS = SLOTS;

// ── Follow-up ids ──────────────────────────────────────────────────────────

export const SEP = '|';

export function isFollowUp(id: string): boolean {
  return id.includes(SEP);
}

export function followUpId(kind: string, ...parts: string[]): string {
  return [kind, ...parts].join(SEP);
}

export function parseFollowUpId(id: string): { kind: string; a: string; b: string } | null {
  const parts = id.split(SEP);
  if (parts.length < 2) return null;
  return { kind: parts[0] ?? '', a: parts[1] ?? '', b: parts[2] ?? '' };
}

export const conflictQuestionId = (c: Conflict) =>
  followUpId('conflict', c.positiveClaimId, c.negativeClaimId);
export const exceptionQuestionId = (ruleClaimId: string, exceptionClaimId: string) =>
  followUpId('exception', ruleClaimId, exceptionClaimId);

// ── Information gain ───────────────────────────────────────────────────────

export function uncertainty(f: Facts, key: string): number {
  return CONFIDENCE_HALF / (evidenceOf(f, key) + CONFIDENCE_HALF);
}

/** How much a slot could still teach us. Title slots always retain value. */
export function expectedGain(slot: Slot, f: Facts): number {
  if (slot.kind === 'titles' || slot.kind === 'open') {
    // A named title teaches things no dial can, but a fifth one teaches less.
    return 1.2 / (1 + f.profile.titles.length * 0.5) + 0.3;
  }
  if (slot.teaches.length === 0) return 0.5;
  let g = 0;
  for (const key of slot.teaches) g += uncertainty(f, key);
  return g / Math.sqrt(slot.teaches.length);
}

// ── Follow-up derivation ───────────────────────────────────────────────────

/** Title claims still owed a "why", oldest first. */
export function pendingWhy(f: Facts, asked: Set<string>): Claim[] {
  return f.claims.filter(
    (c) =>
      c.attribute === null &&
      c.title &&
      c.reaction &&
      !c.unactionable &&
      !asked.has(followUpId('why', c.id)),
  );
}

/** Abandoned titles still owed a "how far did you get". */
function pendingProgress(f: Facts, asked: Set<string>): Claim[] {
  return f.claims.filter(
    (c) =>
      c.reaction === 'abandoned' &&
      c.watchedFraction === undefined &&
      !asked.has(followUpId('dnf_progress', c.id)),
  );
}

/** Deal-breakers picked but not yet graded. */
export function pendingStrength(f: Facts, asked: Set<string>): string[] {
  const picked = decodeChips(f.answers.dealbreakers ?? '');
  return picked.filter((v) => !asked.has(followUpId('db_strength', v)));
}

/** The genre they leaned on hardest that we can go deeper on. */
export function depthGenre(f: Facts, asked: Set<string>): string | null {
  const picked = decodeChips(f.answers.genres ?? '');
  const candidates = picked.filter((v) => GENRE_DEPTH[v] && !asked.has(followUpId('genre_depth', v)));
  if (candidates.length === 0) return null;
  // Prefer the one with the most supporting evidence from the titles they named.
  let best = candidates[0] ?? null;
  let bestEv = -1;
  for (const v of candidates) {
    const chip = GENRE_CHIPS.find((c) => c.value === v);
    const ev = chip?.attribute ? evidenceOf(f, chip.attribute) : 0;
    if (ev > bestEv) { bestEv = ev; best = v; }
  }
  return best;
}

// ── Question construction ──────────────────────────────────────────────────

function toQuestion(slot: Slot): VoiceQuestion {
  return {
    id: slot.id,
    stage: slot.stage,
    stageLabel: STAGE_LABEL[slot.stage],
    prompt: slot.prompt,
    kind: slot.kind,
    teaches: slot.teaches,
    ...(slot.helper ? { helper: slot.helper } : {}),
    ...(slot.options ? { options: slot.options } : {}),
    ...(slot.chips ? { options: chipOptions(slot.chips) } : {}),
    ...(slot.multi ? { multi: true } : {}),
    ...(slot.placeholder ? { placeholder: slot.placeholder } : {}),
    ...(slot.maxTitles ? { maxTitles: slot.maxTitles } : {}),
    ...(slot.impliedReaction ? { impliedReaction: slot.impliedReaction } : {}),
    ...(slot.allowFreeText ? { allowFreeText: true } : {}),
  };
}

/** The reason vocabulary for a title, chosen by what the reaction was. */
export function whyChipsFor(claim: Claim, genres?: string[]): readonly ReasonChip[] {
  switch (claim.reaction) {
    case 'disliked':
    case 'hated':
      return DISLIKE_REASONS;
    case 'abandoned':
      return DNF_REASONS;
    default:
      return loveReasonsFor(genres);
  }
}

function whyPrompt(claim: Claim): string {
  const t = claim.title?.text ?? 'it';
  switch (claim.reaction) {
    case 'disliked':
    case 'hated':
      return `What did not work about ${t}?`;
    case 'abandoned':
      return `What made you give up on ${t}?`;
    default:
      return `What did you love most about ${t}?`;
  }
}

function whyQuestion(claim: Claim, genres: string[] | undefined, stage: StageId): VoiceQuestion {
  const chips = whyChipsFor(claim, genres);
  return {
    id: followUpId('why', claim.id),
    stage,
    stageLabel: STAGE_LABEL[stage],
    prompt: whyPrompt(claim),
    helper: 'Pick everything that applies. Add anything else in your own words.',
    kind: 'chips',
    multi: true,
    allowFreeText: true,
    isFollowUp: true,
    options: chipOptions(chips),
    teaches: chipTeaches(chips),
    placeholder: 'Anything else?',
  };
}

function progressQuestion(claim: Claim): VoiceQuestion {
  return {
    id: followUpId('dnf_progress', claim.id),
    stage: 'abandoned',
    stageLabel: STAGE_LABEL.abandoned,
    prompt: `How far into ${claim.title?.text ?? 'it'} did you get?`,
    helper: 'Bailing in the first ten minutes says more than stopping near the end.',
    kind: 'choice',
    isFollowUp: true,
    options: DNF_PROGRESS.map((p) => ({ value: p.value ?? 'some', label: p.label })),
    teaches: [],
  };
}

function strengthQuestion(dealbreaker: string): VoiceQuestion {
  const chip = DEALBREAKER_CHIPS.find((c) => c.value === dealbreaker);
  return {
    id: followUpId('db_strength', dealbreaker),
    stage: 'dealbreakers',
    stageLabel: STAGE_LABEL.dealbreakers,
    prompt: `${chip?.label ?? dealbreaker} — how bad is it?`,
    helper: 'Only the first option means never recommend.',
    kind: 'choice',
    isFollowUp: true,
    options: DEALBREAKER_STRENGTHS.map((s) => ({ value: s.value, label: s.label, hint: s.hint })),
    teaches: chip?.attribute ? [chip.attribute] : [],
  };
}

function depthQuestion(genreValue: string): VoiceQuestion {
  const chips = GENRE_DEPTH[genreValue] ?? [];
  const label = GENRE_CHIPS.find((c) => c.value === genreValue)?.label ?? genreValue;
  return {
    id: followUpId('genre_depth', genreValue),
    stage: 'genres',
    stageLabel: STAGE_LABEL.genres,
    prompt: `You picked ${label.toLowerCase()}. What matters most in one?`,
    kind: 'chips',
    multi: true,
    isFollowUp: true,
    allowFreeText: true,
    options: chipOptions(chips),
    teaches: chipTeaches(chips),
    placeholder: 'Anything else?',
  };
}

function conflictQuestion(c: Conflict): VoiceQuestion {
  return {
    id: conflictQuestionId(c),
    stage: 'exceptions',
    stageLabel: STAGE_LABEL.exceptions,
    prompt: c.question,
    helper: 'You told me both. I would rather ask than guess.',
    kind: 'choice',
    isFollowUp: true,
    options: c.options,
    teaches: [c.attribute],
  };
}

function exceptionQuestion(ruleAttribute: string, titleText: string, id: string): VoiceQuestion {
  return {
    id,
    stage: 'exceptions',
    stageLabel: STAGE_LABEL.exceptions,
    prompt: `You avoid ${attributePhrase(ruleAttribute)}, but ${titleText} worked for you. Is that an exception?`,
    helper: 'I noticed this — you did not say it. Tell me which it is.',
    kind: 'choice',
    isFollowUp: true,
    options: [
      { value: 'exception', label: `Yes — ${titleText} is an exception`, hint: 'The rule stands, with a carve-out' },
      { value: 'rule_wrong', label: `No — I do not really avoid ${attributePhrase(ruleAttribute)}` },
      { value: 'title_wrong', label: `No — I did not actually like ${titleText}` },
    ],
    teaches: [ruleAttribute],
  };
}

// ── Selection ──────────────────────────────────────────────────────────────

export interface QuestionState extends Facts {
  asked: string[];
}

/** Titles the user named, with whatever genres came back from search. */
export function genresForClaim(state: QuestionState, claim: Claim): string[] | undefined {
  const id = claim.title?.titleId;
  if (!id) return undefined;
  for (const value of Object.values(state.answers)) {
    if (!value.startsWith('{')) continue;
    const hit = decodeTitles(value).titles.find((t) => t.titleId === id);
    if (hit?.genres?.length) return hit.genres;
  }
  return undefined;
}

function mainAskedCount(asked: string[]): number {
  return asked.filter((id) => !isFollowUp(id)).length;
}

/** Slots this mode would ask, in stage order. */
function slotsFor(mode: InterviewMode): Slot[] {
  const byStage = new Map(STAGE_ORDER.map((s, i) => [s, i]));
  return SLOTS.filter((s) => mode === 'full' || s.quick).sort(
    (a, b) => (byStage.get(a.stage) ?? 0) - (byStage.get(b.stage) ?? 0),
  );
}

/**
 * The next question, or null when the interview is done.
 *
 * Order of business:
 *   1. contradictions and unstated exceptions — repair before building
 *   2. follow-ups owed on what was just said — while it is still in mind
 *   3. the next worthwhile slot in the earliest incomplete stage
 */
export function nextQuestion(state: QuestionState): VoiceQuestion | null {
  const asked = new Set(state.asked);

  // 1. Repairs.
  for (const c of state.profile.conflicts) {
    if (!asked.has(conflictQuestionId(c))) return conflictQuestion(c);
  }
  for (const e of unconfirmedExceptions(state.profile, state.claims)) {
    const id = exceptionQuestionId(e.ruleClaimId, e.exceptionClaimId);
    if (asked.has(id) || !e.title?.text) continue;
    return exceptionQuestion(e.ruleAttribute, e.title.text, id);
  }

  // 2. Follow-ups owed. "How far did you get" comes before "why", because the
  //    answer changes how much the reasons are worth.
  for (const claim of pendingProgress(state, asked)) return progressQuestion(claim);

  const whyBudget = MAX_WHY_FOLLOWUPS[state.mode];
  const whyAsked = state.asked.filter((id) => id.startsWith(`why${SEP}`)).length;
  if (whyAsked < whyBudget) {
    const owed = pendingWhy(state, asked)[0];
    if (owed) {
      const stage: StageId =
        owed.reaction === 'abandoned' ? 'abandoned'
        : owed.reaction === 'disliked' || owed.reaction === 'hated' ? 'dislikes'
        : 'favourites';
      return whyQuestion(owed, genresForClaim(state, owed), stage);
    }
  }

  const strengthBudget = MAX_STRENGTH_FOLLOWUPS[state.mode];
  const strengthAsked = state.asked.filter((id) => id.startsWith(`db_strength${SEP}`)).length;
  if (strengthAsked < strengthBudget) {
    const owed = pendingStrength(state, asked)[0];
    if (owed) return strengthQuestion(owed);
  }

  const depth = depthGenre(state, asked);
  if (depth) return depthQuestion(depth);

  // 3. The next slot worth asking.
  if (mainAskedCount(state.asked) >= MAIN_COUNT[state.mode]) return null;

  for (const slot of slotsFor(state.mode)) {
    if (asked.has(slot.id)) continue;
    if (slot.relevantWhen && !slot.relevantWhen(state)) continue;
    // Already covered? Skip it — an interview that asks what it knows is a form.
    if (!slot.required && expectedGain(slot, state) < GAIN_FLOOR) continue;
    return toQuestion(slot);
  }

  return null;
}

export interface Progress {
  /** Main questions answered, capped at the budget. */
  asked: number;
  total: number;
  /** Follow-ups and repairs still owed. */
  pending: number;
  /** Where we are on the progress rail. */
  stageLabel: string;
  stageIndex: number;
  stageCount: number;
}

export function progress(state: QuestionState): Progress {
  const q = nextQuestion(state);
  const label = q?.stageLabel ?? 'Review';
  const asked = new Set(state.asked);
  const pending =
    state.profile.conflicts.filter((c) => !asked.has(conflictQuestionId(c))).length +
    unconfirmedExceptions(state.profile, state.claims).filter(
      (e) => !asked.has(exceptionQuestionId(e.ruleClaimId, e.exceptionClaimId)),
    ).length +
    pendingWhy(state, asked).length +
    pendingStrength(state, asked).length;

  return {
    asked: Math.min(mainAskedCount(state.asked), MAIN_COUNT[state.mode]),
    total: MAIN_COUNT[state.mode],
    pending,
    stageLabel: label,
    stageIndex: Math.max(0, PROGRESS_LABELS.indexOf(label)),
    stageCount: PROGRESS_LABELS.length,
  };
}

/**
 * The chip vocabulary a given question was asked with, so an answer can be
 * mapped back to attributes. Returns null for questions that are not chip-based
 * (`db_strength` and `dnf_progress` carry their own vocabularies).
 */
export function chipsForQuestionId(
  state: QuestionState,
  id: string,
): readonly ReasonChip[] | null {
  const fu = parseFollowUpId(id);
  if (fu) {
    if (fu.kind === 'why') {
      const claim = state.claims.find((c) => c.id === fu.a);
      if (!claim) return null;
      return whyChipsFor(claim, genresForClaim(state, claim));
    }
    if (fu.kind === 'genre_depth') return GENRE_DEPTH[fu.a] ?? null;
    return null;
  }
  return slot(id)?.chips ?? null;
}

/** Look a main slot up by id. Follow-ups are constructed, not stored. */
export function slot(id: string): Slot | undefined {
  return SLOTS.find((s) => s.id === id);
}
