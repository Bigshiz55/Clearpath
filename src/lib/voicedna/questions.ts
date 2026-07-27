/**
 * WITNESS TESTIMONY — the question orchestrator.
 *
 * Ten steps, each owning one main question plus whatever follow-ups that answer
 * earns. The counter the user sees is the step index, and follow-ups never move
 * it: an interviewer who says "question fourteen of twenty" is running a form.
 *
 * What makes it a conversation rather than a questionnaire:
 *
 *   * Naming a title earns a "why" about THAT title, with chips chosen from
 *     what the title actually is — Sherlock gets deduction and the cases.
 *   * Two or more reasons earn a summary the user can correct: "So it was the
 *     puzzle-solving more than the setting?"
 *   * Something we heard but could not read a direction from earns a plain
 *     question rather than a guess.
 *   * Deal-breakers are graded before any of them becomes a ban.
 *   * A contradiction interrupts everything, and is put to the user directly.
 *
 * The next question is a pure function of the answers so far — no cursor, no
 * queue — which is what makes Back, restore and testing all trivial.
 */
import type { Claim, Conflict, Reaction, VoiceProfile } from './types';
import { CONFIDENCE_HALF, unconfirmedExceptions } from './profile';
import { attributeLabel, attributePhrase } from './lexicon';
import { decodeChips, decodeTitles } from './answerCodec';
import { MAIN_MAX, STEPS, STEP_BY_ID, TRANSITIONS, type StepId } from './steps';
import {
  COMEDY_OPTIONS, DEALBREAKER_CHIPS, DEALBREAKER_STRENGTHS, DISLIKE_REASONS, DNF_PROGRESS,
  DNF_REASONS, FORMAT_QUESTIONS, GENRE_CHIPS, GENRE_DEPTH, aspectLabel, loveReasonsFor,
  type ReasonChip,
} from './reasons';

export { MAIN_MAX, STEPS, type StepId } from './steps';

/** Per-title "why" follow-ups before it starts to feel like an audit. */
export const MAX_WHY = 3;
/** Deal-breakers graded individually. The rest keep their default strength. */
export const MAX_STRENGTH = 3;
/** Enough coverage to offer an early finish. */
export const READY_COVERAGE = 0.55;

export type QuestionKind = 'titles' | 'chips' | 'choice' | 'open' | 'card';

export interface QuestionOption {
  value: string;
  label: string;
  hint?: string;
}

export interface VoiceQuestion {
  id: string;
  step: StepId;
  /** 1..10 — what the counter shows. Follow-ups keep their parent's number. */
  stepIndex: number;
  stepLabel: string;
  /** A short conversational bridge, shown above the question. */
  transition?: string;
  prompt: string;
  helper?: string;
  kind: QuestionKind;
  options?: QuestionOption[];
  multi?: boolean;
  placeholder?: string;
  maxTitles?: number;
  impliedReaction?: Reaction;
  allowFreeText?: boolean;
  /** True for anything that is not the step's main question. */
  isFollowUp?: boolean;
  teaches: string[];
}

/** Everything the orchestrator may consult. */
export interface QuestionState {
  answers: Record<string, string>;
  asked: string[];
  profile: VoiceProfile;
  claims: Claim[];
  /** Evidence already held from an import or the quiz, keyed by attribute. */
  priorEvidence: Record<string, number>;
  /** Extra depth the user asked for. Adds follow-ups, never main questions. */
  extraDepth?: number;
}

const chipOptions = (chips: readonly ReasonChip[]): QuestionOption[] =>
  chips.map((c) => ({ value: c.value, label: c.label }));

const chipTeaches = (chips: readonly ReasonChip[]): string[] =>
  Array.from(new Set(chips.map((c) => c.attribute).filter((a): a is string => Boolean(a))));

function evidenceOf(s: QuestionState, key: string): number {
  return (s.profile.attributes[key]?.evidence ?? 0) + (s.priorEvidence[key] ?? 0);
}

export function uncertainty(s: QuestionState, key: string): number {
  return CONFIDENCE_HALF / (evidenceOf(s, key) + CONFIDENCE_HALF);
}

// ── Follow-up ids ──────────────────────────────────────────────────────────

export const SEP = '|';
export const isFollowUp = (id: string) => id.includes(SEP);
export const followUpId = (kind: string, ...parts: string[]) => [kind, ...parts].join(SEP);

export function parseFollowUpId(id: string): { kind: string; a: string; b: string } | null {
  const parts = id.split(SEP);
  if (parts.length < 2) return null;
  return { kind: parts[0] ?? '', a: parts[1] ?? '', b: parts[2] ?? '' };
}

