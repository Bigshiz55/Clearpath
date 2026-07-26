/**
 * VERD1CT VOICE DNA — the structured reason graph.
 *
 * A taste interview is not a survey. When someone says "I hate science fiction,
 * but I loved Severance" they have told us four separate things: a durable
 * dislike, a named exception to it, a positive reaction to a title, and — by
 * using the word "but" — that they themselves consider these in tension. A
 * survey records "dislikes sci-fi" and then buries Severance. This module keeps
 * all four.
 *
 * Everything here is a claim in a graph:
 *
 *   profile → title → reaction → attribute → reason
 *                                   ↳ strength, confidence
 *                                   ↳ durable | temporary
 *                                   ↳ general | exception | conditional
 *                                   ↳ evidence source + the user's own words
 *
 * Pure data. No I/O, no model calls, no Supabase — the whole layer is a
 * deterministic function of the transcript, so it is testable, reproducible,
 * and reversible (drop a claim, rebuild the profile).
 *
 * This lives OUTSIDE `src/lib/scoring/`: the deterministic Watchability engine
 * is untouched. Voice DNA feeds the personalization layer only.
 */

/** How a user reacted to a specific title. */
export type Reaction =
  | 'loved'
  | 'liked'
  | 'mixed'
  | 'disliked'
  | 'hated'
  | 'abandoned'
  | 'avoided'
  | 'curious';

/**
 * Does this belief describe the person, or just this week?
 *
 * "I hate horror" shapes recommendations forever. "I'm not in the mood for
 * anything heavy" must expire, or a bad Tuesday becomes a permanent rule.
 * `unknown` means we have no marker either way and will not guess.
 */
export type Durability = 'durable' | 'temporary' | 'unknown';

/**
 * How widely a claim applies.
 *  - `general`     — the everyday rule ("I don't like horror")
 *  - `exception`   — a named carve-out from a rule ("...but Silence of the Lambs")
 *  - `conditional` — the rule is gated on something ("...unless there's English audio")
 */
export type Scope = 'general' | 'exception' | 'conditional';

/** Whether a condition switches a claim OFF or is required to switch it ON. */
export type ConditionMode = 'suspends' | 'requires';

/** Where a claim came from. Never inferred — always recorded. */
export type EvidenceSource =
  | 'typed_interview'
  | 'voice_interview'
  | 'quiz'
  | 'import'
  | 'behaviour'
  | 'manual_edit';

/** A parsed condition attached to a conditional claim. */
export interface Condition {
  /** The user's own words for the condition. */
  text: string;
  /** Attribute keys recognised inside the condition (may be empty). */
  attributes: string[];
  mode: ConditionMode;
}

/** A title the user named, resolved against the catalog when possible. */
export interface TitleRef {
  /** Stable id ("movie:274") when we matched it; null when we only have text. */
  titleId: string | null;
  /** Exactly what the user typed/said. */
  text: string;
  /** True when the mention is a guess that review must confirm. */
  needsConfirmation: boolean;
}

/**
 * One belief, extracted from one span of what the user actually said.
 *
 * A claim is never invented: `quote` is always a verbatim substring of the
 * user's input, so every line of the eventual DNA read-out can be traced back
 * to the sentence that produced it.
 */
export interface Claim {
  id: string;
  /** Attribute key from the lexicon, or null for a bare title reaction. */
  attribute: string | null;
  /** +1 they want more of it, -1 they want less. */
  polarity: -1 | 1;
  /** 0..1 — how forcefully they said it ("hate" > "not big on"). */
  strength: number;
  /** 0..1 — how sure we are we understood them. */
  confidence: number;
  durability: Durability;
  scope: Scope;
  condition?: Condition;
  /** The title this claim is about, if any. */
  title?: TitleRef;
  reaction?: Reaction;
  source: EvidenceSource;
  /** Verbatim span from the user's input. */
  quote: string;
  /** Epoch ms. Supplied by the caller — this layer never reads the clock. */
  at: number;
  /**
   * Claim ids this one was asserted *against* — set when the user used a
   * contrast word ("but", "though"). The tension is the user's own, not ours.
   */
  contrasts?: string[];
  /** Set by review when the user corrects or confirms us. */
  reviewed?: boolean;
  /**
   * A NEVER-RECOMMEND line, not merely a strong dislike. Only ever set when the
   * user picks it explicitly — inferring one from a negative answer is exactly
   * the mistake that makes a recommender feel punitive.
   */
  hardExclusion?: boolean;
  /**
   * The user told us something real that we cannot turn into a filter ("the
   * acting was great"). Recorded and shown back, weighted at zero, so we
   * neither drop it silently nor pretend it steers anything.
   */
  unactionable?: boolean;
  /** How much of a series they actually watched, for abandoned titles. */
  watchedFraction?: 'barely' | 'some' | 'most';
}

/** A named carve-out: a general rule that a specific title or condition escapes. */
export interface Exception {
  /** The general claim being escaped. */
  ruleClaimId: string;
  ruleAttribute: string;
  /** The claim that establishes the escape. */
  exceptionClaimId: string;
  title?: TitleRef;
  condition?: Condition;
  /** Did the user say "but" themselves, or did we notice the tension? */
  stated: boolean;
  /** Plain-language line for the review screen. */
  summary: string;
}

/**
 * Two durable general claims that genuinely disagree. Not the same as an
 * exception — this is "I love slow burns" next to "I hate slow shows", which
 * only the user can settle.
 */
export interface Conflict {
  attribute: string;
  positiveClaimId: string;
  negativeClaimId: string;
  /** What to ask to settle it. */
  question: string;
  options: Array<{ value: string; label: string }>;
}

/** An accumulated belief about one attribute. */
export interface AttributeBelief {
  /** -1..1 — negative means avoid, positive means seek. */
  lean: number;
  /** Total evidence weight (>= 0). */
  evidence: number;
  /** 0..1, saturating on evidence. */
  confidence: number;
  /** Exceptions that narrow this rule. */
  exceptions: Exception[];
  /** Conditions that gate it. */
  conditions: Condition[];
  /** True once enough exceptions pile up that the "rule" is not really a rule. */
  overruled: boolean;
}

/** A single line of the Instant DNA reveal, with the words that produced it. */
export interface RevealLine {
  attribute: string | null;
  text: string;
  /** The user's own words. */
  quote: string;
  confidence: number;
  durability: Durability;
  kind: 'rule' | 'exception' | 'condition' | 'mood' | 'title';
}

/** The finished profile the interview produces. */
export interface VoiceProfile {
  /** Durable attribute beliefs. */
  attributes: Record<string, AttributeBelief>;
  /** Per content-dimension target positions, 0..100 (50 = no lean). */
  dims: Record<string, { pref: number; evidence: number }>;
  /** Genre slug → lean (-1..1) + evidence. */
  genres: Record<string, { lean: number; evidence: number }>;
  exceptions: Exception[];
  conflicts: Conflict[];
  /** Mood claims, kept apart from everything above. They expire. */
  temporary: Claim[];
  /** Titles the user named, with the reaction they gave. */
  titles: Array<{ title: TitleRef; reaction: Reaction; claimId: string }>;
  /** How many durable claims went in. */
  claimCount: number;
  /** 0..1 — how much of the person we can honestly say we have. */
  coverage: number;
}
