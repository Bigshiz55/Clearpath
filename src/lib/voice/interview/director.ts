/**
 * THE DIRECTOR — the orchestrator.
 *
 * Two pure functions own the whole conversation strategy:
 *
 *  • `decide(state)` reads the state and returns the per-turn `Directive`: what
 *    to do (greet / explore / follow up / challenge / confirm / wrap / complete),
 *    which axis, what to steer toward, what to stop asking about, any
 *    contradiction to raise, and whether we are done. A pending follow-up beats a
 *    fresh topic; an unraised contradiction beats everything short of the hard
 *    cap; `done` is true once overall confidence clears the completion bar or the
 *    turn cap is hit.
 *
 *  • `advance(state, incoming, nowMs)` is the reducer: it folds a turn's signals
 *    into a brand-new state — confidence, claims, contradictions, the pending
 *    follow-up, phase, transcript — and can never throw on empty or garbage
 *    input. The turn counter always advances, so within `HARD_TURN_CAP` turns
 *    the interview is guaranteed to complete.
 *
 * Pure. `nowMs` is the only time source, passed in by the caller.
 */
import type {
  Directive,
  DirectiveAction,
  InterviewState,
  TasteSignal,
  TasteCategory,
  Contradiction,
  FollowUp,
  TranscriptEntry,
  Claim,
} from './types';
import { COMPLETION_CONFIDENCE, SHALLOW_STRENGTH, TASTE_CATEGORIES } from './types';
import { CATEGORY_META } from './categories';
import { applySignal, initConfidence, overallConfidence } from './confidence';
import { addClaim, claimFromSignal } from './memory';
import { detectContradictions } from './contradiction';
import { buildFollowUp } from './followup';
import { focusCategories, nextCategory, satisfiedCategories } from './planner';
import { HARD_TURN_CAP, nextPhase } from './stateMachine';

const CATEGORY_SET = new Set<string>(TASTE_CATEGORIES);
const isCategory = (v: string): v is TasteCategory => CATEGORY_SET.has(v);

/** The first unraised, unresolved contradiction on the table, if any. */
function firstUnraised(state: InterviewState): Contradiction | null {
  return state.contradictions.find((c) => !c.raised && !c.resolved) ?? null;
}

/** The axis a contradiction is really about — the first axis its two claims share. */
function contradictionAxis(c: Contradiction): TasteCategory | null {
  const set = new Set(c.later.categories);
  return c.earlier.categories.find((cat) => set.has(cat)) ?? null;
}

/** Does this signal speak to a pending follow-up's topic? */
function addressesFollowUp(signal: TasteSignal, followUp: FollowUp): boolean {
  if (followUp.topic === signal.subject) return true;
  if (isCategory(followUp.topic) && (signal.categories ?? []).includes(followUp.topic)) return true;
  return false;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Coerce arbitrary tool output into a well-formed signal. Anything unusable is
 * dropped by the caller (this returns `null`), so `advance` never throws on the
 * garbage a live model can occasionally emit.
 */
function sanitizeSignal(raw: unknown, turn: number, index: number): TasteSignal | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<TasteSignal>;
  const subject = typeof s.subject === 'string' ? s.subject : '';
  const sentiment = s.sentiment;
  const validSentiment =
    sentiment === 'love' || sentiment === 'like' || sentiment === 'neutral' || sentiment === 'dislike' || sentiment === 'hate';
  if (!validSentiment) return null;
  const kind =
    s.kind === 'title' ||
    s.kind === 'genre' ||
    s.kind === 'theme' ||
    s.kind === 'element' ||
    s.kind === 'person' ||
    s.kind === 'attribute' ||
    s.kind === 'meta'
      ? s.kind
      : 'element';
  const categories = Array.isArray(s.categories) ? s.categories.filter((c): c is TasteCategory => isCategory(c as string)) : [];
  return {
    id: typeof s.id === 'string' && s.id ? s.id : `sig:${turn}:${index}`,
    turn,
    kind,
    subject,
    sentiment,
    strength: clamp01(typeof s.strength === 'number' ? s.strength : 0),
    categories,
    ...(typeof s.reason === 'string' ? { reason: s.reason } : {}),
    ...(typeof s.raw === 'string' ? { raw: s.raw } : {}),
  };
}

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