export const conflictQuestionId = (c: Conflict) =>
  followUpId('conflict', c.positiveClaimId, c.negativeClaimId);
export const exceptionQuestionId = (rule: string, ex: string) => followUpId('exception', rule, ex);

// ── Shared option sets ─────────────────────────────────────────────────────

/**
 * Clarification wording is always context-specific. Generic buttons like
 * "Backwards" or "Drop it" force the user to reverse-engineer our data model
 * before they can answer, which is the opposite of an interview.
 */
export const AGREEMENT_OPTIONS: QuestionOption[] = [
  { value: 'exactly', label: 'Exactly' },
  { value: 'mostly', label: 'Mostly' },
  { value: 'not_quite', label: 'Not quite' },
];

export const DIRECTION_OPTIONS: QuestionOption[] = [
  { value: 'positive', label: 'I liked it' },
  { value: 'negative', label: 'I disliked it' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'not_meant', label: 'That is not what I meant' },
];

// ── Helpers over the claim set ─────────────────────────────────────────────

const titleClaims = (s: QuestionState, filter: (c: Claim) => boolean) =>
  s.claims.filter((c) => c.attribute === null && !c.aspect && !c.unresolved && c.title && filter(c));

const positiveTitles = (s: QuestionState) =>
  titleClaims(s, (c) => c.reaction === 'loved' || c.reaction === 'liked');

/** Genres the search API returned for a title the user picked. */
export function genresForClaim(s: QuestionState, claim: Claim): string[] | undefined {
  const id = claim.title?.titleId;
  if (!id) return undefined;
  for (const value of Object.values(s.answers)) {
    if (!value.startsWith('{')) continue;
    const hit = decodeTitles(value).titles.find((t) => t.titleId === id);
    if (hit?.genres?.length) return hit.genres;
  }
  return undefined;
}

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

// ── Question builders ──────────────────────────────────────────────────────

function base(step: StepId, isFollowUp = false): Pick<VoiceQuestion, 'step' | 'stepIndex' | 'stepLabel' | 'isFollowUp' | 'transition'> {
  const meta = STEP_BY_ID.get(step)!;
  const transition = isFollowUp ? undefined : TRANSITIONS[step];
  return {
    step,
    stepIndex: meta.index,
    stepLabel: meta.label,
    ...(isFollowUp ? { isFollowUp: true } : {}),
    ...(transition ? { transition } : {}),
  };
}

function whyPrompt(claim: Claim): string {
  const t = claim.title?.text ?? 'it';
  switch (claim.reaction) {
    case 'disliked':
    case 'hated':
      return `What let you down about ${t}?`;
    case 'abandoned':
      return `What made you stop watching ${t}?`;
    default:
      return `What did you love most about ${t}?`;
  }
}

function whyQuestion(s: QuestionState, claim: Claim, step: StepId, isFollow: boolean): VoiceQuestion {
  const chips = whyChipsFor(claim, genresForClaim(s, claim));
  return {
    ...base(step, isFollow),
    id: followUpId('why', claim.id),
    prompt: whyPrompt(claim),
    helper: 'Pick whatever fits, or say it your own way.',
    kind: 'chips',
    multi: true,
    allowFreeText: true,
    options: chipOptions(chips),
    teaches: chipTeaches(chips),
    placeholder: 'Anything else?',
  };
}

/** "So it was less about X and more about Y. Is that right?" */
function summaryQuestion(s: QuestionState, claim: Claim): VoiceQuestion | null {
  const reasons = s.claims.filter(
    (c) => c.title?.text === claim.title?.text && c.attribute !== null && c.strength > 0,
  );
  if (reasons.length < 2) return null;
  const ranked = [...reasons].sort((a, b) => b.strength - a.strength).slice(0, 2);
  const names = ranked.map((c) => attributeLabel(c.attribute!).toLowerCase());
  return {
    ...base('favourite_why', true),
    id: followUpId('summary', claim.id),
    prompt: `So with ${claim.title?.text}, it was mostly ${names.join(' and ')}. Have I got that right?`,
    kind: 'choice',
    options: AGREEMENT_OPTIONS,
    teaches: [],
  };
}

/** Something we heard but could not read a direction from. */
function clarifyQuestion(claim: Claim): VoiceQuestion {
  const part = claim.aspect ? `the ${aspectLabel(claim.aspect)}` : 'that';
  const where = claim.title?.text ? ` in ${claim.title.text}` : '';
  return {
    ...base('disappointment', true),
    id: followUpId('clarify', claim.id),
    prompt: `How did you feel about ${part}${where}?`,
    helper: 'I want to make sure I understood this.',
    kind: 'choice',
    options: DIRECTION_OPTIONS,
    teaches: [],
  };
}

