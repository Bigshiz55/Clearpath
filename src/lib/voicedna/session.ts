/**
 * THE INTERVIEW SESSION.
 *
 * A pure reducer over an append-only answer log. `asked` and `claims` are both
 * DERIVED from the answers — never stored independently — which is what makes
 * Back trivial and correct: drop the last answer and replay. There is no undo
 * logic to get wrong, because there is nothing to undo.
 *
 * That same property gives the product three things it promises:
 *
 *   * MANDATORY REVIEW — nothing reaches Viewer DNA until the user has seen
 *     every conclusion next to the words that produced it. `canApply` enforces
 *     it, rather than the UI remembering to.
 *   * REPRODUCIBILITY — the same transcript always yields the same DNA, so a
 *     support question can be answered by replaying it.
 *   * A REFRESH COSTS NOTHING — the answer log is the whole session, so saving
 *     and restoring it is saving and restoring a list of strings.
 *
 * No I/O. Persistence wraps this; it does not live inside it.
 */
import type { Claim, Durability, VoiceProfile } from './types';
import type { KnownTitle } from './parse';
import { parseAnswer } from './parse';
import { buildProfile, mergeClaims, reveal, type BuildInput } from './profile';
import { resolveConflict } from './contradiction';
import { attributeLabel, attributePhrase, attribute as attributeDef, type AttributeSection } from './lexicon';
import { decodeChips, decodeTitles, toTitleRef } from './answerCodec';
import {
  DEALBREAKER_CHIPS, DEALBREAKER_STRENGTHS, DNF_PROGRESS, chipToClaim, findChip,
} from './reasons';
import {
  chipsForQuestionId, nextQuestion, parseFollowUpId, progress,
  type InterviewMode, type QuestionState, type VoiceQuestion,
} from './questions';

export type SessionStage = 'interview' | 'review' | 'applied';

export interface Answer {
  questionId: string;
  /** Encoded per `answerCodec`. Empty string means the question was skipped. */
  value: string;
  at: number;
}

export interface VoiceSession {
  id: string;
  mode: InterviewMode;
  stage: SessionStage;
  /** Derived from `answers`. Stored so the persisted row is self-describing. */
  asked: string[];
  answers: Answer[];
  claims: Claim[];
  startedAt: number;
  appliedAt?: number;
}

export interface SessionContext {
  now: number;
  knownTitles?: KnownTitle[];
  titleFacts?: BuildInput['titleFacts'];
  /** Evidence already held from an import or the quiz, keyed by attribute. */
  priorEvidence?: Record<string, number>;
  /** Voice sessions record a different evidence source. Defaults to typed. */
  source?: Claim['source'];
}

export function startSession(id: string, mode: InterviewMode, now: number): VoiceSession {
  return { id, mode, stage: 'interview', asked: [], answers: [], claims: [], startedAt: now };
}

export function profileOf(session: VoiceSession, ctx: SessionContext): VoiceProfile {
  return buildProfile({
    claims: session.claims,
    now: ctx.now,
    ...(ctx.titleFacts ? { titleFacts: ctx.titleFacts } : {}),
  });
}

function questionState(session: VoiceSession, ctx: SessionContext): QuestionState {
  const answers: Record<string, string> = {};
  for (const a of session.answers) answers[a.questionId] = a.value;
  return {
    mode: session.mode,
    asked: session.asked,
    answers,
    profile: profileOf(session, ctx),
    claims: session.claims,
    priorEvidence: ctx.priorEvidence ?? {},
  };
}

/** The question to put on screen now, or null when the interview is finished. */
export function currentQuestion(session: VoiceSession, ctx: SessionContext): VoiceQuestion | null {
  if (session.stage !== 'interview') return null;
  return nextQuestion(questionState(session, ctx));
}

export function sessionProgress(session: VoiceSession, ctx: SessionContext) {
  return progress(questionState(session, ctx));
}

// ── The reducer ────────────────────────────────────────────────────────────

const claimId = (session: VoiceSession, questionId: string, suffix: string) =>
  `${session.id}:${questionId}:${suffix}`;

