/**
 * VOICE INTERVIEW — the shared type contract (the integration spine).
 *
 * This is the ONE place every subsystem of the voice interview agrees on its
 * data shapes: the confidence model, the taste signals the interviewer
 * extracts, the memory of what was claimed, the contradiction record, the
 * per-turn director decision, and the full server-persisted interview state.
 *
 * Everything in `src/lib/voice/interview/*` is PURE and deterministic (no I/O,
 * no clock, no LLM call at import) so the whole conversation engine — planner,
 * follow-up, contradiction, state machine, director, DNA updater — is unit
 * testable without a key, a network, or a database. The OpenAI Realtime layer
 * (`src/lib/voice/realtime/*`) and the server persistence
 * (`src/lib/voice/interview/store.ts`, server actions) are the only parts that
 * touch the outside world, and they are gated on `OPENAI_API_KEY` so the whole
 * feature degrades safely to a keyless browser-speech fallback.
 */

// ---------------------------------------------------------------------------
// TASTE CATEGORIES — the interpretable axes the interview builds confidence in.
// The director only ever asks about categories whose confidence is still low,
// and stops entirely once overall confidence clears the completion bar.
// ---------------------------------------------------------------------------

export const TASTE_CATEGORIES = [
  'genres',
  'themes',
  'pacing',
  'violenceTolerance',
  'comedyTolerance',
  'horrorTolerance',
  'subtitles',
  'blackAndWhite',
  'foreignFilms',
  'actors',
  'directors',
  'mood',
  'timePeriods',
  'animation',
  'tvVsMovies',
  'documentaries',
  'twistEndings',
  'darkEndings',
  'feelGood',
  'rewatchability',
  'complexity',
  'emotionalIntensity',
  'mystery',
  'psychologicalThrillers',
  'crime',
  'trueStory',
  'sciFi',
  'fantasy',
  'romance',
  'musicals',
  'family',
  'holiday',
  'sports',
  'war',
  'westerns',
  'superheroes',
] as const;

export type TasteCategory = (typeof TASTE_CATEGORIES)[number];

/**
 * A short, human label + one-line description for each category, so the topic
 * planner can hand the interviewer a natural way to broach a subject and the
 * live DNA panel can render it. Kept beside the list so a new category cannot
 * be added without a label.
 */
export interface CategoryMeta {
  category: TasteCategory;
  label: string;
  /** What the interviewer is trying to learn — steers the model's phrasing. */
  intent: string;
  /**
   * Weight in the overall-confidence roll-up. Core axes (genres, pacing, mood,
   * violence/comedy/horror tolerance, complexity, emotional intensity) matter
   * more than niche ones (musicals, holiday); a high overall score must not be
   * reachable by only nailing the niche axes.
   */
  weight: number;
}

// ---------------------------------------------------------------------------
// CONFIDENCE
// ---------------------------------------------------------------------------

export interface CategoryConfidence {
  category: TasteCategory;
  /** 0..1 — how well we believe we understand this axis for this user. */
  confidence: number;
  /** How many distinct signals have touched this axis (drives diminishing returns). */
  signalCount: number;
  /** The last turn on which a signal moved this axis (for "recently probed"). */
  lastUpdatedTurn: number;
}

export type ConfidenceState = Record<TasteCategory, CategoryConfidence>;

// ---------------------------------------------------------------------------
// SIGNALS — a structured taste observation the interviewer extracts from a
// user turn. The OpenAI Realtime model reports these through a `record_signal`
// tool call; the browser-speech fallback derives them from a lightweight
// interpreter. Either way they are the ONLY thing that moves confidence + DNA.
// ---------------------------------------------------------------------------

export type Sentiment = 'love' | 'like' | 'neutral' | 'dislike' | 'hate';

export type SignalKind =
  | 'title' // "loved Prisoners"
  | 'genre' // "into crime"
  | 'theme' // "revenge stories"
  | 'element' // "slow burn", "twist endings", "subtitles are fine"
  | 'person' // "Denis Villeneuve", "Tom Hardy"
  | 'attribute' // "black and white is a hard no"
  | 'meta'; // "I mostly watch on my phone" (viewing habit)

export interface TasteSignal {
  id: string;
  turn: number;
  kind: SignalKind;
  /** The thing itself, in the user's frame: "Prisoners", "horror", "slow burn". */
  subject: string;
  sentiment: Sentiment;
  /** 0..1 conviction — "absolutely loved" is 1, "it was fine" is ~0.2. */
  strength: number;
  /** Which taste axes this signal informs (a title can touch several). */
  categories: TasteCategory[];
  /** The "why", when the user gave one: "the tension", "the mystery". */
  reason?: string;
  /** The user's own words, for the transcript + contradiction memory. */
  raw?: string;
}

// ---------------------------------------------------------------------------
// MEMORY + CONTRADICTIONS
// ---------------------------------------------------------------------------

/** A remembered claim — the durable trace a signal leaves for later reference. */
export interface Claim {
  id: string;
  turn: number;
  subject: string;
  categories: TasteCategory[];
  sentiment: Sentiment;
  strength: number;
  raw?: string;
}

export type ContradictionKind =
  | 'category_vs_title' // "hate horror" then "loved Silence of the Lambs"
  | 'sentiment_flip' // "love X" then later "actually X was boring"
  | 'attribute_conflict'; // "subtitles are a dealbreaker" then "loved Parasite"

