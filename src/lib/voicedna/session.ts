/**
 * THE INTERVIEW SESSION.
 *
 * A pure state machine over an append-only answer log. Every session state is a
 * deterministic function of (mode, answers, now), which buys three things the
 * product actually promises:
 *
 *   * MANDATORY REVIEW — nothing reaches Viewer DNA until the user has seen
 *     what we concluded, in their own words, and confirmed it. `canApply`
 *     enforces it rather than the UI remembering to.
 *   * UNDO — rolling back is dropping answers and re-deriving, not un-applying
 *     a mutation.
 *   * REPRODUCIBILITY — the same transcript always yields the same DNA, so a
 *     support question can be answered by replaying it.
 *
 * No I/O. Persistence wraps this; it does not live inside it.
 */
import type { Claim, Durability, VoiceProfile } from './types';
import type { KnownTitle } from './parse';
import { parseAnswer } from './parse';
import { buildProfile, mergeClaims, reveal, type BuildInput } from './profile';
import { resolveConflict } from './contradiction';
import { attributePhrase } from './lexicon';
import {
  bankQuestion,
  nextQuestion,
  parseFollowUpId,
  progress,
  type InterviewMode,
  type QuestionState,
  type VoiceQuestion,
} from './questions';

export type SessionStage = 'interview' | 'review' | 'applied';

export interface Answer {
  questionId: string;
  /** Free text for open questions, the option value for choices. */
  value: string;
  at: number;
}

export interface VoiceSession {
  id: string;
  mode: InterviewMode;
  stage: SessionStage;
  asked: string[];
  answers: Answer[];
  claims: Claim[];
  startedAt: number;
  /** Set when the user applies the review. */
  appliedAt?: number;
}

export interface SessionContext {
  now: number;
  knownTitles?: KnownTitle[];
  titleFacts?: BuildInput['titleFacts'];
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

function questionState(session: VoiceSession, profile: VoiceProfile): QuestionState {
  return { mode: session.mode, asked: session.asked, profile, claims: session.claims };
}

/** The question to put on screen now, or null when the interview is finished. */
export function currentQuestion(session: VoiceSession, ctx: SessionContext): VoiceQuestion | null {
  if (session.stage !== 'interview') return null;
  return nextQuestion(questionState(session, profileOf(session, ctx)));
}

export function sessionProgress(session: VoiceSession, ctx: SessionContext) {
  return progress(questionState(session, profileOf(session, ctx)));
}

/**
 * Record an answer.
 *
 * Open answers are parsed into claims. Choice answers (conflict resolutions and
 * exception confirmations) edit the existing claims instead of adding new ones —
 * a repair, not new evidence.
 */
export function answerQuestion(
  session: VoiceSession,
  questionId: string,
  value: string,
  ctx: SessionContext,
): VoiceSession {
  if (session.stage !== 'interview') return session;

  const answers = [...session.answers, { questionId, value, at: ctx.now }];
  const asked = session.asked.includes(questionId) ? session.asked : [...session.asked, questionId];
  let claims = session.claims;

  const followUp = parseFollowUpId(questionId);

  if (followUp?.kind === 'conflict') {
    const { a: positiveClaimId, b: negativeClaimId } = followUp;
    const profile = profileOf(session, ctx);
    const conflict = profile.conflicts.find(
      (c) => c.positiveClaimId === positiveClaimId && c.negativeClaimId === negativeClaimId,
    );
    if (conflict && (value === 'positive' || value === 'negative' || value === 'depends')) {
      claims = resolveConflict(claims, conflict, value);
    }
  } else if (followUp?.kind === 'exception') {
    const { a: ruleClaimId, b: exceptionClaimId } = followUp;
    if (value === 'rule_wrong') {
      claims = claims.filter((c) => c.id !== ruleClaimId);
    } else if (value === 'title_wrong') {
      claims = claims.filter((c) => c.id !== exceptionClaimId);
    } else {
      claims = claims.map((c) =>
        c.id === exceptionClaimId || c.id === ruleClaimId ? { ...c, reviewed: true } : c,
      );
    }
  } else {
    const parsed = parseAnswer(value, {
      source: ctx.source ?? 'typed_interview',
      at: ctx.now,
      idPrefix: `${session.id}:${questionId}`,
      ...(ctx.knownTitles ? { knownTitles: ctx.knownTitles } : {}),
    });
    claims = mergeClaims(claims, parsed);
  }

  return { ...session, answers, asked, claims };
}

/** Skip a question without recording anything. Skipping must cost nothing. */
export function skipQuestion(session: VoiceSession, questionId: string): VoiceSession {
  if (session.asked.includes(questionId)) return session;
  return { ...session, asked: [...session.asked, questionId] };
}

/** Move to review. Allowed at any point — the user can stop early. */
export function toReview(session: VoiceSession): VoiceSession {
  return session.stage === 'applied' ? session : { ...session, stage: 'review' };
}

export function backToInterview(session: VoiceSession): VoiceSession {
  return session.stage === 'review' ? { ...session, stage: 'interview' } : session;
}

// ── Review ─────────────────────────────────────────────────────────────────

export type ReviewDecision = 'keep' | 'drop' | 'mood' | 'flip';

export interface ReviewItem {
  claimId: string;
  /** What we concluded, in plain language. */
  statement: string;
  /** The user's own words. */
  quote: string;
  kind: 'rule' | 'exception' | 'condition' | 'mood' | 'title';
  durability: Durability;
  confidence: number;
  /** True when we guessed at a title and must not proceed without an answer. */
  needsConfirmation: boolean;
}

function statementFor(c: Claim): string {
  if (c.attribute) {
    const phrase = attributePhrase(c.attribute);
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
    hated: 'You hated',
    abandoned: 'You gave up on',
    avoided: 'You avoid',
    curious: 'You are curious about',
  };
  return `${verb[c.reaction ?? 'liked'] ?? 'You mentioned'} ${what}.`;
}

function kindFor(c: Claim): ReviewItem['kind'] {
  if (c.durability === 'temporary') return 'mood';
  if (c.condition) return 'condition';
  if (c.attribute === null) return 'title';
  return 'rule';
}

/**
 * Everything we concluded, one row per claim, ordered so the rules the user is
 * most likely to want to correct come first.
 */
export function reviewItems(session: VoiceSession): ReviewItem[] {
  return session.claims
    .map((c) => ({
      claimId: c.id,
      statement: statementFor(c),
      quote: c.quote,
      kind: kindFor(c),
      durability: c.durability,
      confidence: c.confidence,
      needsConfirmation: c.title?.needsConfirmation === true && !c.reviewed,
    }))
    .sort((a, b) => {
      if (a.needsConfirmation !== b.needsConfirmation) return a.needsConfirmation ? -1 : 1;
      return b.confidence - a.confidence;
    });
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
    out.push({
      ...c,
      reviewed: true,
      // Confirming a guessed title is the user telling us it was right.
      ...(c.title ? { title: { ...c.title, needsConfirmation: false } } : {}),
    });
  }
  return out;
}

/**
 * Finish the review. Returns the session unchanged when confirmation is still
 * outstanding — the guard lives here so no caller can route around it.
 */
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