/** Apply one answer to the claim set. Pure; returns the new claims. */
function reduceAnswer(
  session: VoiceSession,
  questionId: string,
  value: string,
  ctx: SessionContext,
): Claim[] {
  const source = ctx.source ?? 'typed_interview';
  const state = questionState(session, ctx);
  let claims = session.claims;
  if (!value) return claims; // skipped — costs nothing, teaches nothing

  const fu = parseFollowUpId(questionId);

  // ── Repairs ──────────────────────────────────────────────────────────────
  if (fu?.kind === 'conflict') {
    const conflict = state.profile.conflicts.find(
      (c) => c.positiveClaimId === fu.a && c.negativeClaimId === fu.b,
    );
    if (conflict && (value === 'positive' || value === 'negative' || value === 'depends')) {
      return resolveConflict(claims, conflict, value);
    }
    return claims;
  }

  if (fu?.kind === 'exception') {
    if (value === 'rule_wrong') return claims.filter((c) => c.id !== fu.a);
    if (value === 'title_wrong') return claims.filter((c) => c.id !== fu.b);
    return claims.map((c) => (c.id === fu.a || c.id === fu.b ? { ...c, reviewed: true } : c));
  }

  // ── How far into an abandoned title they got ─────────────────────────────
  if (fu?.kind === 'dnf_progress') {
    const step = DNF_PROGRESS.find((p) => p.value === value);
    if (!step) return claims;
    return claims.map((c) =>
      c.id === fu.a
        ? { ...c, watchedFraction: step.value, strength: Math.max(0.1, c.strength * step.factor) }
        : c,
    );
  }

  // ── How badly a deal-breaker bites ───────────────────────────────────────
  if (fu?.kind === 'db_strength') {
    const grade = DEALBREAKER_STRENGTHS.find((s) => s.value === value);
    const chip = DEALBREAKER_CHIPS.find((c) => c.value === fu.a);
    if (!grade || !chip?.attribute) return claims;
    const id = claimId(session, 'dealbreakers', fu.a);
    return claims.map((c) => {
      if (c.id !== id) return c;
      const next: Claim = {
        ...c,
        strength: grade.strength,
        durability: grade.durability,
        reviewed: true,
      };
      if (grade.hardExclusion) next.hardExclusion = true;
      else delete next.hardExclusion;
      if (grade.conditional) {
        next.scope = 'conditional';
        next.condition = {
          text: 'the rest of it is right',
          attributes: [],
          mode: 'suspends',
        };
      } else {
        next.scope = 'general';
        delete next.condition;
      }
      return next;
    });
  }

  // ── Chip answers ─────────────────────────────────────────────────────────
  const chips = chipsForQuestionId(state, questionId);
  if (chips) {
    const isWhy = fu?.kind === 'why';
    const target = isWhy ? claims.find((c) => c.id === fu.a) : undefined;
    const picked = decodeChips(value);
    const factor = target?.watchedFraction
      ? DNF_PROGRESS.find((p) => p.value === target.watchedFraction)?.factor ?? 1
      : 1;

    const made: Claim[] = [];
    for (const v of picked) {
      const chip = findChip(chips, v);
      if (!chip) continue;
      const c = chipToClaim(chip, {
        id: claimId(session, questionId, v),
        at: ctx.now,
        source,
        quote: `${chip.label}${target?.title ? ` — ${target.title.text}` : ''}`,
        factor,
        ...(target?.title ? { title: target.title } : {}),
      });
      if (c) made.push(c);
    }
    claims = mergeClaims(claims, made);

    // Not finishing is not the same as disliking. If the only reasons they
    // give are mood or drift, the title reaction stops being a durable verdict.
    if (isWhy && target?.reaction === 'abandoned') {
      const softOnly = picked.length > 0 && picked.every((v) => v === 'wrong_mood' || v === 'lost_interest');
      if (softOnly) {
        claims = claims.map((c) =>
          c.id === target.id ? { ...c, durability: 'temporary' as Durability } : c,
        );
      }
    }

    // A deal-breaker starts at "strong" and is regraded by its follow-up. It is
    // never a hard exclusion until the user picks that explicitly.
    if (questionId === 'dealbreakers') {
      const defaults: Claim[] = [];
      for (const v of picked) {
        const chip = DEALBREAKER_CHIPS.find((c) => c.value === v);
        if (!chip?.attribute) continue;
        defaults.push({
          id: claimId(session, 'dealbreakers', v),
          attribute: chip.attribute,
          polarity: -1,
          strength: 0.85,
          confidence: 0.9,
          durability: 'durable',
          scope: 'general',
          source,
          quote: `Deal-breaker: ${chip.label}`,
          at: ctx.now,
        });
      }
      claims = mergeClaims(claims, defaults);
    }
  }

  // ── Titles ───────────────────────────────────────────────────────────────
  const decoded = value.startsWith('{') ? decodeTitles(value) : null;
  if (decoded && decoded.titles.length > 0) {
    const q = nextQuestion(state);
    const reaction = q?.id === questionId ? q.impliedReaction : undefined;
    const made: Claim[] = decoded.titles.map((t, i) => {
      const c: Claim = {
        id: claimId(session, questionId, `t${i}`),
        attribute: null,
        polarity: reaction === 'disliked' || reaction === 'hated' || reaction === 'abandoned' ? -1 : 1,
        strength: reaction === 'hated' ? 0.95 : reaction === 'abandoned' ? 0.6 : 0.9,
        confidence: t.titleId ? 0.95 : 0.6,
        durability: 'durable',
        scope: 'general',
        title: toTitleRef(t),
        reaction: reaction ?? 'liked',
        source,
        quote: t.text,
        at: ctx.now,
      };
      return c;
    });
    claims = mergeClaims(claims, made);
  }

  // ── Free text, on any question that allows it ────────────────────────────
  const note = decoded ? decoded.note : chips || fu ? '' : value;
  const freeText = decoded ? decoded.note : chips ? '' : fu ? '' : value;
  const text = (note || freeText).trim();
  if (text) {
    claims = mergeClaims(
      claims,
      parseAnswer(text, {
        source,
        at: ctx.now,
        idPrefix: `${session.id}:${questionId}:txt`,
        ...(ctx.knownTitles ? { knownTitles: ctx.knownTitles } : {}),
      }),
    );
  }

  return claims;
}