export interface Contradiction {
  id: string;
  kind: ContradictionKind;
  /** The earlier claim and the later one that conflicts with it. */
  earlier: Claim;
  later: Claim;
  /** A plain-language explanation the interviewer can voice, gently. */
  explanation: string;
  /** True once the interviewer has raised it (so it is challenged only once). */
  raised: boolean;
  /** True once the user has reconciled it (their reply resolved the tension). */
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// CONVERSATION STATE MACHINE
// ---------------------------------------------------------------------------

export type InterviewStatus = 'active' | 'complete' | 'abandoned';

export type InterviewPhase =
  | 'warmup' // the greeting + first easy question
  | 'exploring' // breadth: touch the low-confidence axes
  | 'probing' // depth: never accept a shallow answer, dig with follow-ups
  | 'challenging' // surface + reconcile a contradiction
  | 'confirming' // read back a theory, "let's test a theory…"
  | 'wrapping' // "I've got one more for you…", then reveal
  | 'complete';

export interface FollowUp {
  /** The axis or subject we are drilling into. */
  topic: string;
  /** Candidate probe lines, most specific first (the model picks/rephrases one). */
  probes: string[];
  /** Why we are following up (drives the phrasing: shallow answer vs. curiosity). */
  reason: string;
  /** The turn this follow-up was opened on (so it expires if the user moves on). */
  openedTurn: number;
}

export interface TranscriptEntry {
  role: 'interviewer' | 'user';
  text: string;
  atMs: number;
  /** Marks an "Interesting…" / theory / challenge moment for the UI to animate. */
  beat?: 'insight' | 'challenge' | 'theory' | 'wrap';
}

/**
 * THE FULL INTERVIEW STATE — server-persisted (see store.ts), resumable, and
 * the single source of truth the director reads and writes each turn. Pure
 * data: no functions, no clock captured, so it round-trips through JSON and
 * the DB untouched.
 */
export interface InterviewState {
  id: string;
  userId: string;
  status: InterviewStatus;
  startedAtMs: number;
  updatedAtMs: number;
  turn: number;
  phase: InterviewPhase;
  confidence: ConfidenceState;
  signals: TasteSignal[];
  claims: Claim[];
  contradictions: Contradiction[];
  /** 0..1 weighted roll-up of category confidence — the completion signal. */
  overallConfidence: number;
  /** Categories the director has already spent a question on (avoid repeats). */
  askedCategories: TasteCategory[];
  /** An open follow-up we owe the user before moving on, if any. */
  pendingFollowUp: FollowUp | null;
  transcript: TranscriptEntry[];
  /**
   * RAPID-FIRE SCRIPT PROGRESS (stages 1–4). Optional, and structural rather
   * than imported, so `script/*` can depend on this module without a cycle and
   * so an interview row persisted before the scripted flow existed still loads.
   * Everything about stage 2 is DERIVED from `genreScores` on demand, which is
   * why so little is stored: there is no second source of truth to drift.
   */
  script?: {
    /** Question ids already answered, in order. */
    answeredIds: string[];
    /** Stage-1 genre key → 1–10 score. Gates every drill-down. */
    genreScores: Record<string, number>;
    /** Titles named in stage 4. */
    anchors: { title: string; polarity: 'positive' | 'negative' }[];
  };
}

// ---------------------------------------------------------------------------
// DIRECTOR — the per-turn decision. Given the current state, decide what the
// interviewer should do next and what to steer the Realtime model toward. The
// model does the talking; the director decides the strategy and owns "are we
// done".
// ---------------------------------------------------------------------------

export type DirectiveAction =
  | 'greet'
  | 'explore' // ask about a fresh low-confidence axis
  | 'followUp' // dig into the pending follow-up / a shallow answer
  | 'challenge' // raise a contradiction
  | 'confirm' // read a theory back
  | 'wrap' // "one more for you…"
  | 'complete'; // stop; DNA is ready

export interface Directive {
  action: DirectiveAction;
  /** The axis this turn is primarily about, when applicable. */
  category: TasteCategory | null;
  /** Low-confidence axes worth steering toward (the model may weave them in). */
  focusCategories: TasteCategory[];
  /** High-confidence axes to STOP asking about — the "don't waste their time" list. */
  satisfiedCategories: TasteCategory[];
  /** The contradiction to raise, when action === 'challenge'. */
  contradiction: Contradiction | null;
  /** A ready-to-voice suggested line (the model rephrases in its own voice). */
  suggestedLine: string;
  /** True when the interview should end this turn. */
  done: boolean;
  /** The current 0..1 overall confidence, for the meter. */
  overallConfidence: number;
}

// ---------------------------------------------------------------------------
// COMPLETION / REVEAL — the "Your Verdict DNA is ready" payload.
// ---------------------------------------------------------------------------

export interface DnaRevealCategory {
  category: TasteCategory;
  label: string;
  confidence: number;
  /** -1..1 net disposition (loved ↔ avoided), for the DNA visualization. */
  disposition: number;
}

export interface DnaReveal {
  overallConfidence: number;
  /** How unusual this taste profile is vs. the population, 0..1 (0 = mainstream). */
  distinctiveness: number;
  topCategories: DnaRevealCategory[];
  dealBreakers: string[]; // "black-and-white", "musicals"
  mustHaves: string[]; // "a real twist", "a slow burn that earns it"
  /** Titles the profile predicts a love/hate for — resolved by the caller. */
  predictedLoves: string[];
  predictedHates: string[];
  hiddenDiscoveries: string[];
}

// ---------------------------------------------------------------------------
// COMPLETION BAR — the interview stops automatically at this overall confidence.
// Exported so the director and the tests agree on exactly one threshold.
// ---------------------------------------------------------------------------

/** Interview auto-completes once weighted overall confidence clears this. */
export const COMPLETION_CONFIDENCE = 0.95;

/** Below this a per-category answer is "shallow" and earns a follow-up. */
export const SHALLOW_STRENGTH = 0.35;