function progressQuestion(claim: Claim): VoiceQuestion {
  return {
    ...base('quit', true),
    id: followUpId('dnf_progress', claim.id),
    prompt: `How far into ${claim.title?.text ?? 'it'} did you get?`,
    kind: 'choice',
    options: DNF_PROGRESS.map((p) => ({ value: p.value ?? 'some', label: p.label })),
    teaches: [],
  };
}

function strengthQuestion(dealbreaker: string): VoiceQuestion {
  const chip = DEALBREAKER_CHIPS.find((c) => c.value === dealbreaker);
  return {
    ...base('dealbreakers', true),
    id: followUpId('db_strength', dealbreaker),
    prompt: `${chip?.label ?? dealbreaker} — how strong is that for you?`,
    kind: 'choice',
    options: DEALBREAKER_STRENGTHS.map((x) => ({ value: x.value, label: x.label, hint: x.hint })),
    teaches: chip?.attribute ? [chip.attribute] : [],
  };
}

function depthQuestion(genreValue: string): VoiceQuestion {
  const chips = GENRE_DEPTH[genreValue] ?? [];
  const label = GENRE_CHIPS.find((c) => c.value === genreValue)?.label ?? genreValue;
  return {
    ...base('story_types', true),
    id: followUpId('genre_depth', genreValue),
    prompt: `You picked ${label.toLowerCase()}. What matters most in one?`,
    kind: 'chips',
    multi: true,
    allowFreeText: true,
    options: chipOptions(chips),
    teaches: chipTeaches(chips),
    placeholder: 'Anything else?',
  };
}

function conflictQuestion(c: Conflict): VoiceQuestion {
  return {
    ...base('exception', true),
    id: conflictQuestionId(c),
    prompt: c.question,
    helper: 'You told me both — I would rather ask than guess.',
    kind: 'choice',
    options: c.options,
    teaches: [c.attribute],
  };
}

function exceptionQuestion(ruleAttribute: string, titleText: string, id: string): VoiceQuestion {
  return {
    ...base('exception', true),
    id,
    prompt: `You usually avoid ${attributePhrase(ruleAttribute)}, but ${titleText} worked. Was the rest of it strong enough that it did not matter?`,
    kind: 'choice',
    options: [
      { value: 'exception', label: 'Exactly — it is an exception' },
      { value: 'rule_wrong', label: `Partly — I do not really avoid ${attributePhrase(ruleAttribute)}` },
      { value: 'title_wrong', label: `No, something else — I did not really like ${titleText}` },
    ],
    teaches: [ruleAttribute],
  };
}

// ── The ten steps ──────────────────────────────────────────────────────────

interface StepDef {
  id: StepId;
  /** The main question, or null when this step has nothing to ask. */
  main: (s: QuestionState) => VoiceQuestion | null;
  /** The next follow-up owed inside this step, or null. */
  follow: (s: QuestionState, asked: Set<string>) => VoiceQuestion | null;
}

function pendingWhy(s: QuestionState, asked: Set<string>, filter: (c: Claim) => boolean): Claim | null {
  return titleClaims(s, filter).find((c) => !asked.has(followUpId('why', c.id))) ?? null;
}

function pendingClarify(s: QuestionState, asked: Set<string>): Claim | null {
  return s.claims.find((c) => c.unresolved && !asked.has(followUpId('clarify', c.id))) ?? null;
}

