/**
 * WITNESS TESTIMONY — the session.
 *
 * A pure reducer over an append-only answer log. `asked` and `claims` are both
 * DERIVED from the answers, never stored independently, which is what makes
 * Back correct rather than approximate: drop the last answer and replay. An
 * answer that mutated earlier claims — a contradiction resolved, a deal-breaker
 * graded — genuinely un-happens.
 *
 * The same property gives a refresh nothing to lose (the log is a list of
 * strings) and makes the whole interview reproducible from its transcript.
 *
 * No I/O. Persistence wraps this; it does not live inside it.
 */
import type { Claim, Durability, VoiceProfile } from './types';
import type { KnownTitle } from './parse';
import { findUnresolved, parseAnswer } from './parse';
import { buildProfile, mergeClaims, reveal, type BuildInput } from './profile';
import { resolveConflict } from './contradiction';
import { attributeLabel, attributePhrase, attribute as attributeDef, type AttributeSection } from './lexicon';
import { decodeChips, decodeTitles, toTitleRef, type PickedTitle } from './answerCodec';
import {
  DEALBREAKER_CHIPS, DEALBREAKER_STRENGTHS, DNF_PROGRESS, aspectLabel, chipToClaim, findChip,
} from './reasons';
import {
  chipsForQuestionId, mainAnswered, nextQuestion, parseFollowUpId, progress,
  type QuestionState, type VoiceQuestion,
} from './questions';
import { MAIN_MAX } from './steps';

export type SessionStage = 'interview' | 'review' | 'applied';

export interface Answer {
  questionId: string;
  /** Encoded per `answerCodec`. Empty string means the question was skipped. */
  value: string;
  at: number;
}

export interface VoiceSession {
  id: string;
  stage: SessionStage;
  /** Derived from `answers`. Stored so the persisted row is self-describing. */
  asked: string[];
  answers: Answer[];
  claims: Claim[];
  startedAt: number;
  /** Extra follow-ups the user asked for. Never adds main questions. */
  extraDepth: number;
  appliedAt?: number;
}

export interface SessionContext {
  now: number;
  knownTitles?: KnownTitle[];
  titleFacts?: BuildInput['titleFacts'];
  priorEvidence?: Record<string, number>;
  source?: Claim['source'];
}

export function startSession(id: string, now: number): VoiceSession {
  return { id, stage: 'interview', asked: [], answers: [], claims: [], startedAt: now, extraDepth: 0 };
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
    asked: session.asked,
    answers,
    profile: profileOf(session, ctx),
    claims: session.claims,
    priorEvidence: ctx.priorEvidence ?? {},
    extraDepth: session.extraDepth,
  };
}

export function currentQuestion(session: VoiceSession, ctx: SessionContext): VoiceQuestion | null {
  if (session.stage !== 'interview') return null;
  return nextQuestion(questionState(session, ctx));
}

export function sessionProgress(session: VoiceSession, ctx: SessionContext) {
  return progress(questionState(session, ctx));
}

export function mainQuestionsAnswered(session: VoiceSession): number {
  return Math.min(mainAnswered({ asked: session.asked } as QuestionState), MAIN_MAX);
}

// ── The reducer ────────────────────────────────────────────────────────────

const cid = (session: VoiceSession, questionId: string, suffix: string) =>
  `${session.id}:${questionId}:${suffix}`;

/** The title this step is about, so a reason without one still lands somewhere. */
function stepTitle(session: VoiceSession, questionId: string): Claim['title'] | undefined {
  const answer = session.answers.find((a) => a.questionId === questionId);
  if (!answer?.value.startsWith('{')) return undefined;
  const first = decodeTitles(answer.value).titles[0];
  return first ? toTitleRef(first) : undefined;
}