/** Record an answer. An empty value is a skip, which costs nothing. */
export function answerQuestion(
  session: VoiceSession,
  questionId: string,
  value: string,
  ctx: SessionContext,
): VoiceSession {
  if (session.stage !== 'interview') return session;
  if (session.asked.includes(questionId)) return session;
  const claims = reduceAnswer(session, questionId, value, ctx);
  return {
    ...session,
    answers: [...session.answers, { questionId, value, at: ctx.now }],
    asked: [...session.asked, questionId],
    claims,
  };
}

/** Skip without answering. Recorded so the engine does not re-ask. */
export function skipQuestion(session: VoiceSession, questionId: string, ctx: SessionContext): VoiceSession {
  return answerQuestion(session, questionId, '', ctx);
}

/** Rebuild a session from its answer log. The basis of Back and of restore. */
export function replay(
  id: string,
  mode: InterviewMode,
  answers: readonly Answer[],
  ctx: SessionContext,
): VoiceSession {
  let s = startSession(id, mode, answers[0]?.at ?? ctx.now);
  for (const a of answers) {
    s = answerQuestion(s, a.questionId, a.value, { ...ctx, now: a.at });
  }
  return s;
}

/**
 * Go back one question. Implemented as replay-without-the-last-answer, so an
 * answer that MUTATED earlier claims (a conflict resolution, a deal-breaker
 * grade) is genuinely undone rather than approximately undone.
 */
export function goBack(session: VoiceSession, ctx: SessionContext): VoiceSession {
  if (session.answers.length === 0) return session;
  const kept = session.answers.slice(0, -1);
  return { ...replay(session.id, session.mode, kept, ctx), stage: 'interview' };
}

export function canGoBack(session: VoiceSession): boolean {
  return session.answers.length > 0 && session.stage !== 'applied';
}

/** Move to review. Allowed at any point — the user can stop early. */
export function toReview(session: VoiceSession): VoiceSession {
  return session.stage === 'applied' ? session : { ...session, stage: 'review' };
}