const STEP_DEFS: readonly StepDef[] = [
  {
    id: 'favourites',
    main: () => ({
      ...base('favourites'),
      id: 'favourites',
      prompt: 'Let’s start easy. What are two or three films or shows you absolutely love?',
      helper: 'Search for each one so I get the right version.',
      kind: 'titles',
      maxTitles: 3,
      impliedReaction: 'loved',
      allowFreeText: true,
      placeholder: 'Start typing a title',
      teaches: [],
    }),
    follow: () => null,
  },
  {
    id: 'favourite_why',
    main: (s) => {
      const first = positiveTitles(s)[0];
      return first ? whyQuestion(s, first, 'favourite_why', false) : null;
    },
    follow: (s, asked) => {
      const owed = pendingWhy(s, asked, (c) => c.reaction === 'loved' || c.reaction === 'liked');
      const whyCount = s.asked.filter((id) => id.startsWith(`why${SEP}`)).length;
      if (owed && whyCount < MAX_WHY + (s.extraDepth ?? 0)) {
        return whyQuestion(s, owed, 'favourite_why', true);
      }
      for (const c of positiveTitles(s)) {
        if (asked.has(followUpId('summary', c.id))) continue;
        if (!asked.has(followUpId('why', c.id))) continue;
        const q = summaryQuestion(s, c);
        if (q) return q;
      }
      return null;
    },
  },
  {
    id: 'disappointment',
    main: () => ({
      ...base('disappointment'),
      id: 'disappointment',
      prompt: 'What is something you expected to enjoy but ended up disliking?',
      kind: 'titles',
      maxTitles: 1,
      impliedReaction: 'disliked',
      allowFreeText: true,
      placeholder: 'Start typing a title',
      teaches: [],
    }),
    follow: (s, asked) => {
      const clarify = pendingClarify(s, asked);
      if (clarify) return clarifyQuestion(clarify);
      const owed = pendingWhy(s, asked, (c) => c.reaction === 'disliked' || c.reaction === 'hated');
      return owed ? whyQuestion(s, owed, 'disappointment', true) : null;
    },
  },
  {
    id: 'quit',
    main: () => ({
      ...base('quit'),
      id: 'quit',
      prompt: 'What makes you stop watching something part-way through?',
      helper: 'Name a title if one comes to mind, or answer generally.',
      kind: 'titles',
      maxTitles: 1,
      impliedReaction: 'abandoned',
      allowFreeText: true,
      placeholder: 'A title, or just tell me',
      teaches: [],
    }),
    follow: (s, asked) => {
      const noProgress = s.claims.find(
        (c) => c.reaction === 'abandoned' && c.watchedFraction === undefined
          && !asked.has(followUpId('dnf_progress', c.id)),
      );
      if (noProgress) return progressQuestion(noProgress);
      const owed = pendingWhy(s, asked, (c) => c.reaction === 'abandoned');
      return owed ? whyQuestion(s, owed, 'quit', true) : null;
    },
  },
  {
    id: 'story_types',
    main: () => ({
      ...base('story_types'),
      id: 'story_types',
      prompt: 'What kinds of story pull you in fastest?',
      helper: 'Pick as many as fit.',
      kind: 'chips',
      multi: true,
      allowFreeText: true,
      options: chipOptions(GENRE_CHIPS),
      teaches: chipTeaches(GENRE_CHIPS),
    }),
    follow: (s, asked) => {
      const picked = decodeChips(s.answers.story_types ?? '');
      const candidates = picked.filter((v) => GENRE_DEPTH[v] && !asked.has(followUpId('genre_depth', v)));
      if (candidates.length === 0) return null;
      // Go deeper on the one their titles already support most.
      let best = candidates[0]!;
      let bestEv = -1;
      for (const v of candidates) {
        const attr = GENRE_CHIPS.find((c) => c.value === v)?.attribute;
        const ev = attr ? evidenceOf(s, attr) : 0;
        if (ev > bestEv) { bestEv = ev; best = v; }
      }
      // Only one depth question per interview unless they asked to go deeper.
      const asked_depth = s.asked.filter((id) => id.startsWith(`genre_depth${SEP}`)).length;
      return asked_depth < 1 + (s.extraDepth ?? 0) ? depthQuestion(best) : null;
    },
  },
  {
    id: 'dealbreakers',
    main: () => ({
      ...base('dealbreakers'),
      id: 'dealbreakers',
      prompt: 'What can ruin an otherwise good film or show for you?',
      helper: 'Pick up to three. I will ask how strong each one is.',
      kind: 'chips',
      multi: true,
      allowFreeText: true,
      options: chipOptions(DEALBREAKER_CHIPS),
      teaches: chipTeaches(DEALBREAKER_CHIPS),
    }),
    follow: (s, asked) => {
      const picked = decodeChips(s.answers.dealbreakers ?? '').slice(0, MAX_STRENGTH);
      const owed = picked.find((v) => !asked.has(followUpId('db_strength', v)));
      return owed ? strengthQuestion(owed) : null;
    },
  },
  {
    id: 'format',
    main: (s) => {
      // ONE combined format question. Walking the whole list would eat the
      // ten-question budget and push the movie check off the end entirely.
      if (FORMAT_QUESTIONS.some((f) => s.asked.includes(f.id))) return null;
      const q = FORMAT_QUESTIONS.find(
        (f) => !s.asked.includes(f.id)
          && (!f.relevantWhen || f.relevantWhen(s.answers))
          && chipTeaches(f.options).some((k) => evidenceOf(s, k) <= 0),
      );
      if (!q) return null;
      return {
        ...base('format'),
        id: q.id,
        prompt: q.prompt,
        kind: 'choice',
        options: q.options.map((o) => ({ value: o.value, label: o.label })),
        teaches: chipTeaches(q.options),
      };
    },
    follow: (s) => {
      if (evidenceOf(s, 'comedy') > 0 || s.asked.includes('comedy_check')) return null;
      return {
        ...base('format', true),
        id: 'comedy_check',
        prompt: 'And does everything need a bit of humour in it?',
        kind: 'choice',
        options: COMEDY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
        teaches: ['comedy'],
      };
    },
  },
  {
    id: 'exception',
    main: () => ({
      ...base('exception'),
      id: 'exception',
      prompt: 'What is something you loved even though it normally would not fit your taste?',
      helper: 'Exceptions tell me more than rules do.',
      kind: 'open',
      placeholder: 'e.g. I hate sci-fi but Severance had me from the first episode',
      teaches: [],
    }),
    follow: () => null,
  },
  {
    id: 'movie_check',
    main: () => ({
      ...base('movie_check'),
      id: 'movie_check',
      prompt: 'Does this look like you?',
      helper: 'One title, picked from what you have told me so far.',
      kind: 'card',
      teaches: [],
    }),
    follow: () => null,
  },
  {
    id: 'final_word',
    main: () => ({
      ...base('final_word'),
      id: 'final_word',
      prompt: 'Before I build your Viewer DNA — what do recommendation apps usually get wrong about your taste?',
      kind: 'open',
      placeholder: 'Say it however you like',
      teaches: [],
    }),
    follow: () => null,
  },
];