function lineForExplore(category: TasteCategory | null): string {
  if (!category) return "Let's keep going — tell me about something you've watched lately.";
  return CATEGORY_META[category].intent;
}

/**
 * The per-turn decision. Priority: hard-cap completion → raise a live
 * contradiction → confidence-bar completion → greet on turn 0 → the pending
 * follow-up → a fresh low-confidence axis → confirm/wrap when the axes are spent.
 */
export function decide(state: InterviewState): Directive {
  const overall = state.overallConfidence;
  const focus = focusCategories(state.confidence, 3);
  const satisfied = satisfiedCategories(state.confidence);
  const capReached = state.turn >= HARD_TURN_CAP;
  const done = capReached || overall >= COMPLETION_CONFIDENCE;

  const base = {
    focusCategories: focus,
    satisfiedCategories: satisfied,
    overallConfidence: overall,
  };

  // The hard cap ends the interview regardless of anything still open.
  if (capReached) {
    return {
      ...base,
      action: 'complete' as DirectiveAction,
      category: null,
      contradiction: null,
      suggestedLine: "That's a rich picture — let me pull your Verdict DNA together.",
      done: true,
    };
  }

  // A live contradiction is reconciled before anything else.
  const contradiction = firstUnraised(state);
  if (contradiction) {
    return {
      ...base,
      action: 'challenge',
      category: contradictionAxis(contradiction),
      contradiction,
      suggestedLine: contradiction.explanation,
      done: false,
    };
  }

  if (overall >= COMPLETION_CONFIDENCE) {
    return {
      ...base,
      action: 'complete',
      category: null,
      contradiction: null,
      suggestedLine: "I think I've got you. Your Verdict DNA is ready.",
      done: true,
    };
  }

  if (state.turn <= 0) {
    return {
      ...base,
      action: 'greet',
      category: null,
      contradiction: null,
      suggestedLine: "Right — let's find out what you actually like. Tell me about a film or show you absolutely loved.",
      done: false,
    };
  }

  // A pending follow-up beats opening a fresh topic.
  if (state.pendingFollowUp) {
    const topic = state.pendingFollowUp.topic;
    return {
      ...base,
      action: 'followUp',
      category: isCategory(topic) ? topic : null,
      contradiction: null,
      suggestedLine: state.pendingFollowUp.probes[0] ?? 'Say more about that — what specifically?',
      done: false,
    };
  }

  const category = nextCategory(state.confidence, state.askedCategories);
  if (category) {
    return {
      ...base,
      action: 'explore',
      category,
      contradiction: null,
      suggestedLine: lineForExplore(category),
      done: false,
    };
  }

  // Nothing fresh to explore but not yet at the bar → read a theory back / wrap.
  if (overall >= 0.9) {
    return {
      ...base,
      action: 'wrap',
      category: null,
      contradiction: null,
      suggestedLine: "I've got one more for you… then I'll tell you who you are.",
      done: false,
    };
  }
  return {
    ...base,
    action: 'confirm',
    category: null,
    contradiction: null,
    suggestedLine: "Let's test a theory — I think I'm seeing a pattern in what you go for.",
    done: false,
  };
}

// ---------------------------------------------------------------------------
// advance
// ---------------------------------------------------------------------------

const BEAT_FOR_ACTION: Partial<Record<DirectiveAction, TranscriptEntry['beat']>> = {
  challenge: 'challenge',
  confirm: 'theory',
  wrap: 'wrap',
};

/**
 * Fold a turn's signals into a NEW state. Order of operations: sanitize input →
 * bump the turn → fold confidence + claims → detect contradictions against the
 * standing memory → set/clear the pending follow-up → recompute overall
 * confidence → mark the asked axis → recompute phase → append the transcript.
 * Never mutates the input; never throws.
 */