export function backToInterview(session: VoiceSession): VoiceSession {
  return session.stage === 'review' ? { ...session, stage: 'interview' } : session;
}

// ── Review ─────────────────────────────────────────────────────────────────

export type ReviewDecision = 'keep' | 'drop' | 'mood' | 'flip' | 'hard';

export interface ReviewItem {
  claimId: string;
  statement: string;
  quote: string;
  kind: 'rule' | 'exception' | 'condition' | 'mood' | 'title' | 'note';
  durability: Durability;
  confidence: number;
  needsConfirmation: boolean;
  hardExclusion: boolean;
}

/** The named sections of the review, in the order they are shown. */
export const REVIEW_SECTIONS = [
  'Core loves',
  'Never recommend',
  'Strong avoidances',
  'Conditional tastes',
  'Just for now',
  'Pacing',
  'Tone',
  'Story preferences',
  'Content tolerance',
  'Format preferences',
  'Language and audio',
  'Titles discussed',
  'Noted, but not used',
] as const;

export type ReviewSectionName = (typeof REVIEW_SECTIONS)[number];

const SECTION_OF: Record<AttributeSection, ReviewSectionName> = {
  genre: 'Core loves',
  pacing: 'Pacing',
  tone: 'Tone',
  story: 'Story preferences',
  content: 'Content tolerance',
  format: 'Format preferences',
  language: 'Language and audio',
};

function statementFor(c: Claim): string {
  if (c.unactionable) {
    const what = c.title?.text ? ` about ${c.title.text}` : '';
    return `You mentioned something${what} that I cannot turn into a filter.`;
  }
  if (c.attribute) {
    const phrase = attributePhrase(c.attribute);
    if (c.hardExclusion) return `Never recommend anything with ${phrase}.`;
    const base = c.polarity === 1 ? `You go for ${phrase}` : `You avoid ${phrase}`;
    if (c.condition) {
      const verb = c.condition.mode === 'suspends' ? 'except when' : 'but only when';
      return `${base} — ${verb} ${c.condition.text.replace(/^(they|it|there)\s+/i, '')}.`;
    }
    return `${base}.`;
  }
  const what = c.title?.text ?? 'that';
  const verb: Record<string, string> = {
    loved: 'You loved',
    liked: 'You liked',
    mixed: 'You were mixed on',
    disliked: 'You did not like',
    hated: 'You could not stand',
    abandoned: 'You gave up on',
    avoided: 'You avoid',
    curious: 'You are curious about',
  };
  const line = `${verb[c.reaction ?? 'liked'] ?? 'You mentioned'} ${what}`;
  if (c.reaction === 'abandoned' && c.durability === 'temporary') {
    return `${line} — but that reads as timing, not taste.`;
  }
  return `${line}.`;
}

function kindFor(c: Claim): ReviewItem['kind'] {
  if (c.unactionable) return 'note';
  if (c.durability === 'temporary') return 'mood';
  if (c.condition) return 'condition';
  if (c.attribute === null) return 'title';
  return 'rule';
}

function itemFor(c: Claim): ReviewItem {
  return {
    claimId: c.id,
    statement: statementFor(c),
    quote: c.quote,
    kind: kindFor(c),
    durability: c.durability,
    confidence: c.confidence,
    needsConfirmation: c.title?.needsConfirmation === true && !c.reviewed,
    hardExclusion: c.hardExclusion === true,
  };
}

/** Which review section a claim belongs to. Exactly one, so editing is unambiguous. */
export function sectionOf(c: Claim): ReviewSectionName {
  if (c.unactionable) return 'Noted, but not used';
  if (c.attribute === null) return 'Titles discussed';
  if (c.hardExclusion) return 'Never recommend';
  if (c.durability === 'temporary') return 'Just for now';
  if (c.scope === 'conditional' || c.condition) return 'Conditional tastes';
  if (c.polarity === -1 && c.strength >= 0.7) return 'Strong avoidances';
  const section = attributeDef(c.attribute)?.section ?? 'story';
  return SECTION_OF[section];
}

export interface ReviewSection {
  name: ReviewSectionName;
  items: ReviewItem[];
}