// ── Selection ──────────────────────────────────────────────────────────────

/** Main questions answered or deliberately skipped so far. */
export function mainAnswered(s: QuestionState): number {
  return s.asked.filter((id) => !isFollowUp(id) && id !== 'comedy_check').length;
}

/**
 * The next question, or null when the interview is done.
 *
 * Repairs first (a contradiction left standing poisons everything after it),
 * then the current step's own business, then on to the next step.
 */
export function nextQuestion(s: QuestionState): VoiceQuestion | null {
  const asked = new Set(s.asked);

  for (const c of s.profile.conflicts) {
    if (!asked.has(conflictQuestionId(c))) return conflictQuestion(c);
  }
  for (const e of unconfirmedExceptions(s.profile, s.claims)) {
    const id = exceptionQuestionId(e.ruleClaimId, e.exceptionClaimId);
    if (asked.has(id) || !e.title?.text) continue;
    return exceptionQuestion(e.ruleAttribute, e.title.text, id);
  }

  for (const def of STEP_DEFS) {
    const main = def.main(s);
    if (main && !asked.has(main.id)) {
      if (mainAnswered(s) >= MAIN_MAX) return null;
      return main;
    }
    const follow = def.follow(s, asked);
    if (follow && !asked.has(follow.id)) return follow;
  }
  return null;
}

export interface Progress {
  /** 1..10, the number shown to the user. */
  current: number;
  total: number;
  label: string;
  /** True when the current question is a follow-up (counter must not move). */
  inFollowUp: boolean;
  /** Enough captured to offer an early finish. */
  readyToFinish: boolean;
}

export function progress(s: QuestionState): Progress {
  const q = nextQuestion(s);
  const answered = mainAnswered(s);
  return {
    current: q ? q.stepIndex : Math.min(answered, MAIN_MAX),
    total: MAIN_MAX,
    label: q?.stepLabel ?? 'Review',
    inFollowUp: q?.isFollowUp === true,
    readyToFinish:
      s.profile.coverage >= READY_COVERAGE &&
      s.profile.titles.length > 0 &&
      s.profile.conflicts.length === 0,
  };
}

/** The chip vocabulary a question was asked with, for mapping answers back. */
export function chipsForQuestionId(s: QuestionState, id: string): readonly ReasonChip[] | null {
  const fu = parseFollowUpId(id);
  if (fu) {
    if (fu.kind === 'why') {
      const claim = s.claims.find((c) => c.id === fu.a);
      return claim ? whyChipsFor(claim, genresForClaim(s, claim)) : null;
    }
    if (fu.kind === 'genre_depth') return GENRE_DEPTH[fu.a] ?? null;
    return null;
  }
  if (id === 'story_types') return GENRE_CHIPS;
  if (id === 'dealbreakers') return DEALBREAKER_CHIPS;
  if (id === 'comedy_check') return COMEDY_OPTIONS;
  return FORMAT_QUESTIONS.find((f) => f.id === id)?.options ?? null;
}