function reduceAnswer(
  session: VoiceSession,
  questionId: string,
  value: string,
  ctx: SessionContext,
): Claim[] {
  const source = ctx.source ?? 'typed_interview';
  const state = questionState(session, ctx);
  let claims = session.claims;
  if (!value) return claims;

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

  // ── "How did you feel about the performances in F1?" ─────────────────────
  if (fu?.kind === 'clarify') {
    const target = claims.find((c) => c.id === fu.a);
    if (!target) return claims;
    if (value === 'not_meant') return claims.filter((c) => c.id !== fu.a);
    const polarity: -1 | 1 = value === 'negative' ? -1 : 1;
    return claims.map((c) => {
      if (c.id !== fu.a) return c;
      const next: Claim = {
        ...c,
        polarity,
        strength: value === 'mixed' ? 0.35 : 0.7,
        confidence: 0.9,
        reviewed: true,
        reaction: value === 'negative' ? 'disliked' : value === 'mixed' ? 'mixed' : 'liked',
      };
      delete next.unresolved;
      return next;
    });
  }

  // ── "So it was mostly the deduction and the cases?" ──────────────────────
  if (fu?.kind === 'summary') {
    const target = claims.find((c) => c.id === fu.a);
    const titleText = target?.title?.text;
    if (!titleText) return claims;
    const isReason = (c: Claim) => c.title?.text === titleText && c.attribute !== null;
    if (value === 'not_quite') return claims.filter((c) => !isReason(c));
    if (value === 'mostly') {
      return claims.map((c) => (isReason(c) ? { ...c, strength: c.strength * 0.75, reviewed: true } : c));
    }
    return claims.map((c) => (isReason(c) ? { ...c, confidence: 0.95, reviewed: true } : c));
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

  // ── How strong a deal-breaker is ─────────────────────────────────────────
  if (fu?.kind === 'db_strength') {
    const grade = DEALBREAKER_STRENGTHS.find((x) => x.value === value);
    const chip = DEALBREAKER_CHIPS.find((c) => c.value === fu.a);
    if (!grade || !chip?.attribute) return claims;
    const id = cid(session, 'dealbreakers', fu.a);
    return claims.map((c) => {
      if (c.id !== id) return c;
      const next: Claim = { ...c, strength: grade.strength, durability: grade.durability, reviewed: true };
      if (grade.hardExclusion) next.hardExclusion = true;
      else delete next.hardExclusion;
      if (grade.conditional) {
        next.scope = 'conditional';
        next.condition = { text: 'the rest of it is right', attributes: [], mode: 'suspends' };
      } else {
        next.scope = 'general';
        delete next.condition;
      }
      return next;
    });
  }

  // ── The title card ───────────────────────────────────────────────────────
  if (questionId === 'movie_check') {
    const { titles, note } = decodeTitles(value);
    const picked = titles[0];
    if (!picked || note === 'unseen') return claims;
    const map: Record<string, { polarity: -1 | 1; strength: number; reaction: Claim['reaction'] }> = {
      loved: { polarity: 1, strength: 0.95, reaction: 'loved' },
      liked: { polarity: 1, strength: 0.8, reaction: 'liked' },
      looks_right: { polarity: 1, strength: 0.5, reaction: 'curious' },
      not_for_me: { polarity: -1, strength: 0.6, reaction: 'avoided' },
      hated: { polarity: -1, strength: 0.95, reaction: 'hated' },
    };
    const m = map[note];
    if (!m) return claims;
    return mergeClaims(claims, [{
      id: cid(session, 'movie_check', picked.titleId ?? 'card'),
      attribute: null,
      polarity: m.polarity,
      strength: m.strength,
      confidence: 0.9,
      durability: 'durable',
      scope: 'general',
      title: toTitleRef(picked),
      ...(m.reaction ? { reaction: m.reaction } : {}),
      source,
      quote: `${picked.text} — ${note.replace(/_/g, ' ')}`,
      at: ctx.now,
    }]);
  }

  // ── Chips ────────────────────────────────────────────────────────────────
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
        id: cid(session, questionId, v),
        at: ctx.now,
        source,
        quote: chip.label,
        factor,
        ...(target?.title ? { title: target.title } : {}),
      });
      if (c) made.push(c);
    }
    claims = mergeClaims(claims, made);

    // Not finishing is not disliking. If the only reasons are mood or drift,
    // the reaction stops being a verdict about the title.
    if (isWhy && target?.reaction === 'abandoned') {
      const soft = picked.length > 0 && picked.every((v) => v === 'wrong_mood' || v === 'lost_interest');
      if (soft) {
        claims = claims.map((c) =>
          c.id === target.id ? { ...c, durability: 'temporary' as Durability } : c,
        );
      }
    }

    if (questionId === 'dealbreakers') {
      const defaults: Claim[] = [];
      for (const v of picked) {
        const chip = DEALBREAKER_CHIPS.find((c) => c.value === v);
        if (!chip?.attribute) continue;
        defaults.push({
          id: cid(session, 'dealbreakers', v),
          attribute: chip.attribute,
          polarity: -1,
          strength: 0.85,
          confidence: 0.9,
          durability: 'durable',
          scope: 'general',
          source,
          quote: chip.label,
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
    const negative = reaction === 'disliked' || reaction === 'hated' || reaction === 'abandoned';
    claims = mergeClaims(claims, decoded.titles.map((t, i) => ({
      id: cid(session, questionId, `t${i}`),
      attribute: null,
      polarity: (negative ? -1 : 1) as -1 | 1,
      strength: reaction === 'hated' ? 0.95 : reaction === 'abandoned' ? 0.6 : 0.9,
      confidence: t.titleId ? 0.95 : 0.6,
      durability: 'durable' as Durability,
      scope: 'general' as const,
      title: toTitleRef(t),
      reaction: reaction ?? 'liked',
      source,
      quote: t.text,
      at: ctx.now,
    })));
  }

  // ── Free text ────────────────────────────────────────────────────────────
  const text = (decoded ? decoded.note : chips || fu ? '' : value).trim();
  if (text) {
    const parseCtx = {
      source,
      at: ctx.now,
      idPrefix: `${session.id}:${questionId}:txt`,
      ...(ctx.knownTitles ? { knownTitles: ctx.knownTitles } : {}),
    };
    const parsed = parseAnswer(text, parseCtx).map((c) =>
      // A reason with no title of its own belongs to the title this step is about.
      c.aspect && !c.title && stepTitle(session, questionId)
        ? { ...c, title: stepTitle(session, questionId)! }
        : c,
    );
    claims = mergeClaims(claims, parsed);

    // Anything we heard but could not read a direction from becomes a question,
    // never a guess.
    if (parsed.length === 0) {
      const unresolved = findUnresolved(text, parseCtx).slice(0, 2).map<Claim>((u, i) => ({
        id: `${session.id}:${questionId}:unres${i}`,
        attribute: null,
        polarity: 1,
        strength: 0,
        confidence: 0,
        durability: 'unknown',
        scope: 'general',
        source,
        quote: u.quote,
        at: ctx.now,
        unresolved: true,
        ...(u.aspect ? { aspect: u.aspect } : {}),
        ...(u.title ? { title: u.title } : stepTitle(session, questionId) ? { title: stepTitle(session, questionId)! } : {}),
      }));
      claims = mergeClaims(claims, unresolved);
    }
  }

  return claims;
}

export function answerQuestion(
  session: VoiceSession,
  questionId: string,
  value: string,
  ctx: SessionContext,
): VoiceSession {
  if (session.stage !== 'interview') return session;
  if (session.asked.includes(questionId)) return session;
  return {
    ...session,
    answers: [...session.answers, { questionId, value, at: ctx.now }],
    asked: [...session.asked, questionId],
    claims: reduceAnswer(session, questionId, value, ctx),
  };
}

export function skipQuestion(session: VoiceSession, questionId: string, ctx: SessionContext): VoiceSession {
  return answerQuestion(session, questionId, '', ctx);
}

/** The user asked for more depth. Adds follow-ups only — never main questions. */
export function goDeeper(session: VoiceSession): VoiceSession {
  return { ...session, extraDepth: Math.min(3, session.extraDepth + 1), stage: 'interview' };
}

export function replay(id: string, answers: readonly Answer[], ctx: SessionContext, extraDepth = 0): VoiceSession {
  let s = { ...startSession(id, answers[0]?.at ?? ctx.now), extraDepth };
  for (const a of answers) s = answerQuestion(s, a.questionId, a.value, { ...ctx, now: a.at });
  return s;
}

/** Back: replay without the last answer, so mutations genuinely reverse. */
export function goBack(session: VoiceSession, ctx: SessionContext): VoiceSession {
  if (session.answers.length === 0) return session;
  return {
    ...replay(session.id, session.answers.slice(0, -1), ctx, session.extraDepth),
    stage: 'interview',
  };
}

export const canGoBack = (s: VoiceSession) => s.answers.length > 0 && s.stage !== 'applied';

export function toReview(session: VoiceSession): VoiceSession {
  return session.stage === 'applied' ? session : { ...session, stage: 'review' };
}

export function backToInterview(session: VoiceSession): VoiceSession {
  return session.stage === 'review' ? { ...session, stage: 'interview' } : session;
}

// ── Review ─────────────────────────────────────────────────────────────────

/**
 * What the user can say about a line. The wording is always chosen for the KIND
 * of line — a title match and a taste reading need different questions, and a
 * generic "Backwards" button makes the user reverse-engineer our data model.
 */
export type ReviewDecision = 'confirm' | 'soften' | 'flip' | 'mood' | 'depends' | 'remove' | 'hard';
export type DecisionKind = 'title' | 'interpretation' | 'permanence' | 'direction';

export const DECISION_OPTIONS: Record<DecisionKind, Array<{ value: ReviewDecision; label: string }>> = {
  title: [
    { value: 'confirm', label: 'Yes, that’s it' },
    { value: 'remove', label: 'Wrong title' },
  ],
  interpretation: [
    { value: 'confirm', label: 'Exactly' },
    { value: 'soften', label: 'Mostly' },
    { value: 'remove', label: 'Not quite' },
  ],
  permanence: [
    { value: 'confirm', label: 'Usually true' },
    { value: 'mood', label: 'Only tonight' },
    { value: 'depends', label: 'Depends' },
    { value: 'remove', label: 'Remove this' },
  ],
  direction: [
    { value: 'confirm', label: 'I like this' },
    { value: 'flip', label: 'I dislike this' },
    { value: 'depends', label: 'It depends' },
    { value: 'remove', label: 'Remove this' },
  ],
};

export interface ReviewItem {
  claimId: string;
  statement: string;
  quote: string;
  decisionKind: DecisionKind;
  durability: Durability;
  confidence: number;
  needsConfirmation: boolean;
  hardExclusion: boolean;
  /** Set for rows that represent a named title. */
  title?: { titleId: string | null; text: string };
  /** For the titles strip: the reaction and its main reason. */
  reaction?: Claim['reaction'];
  reason?: string;
}

export const REVIEW_SECTIONS = [
  'Core loves',
  'Never recommend',
  'Avoidances',
  'It depends',
  'Just for now',
  'Titles discussed',
  'Still checking',
] as const;

export type ReviewSectionName = (typeof REVIEW_SECTIONS)[number];

const LOVE_SECTIONS: AttributeSection[] = ['genre', 'pacing', 'tone', 'story', 'content', 'format', 'language'];

function statementFor(c: Claim, claims: Claim[]): string {
  if (c.unresolved) {
    const part = c.aspect ? `the ${aspectLabel(c.aspect)}` : 'something';
    const where = c.title?.text ? ` in ${c.title.text}` : '';
    return `You mentioned ${part}${where} — I did not want to guess which way you meant it.`;
  }
  if (c.aspect) {
    const where = c.title?.text ? `${c.title.text} — ` : '';
    const verdict = c.polarity === 1 ? 'worked for you' : 'let you down';
    return `${where}the ${aspectLabel(c.aspect)} ${verdict}.`;
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
    loved: 'You loved', liked: 'You liked', mixed: 'You were mixed on',
    disliked: 'You did not like', hated: 'You could not stand',
    abandoned: 'You gave up on', avoided: 'You avoid', curious: 'You liked the look of',
  };
  const line = `${verb[c.reaction ?? 'liked'] ?? 'You mentioned'} ${what}`;
  if (c.reaction === 'abandoned' && c.durability === 'temporary') {
    return `${line} — that reads as timing, not taste.`;
  }
  void claims;
  return `${line}.`;
}

function decisionKindFor(c: Claim): DecisionKind {
  if (c.unresolved) return 'direction';
  if (c.attribute === null && c.title && !c.aspect) return 'title';
  if (c.durability === 'temporary') return 'permanence';
  if (c.aspect) return 'interpretation';
  return 'interpretation';
}

/** The main reason recorded against a title, for the titles strip. */
function reasonFor(c: Claim, claims: Claim[]): string | undefined {
  const text = c.title?.text;
  if (!text) return undefined;
  const reasons = claims.filter(
    (r) => r.id !== c.id && r.title?.text === text && !r.unresolved && (r.strength > 0 || r.aspect),
  );
  const best = reasons.sort((a, b) => b.strength - a.strength)[0];
  if (!best) return undefined;
  if (best.aspect) return `the ${aspectLabel(best.aspect)}`;
  if (best.attribute) return attributeLabel(best.attribute).toLowerCase();
  return undefined;
}

function itemFor(c: Claim, claims: Claim[]): ReviewItem {
  return {
    claimId: c.id,
    statement: statementFor(c, claims),
    quote: c.quote,
    decisionKind: decisionKindFor(c),
    durability: c.durability,
    confidence: c.confidence,
    needsConfirmation: c.title?.needsConfirmation === true && !c.reviewed,
    hardExclusion: c.hardExclusion === true,
    ...(c.title ? { title: { titleId: c.title.titleId, text: c.title.text } } : {}),
    ...(c.reaction ? { reaction: c.reaction } : {}),
    ...(reasonFor(c, claims) ? { reason: reasonFor(c, claims)! } : {}),
  };
}

export function sectionOf(c: Claim): ReviewSectionName {
  if (c.unresolved) return 'Still checking';
  if (c.attribute === null) return 'Titles discussed';
  if (c.hardExclusion) return 'Never recommend';
  if (c.durability === 'temporary') return 'Just for now';
  if (c.scope === 'conditional' || c.condition) return 'It depends';
  if (c.polarity === -1) return 'Avoidances';
  void LOVE_SECTIONS;
  return 'Core loves';
}

export interface ReviewSection {
  name: ReviewSectionName;
  items: ReviewItem[];
}

export function reviewSections(session: VoiceSession): ReviewSection[] {
  const grouped = new Map<ReviewSectionName, ReviewItem[]>();
  for (const c of session.claims) {
    // Aspect reasons ride along with their title rather than getting their own
    // row — "The Notebook — the story was weak" belongs to The Notebook.
    if (c.aspect && !c.unresolved && c.title) continue;
    const name = sectionOf(c);
    const list = grouped.get(name) ?? [];
    list.push(itemFor(c, session.claims));
    grouped.set(name, list);
  }
  return REVIEW_SECTIONS.flatMap((name) => {
    const items = grouped.get(name);
    if (!items?.length) return [];
    items.sort((a, b) => {
      if (a.needsConfirmation !== b.needsConfirmation) return a.needsConfirmation ? -1 : 1;
      return b.confidence - a.confidence;
    });
    return [{ name, items }];
  });
}

export function reviewItems(session: VoiceSession): ReviewItem[] {
  return reviewSections(session).flatMap((s) => s.items);
}

/** Titles we guessed at and still need confirmed — always rendered, never just counted. */
export function unconfirmedTitles(session: VoiceSession): ReviewItem[] {
  const unresolved = new Set(session.claims.filter((c) => c.unresolved).map((c) => c.id));
  // A fragment we never got a direction for is dropped rather than saved, so it
  // has no business blocking the save.
  return reviewItems(session).filter((i) => i.needsConfirmation && !unresolved.has(i.claimId));
}

/** Short chip labels for what we still do not know. */
export function stillUnclear(session: VoiceSession, ctx: SessionContext, limit = 3): string[] {
  const profile = profileOf(session, ctx);
  const wanted = ['violence', 'subtitles', 'complex_plot', 'slow_pace', 'romance_genre', 'unfinished'];
  return wanted
    .filter((k) => (profile.attributes[k]?.evidence ?? 0) <= 0 && (ctx.priorEvidence?.[k] ?? 0) <= 0)
    .slice(0, limit)
    .map((k) => attributeLabel(k));
}

/**
 * Save is blocked only by things that would make the DNA wrong: a title we
 * guessed at, or a contradiction nobody settled. Not knowing how someone feels
 * about subtitles is fine — we simply will not assume.
 */
export function canApply(
  session: VoiceSession,
  decisions: Record<string, ReviewDecision>,
  ctx: SessionContext,
): { ok: boolean; blockedBy: ReviewItem[]; conflicts: number } {
  const blockedBy = unconfirmedTitles(session).filter((i) => !decisions[i.claimId]);
  const conflicts = profileOf(session, ctx).conflicts.length;
  return { ok: blockedBy.length === 0 && conflicts === 0, blockedBy, conflicts };
}

export function applyDecisions(claims: Claim[], decisions: Record<string, ReviewDecision>): Claim[] {
  const removedTitles = new Set(
    claims.filter((c) => decisions[c.id] === 'remove' && c.title?.text).map((c) => c.title!.text),
  );
  const out: Claim[] = [];
  for (const c of claims) {
    const d = decisions[c.id] ?? 'confirm';
    if (d === 'remove') continue;
    // Dropping a title drops what we concluded from it.
    if (c.title?.text && removedTitles.has(c.title.text) && !decisions[c.id]) continue;
    if (c.unresolved) continue; // never saved unanswered
    if (d === 'mood') { out.push({ ...c, durability: 'temporary', reviewed: true }); continue; }
    if (d === 'depends') {
      out.push({ ...c, scope: 'conditional', strength: Math.min(c.strength, 0.6), reviewed: true });
      continue;
    }
    if (d === 'soften') { out.push({ ...c, strength: c.strength * 0.7, reviewed: true }); continue; }
    if (d === 'flip') {
      out.push({ ...c, polarity: (c.polarity === 1 ? -1 : 1) as -1 | 1, reviewed: true, confidence: 0.95 });
      continue;
    }
    if (d === 'hard') {
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
  ctx: SessionContext,
): VoiceSession {
  if (session.stage === 'applied') return session;
  if (!canApply(session, decisions, ctx).ok) return session;
  return { ...session, stage: 'applied', appliedAt: now, claims: applyDecisions(session.claims, decisions) };
}

export function undoApply(session: VoiceSession): VoiceSession {
  if (session.stage !== 'applied') return session;
  const { appliedAt: _appliedAt, ...rest } = session;
  return { ...rest, stage: 'review' };
}

export function sessionReveal(session: VoiceSession, ctx: SessionContext) {
  return reveal(profileOf(session, ctx), session.claims);
}

export function forgetSession(session: VoiceSession): VoiceSession {
  return { ...session, answers: [], claims: [], asked: [], stage: 'interview', extraDepth: 0 };
}

/** The titles the interview discussed, for the review strip. */
export function discussedTitles(session: VoiceSession): ReviewItem[] {
  return reviewSections(session).find((s) => s.name === 'Titles discussed')?.items ?? [];
}

export type { PickedTitle };