export function advance(
  state: InterviewState,
  incoming: TasteSignal[],
  nowMs: number,
  usedDirective?: Directive,
): InterviewState {
  const turn = state.turn + 1;
  const rawList = Array.isArray(incoming) ? incoming : [];
  const signals = rawList
    .map((s, i) => sanitizeSignal(s, turn, i))
    .filter((s): s is TasteSignal => s !== null);

  // The question this turn answered — recorded as "asked" so we don't repeat it,
  // and so the transcript shows the line actually spoken. Defaults to the dynamic
  // director's decision when the caller doesn't pass the scripted one it used.
  const directive = usedDirective ?? decide(state);

  let confidence = state.confidence;
  let claims: Claim[] = state.claims;
  const newContradictions: Contradiction[] = [];
  const existingIds = new Set(state.contradictions.map((c) => c.id));

  for (const signal of signals) {
    // Detect against the memory that existed BEFORE this signal's own claim.
    for (const c of detectContradictions(claims, signal)) {
      if (!existingIds.has(c.id)) {
        existingIds.add(c.id);
        newContradictions.push(c);
      }
    }
    confidence = applySignal(confidence, signal, turn);
    claims = addClaim(claims, claimFromSignal(signal));
  }

  // Pending follow-up: clear it if this turn answered it with real conviction,
  // then open a new one if a signal came in shallow or a rich subject invites it.
  let pendingFollowUp: FollowUp | null = state.pendingFollowUp;
  if (pendingFollowUp) {
    const answered = signals.some((s) => addressesFollowUp(s, pendingFollowUp!) && s.strength >= SHALLOW_STRENGTH);
    if (answered) pendingFollowUp = null;
  }
  if (!pendingFollowUp) {
    const shallow = signals.find((s) => s.strength < SHALLOW_STRENGTH && (s.categories.length > 0 || s.subject));
    // A confidently-named title with no stated "why" invites a "what grabbed
    // you" — but a genre we just heard about does not re-open on itself.
    const rich = signals.find((s) => s.kind === 'title' && s.strength >= SHALLOW_STRENGTH && !s.reason);
    const trigger = shallow ?? rich;
    if (trigger) {
      pendingFollowUp = buildFollowUp(
        {
          ...(trigger.categories[0] ? { category: trigger.categories[0] } : {}),
          ...(trigger.subject ? { subject: trigger.subject } : {}),
          shallow: trigger === shallow,
        },
        turn,
      );
    }
  }

  const contradictions = newContradictions.length ? [...state.contradictions, ...newContradictions] : state.contradictions;
  const overall = overallConfidence(confidence);

  const askedCategories =
    directive.category && !state.askedCategories.includes(directive.category)
      ? [...state.askedCategories, directive.category]
      : state.askedCategories;

  // Build the interim state, then let the state machine decide the phase.
  const interim: InterviewState = {
    ...state,
    turn,
    confidence,
    claims,
    contradictions,
    signals: signals.length ? [...state.signals, ...signals] : state.signals,
    overallConfidence: overall,
    askedCategories,
    pendingFollowUp,
    updatedAtMs: nowMs,
  };

  const phase = nextPhase(interim);
  const status: InterviewState['status'] = phase === 'complete' ? 'complete' : state.status;

  // Transcript: the interviewer's line this turn, then the user's own words.
  const transcriptAdds: TranscriptEntry[] = [];
  if (directive.suggestedLine) {
    const beat = BEAT_FOR_ACTION[directive.action];
    transcriptAdds.push({
      role: 'interviewer',
      text: directive.suggestedLine,
      atMs: nowMs,
      ...(beat ? { beat } : {}),
    });
  }
  for (const s of signals) {
    if (s.raw) transcriptAdds.push({ role: 'user', text: s.raw, atMs: nowMs });
  }

  return {
    ...interim,
    phase,
    status,
    transcript: transcriptAdds.length ? [...state.transcript, ...transcriptAdds] : state.transcript,
  };
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/** A fresh interview for a user, clocked by the caller. */
export function createInterview(userId: string, nowMs: number): InterviewState {
  return {
    id: `interview:${userId}:${nowMs}`,
    userId,
    status: 'active',
    startedAtMs: nowMs,
    updatedAtMs: nowMs,
    turn: 0,
    phase: 'warmup',
    confidence: initConfidence(),
    signals: [],
    claims: [],
    contradictions: [],
    overallConfidence: 0,
    askedCategories: [],
    pendingFollowUp: null,
    transcript: [],
  };
}