/** Everything we concluded, grouped, with unconfirmed guesses first. */
export function reviewSections(session: VoiceSession): ReviewSection[] {
  const grouped = new Map<ReviewSectionName, ReviewItem[]>();
  for (const c of session.claims) {
    const name = sectionOf(c);
    const list = grouped.get(name) ?? [];
    list.push(itemFor(c));
    grouped.set(name, list);
  }
  return REVIEW_SECTIONS.flatMap((name) => {
    const items = grouped.get(name);
    if (!items || items.length === 0) return [];
    items.sort((a, b) => {
      if (a.needsConfirmation !== b.needsConfirmation) return a.needsConfirmation ? -1 : 1;
      return b.confidence - a.confidence;
    });
    return [{ name, items }];
  });
}

/** Flat view, unconfirmed guesses first. */
export function reviewItems(session: VoiceSession): ReviewItem[] {
  return reviewSections(session)
    .flatMap((s) => s.items)
    .sort((a, b) => {
      if (a.needsConfirmation !== b.needsConfirmation) return a.needsConfirmation ? -1 : 1;
      return b.confidence - a.confidence;
    });
}

/** Axes we still know nothing about, named plainly for the review. */
export function stillUnclear(session: VoiceSession, ctx: SessionContext): string[] {
  const profile = profileOf(session, ctx);
  const wanted = ['slow_pace', 'dark_tone', 'comedy', 'violence', 'subtitles', 'complex_plot', 'romance_genre', 'unfinished'];
  return wanted
    .filter((k) => (profile.attributes[k]?.evidence ?? 0) <= 0 && (ctx.priorEvidence?.[k] ?? 0) <= 0)
    .map((k) => attributeLabel(k));
}

/**
 * Can the review be applied? Only once every guessed title has been decided —
 * the one place where we refuse to proceed on an assumption.
 */
export function canApply(
  session: VoiceSession,
  decisions: Record<string, ReviewDecision>,
): { ok: boolean; blockedBy: string[] } {
  const blockedBy = reviewItems(session)
    .filter((i) => i.needsConfirmation && !decisions[i.claimId])
    .map((i) => i.claimId);
  return { ok: blockedBy.length === 0, blockedBy };
}

/** Apply the user's review decisions to the claims. */
export function applyDecisions(claims: Claim[], decisions: Record<string, ReviewDecision>): Claim[] {
  const out: Claim[] = [];
  for (const c of claims) {
    const d = decisions[c.id] ?? 'keep';
    if (d === 'drop') continue;
    if (d === 'mood') { out.push({ ...c, durability: 'temporary', reviewed: true }); continue; }
    if (d === 'flip') {
      out.push({ ...c, polarity: (c.polarity === 1 ? -1 : 1) as -1 | 1, reviewed: true, confidence: 0.95 });
      continue;
    }
    if (d === 'hard') {
      // Promoting to never-recommend is only ever the user's own doing.
      out.push({ ...c, hardExclusion: true, polarity: -1, strength: 1, durability: 'durable', reviewed: true });
      continue;
    }
    out.push({
      ...c,
      reviewed: true,
      ...(c.title ? { title: { ...c.title, needsConfirmation: false } } : {}),
    });
  }
  return out;
}

export function applyReview(
  session: VoiceSession,
  decisions: Record<string, ReviewDecision>,
  now: number,
): VoiceSession {
  if (session.stage === 'applied') return session;
  if (!canApply(session, decisions).ok) return session;
  return { ...session, stage: 'applied', appliedAt: now, claims: applyDecisions(session.claims, decisions) };
}

/** Undo an application: back to review, nothing kept. */
export function undoApply(session: VoiceSession): VoiceSession {
  if (session.stage !== 'applied') return session;
  const { appliedAt: _appliedAt, ...rest } = session;
  return { ...rest, stage: 'review' };
}

/** The Instant DNA reveal for this session. */
export function sessionReveal(session: VoiceSession, ctx: SessionContext) {
  return reveal(profileOf(session, ctx), session.claims);
}

/** Everything about this session, gone. Deletion means deletion. */
export function forgetSession(session: VoiceSession): VoiceSession {
  return { ...session, answers: [], claims: [], asked: [], stage: 'interview' };
}
