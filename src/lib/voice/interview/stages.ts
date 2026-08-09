/**
 * THE STAGED SCRIPT — the interview's spine.
 *
 * The dynamic director (`decide`) is a fine adaptive engine, but the *product*
 * wants a deliberate, repeatable shape every user walks through:
 *
 *   1. GENRE TRIAGE  — rapid-fire grouped genre triples. "Of these three, which
 *      pulls you in most?" Four quick triples map the broad genre landscape in
 *      under a minute, with zero dead air.
 *   2. DRILL-DOWN    — adaptive. Reads what lit them up in triage and digs into
 *      the corner of it that actually defines them (crime → heists vs. detectives
 *      vs. serial-killers; horror → supernatural vs. grounded).
 *   3. VIEWING PREFS — the cross-genre axes that decide whether a title lands:
 *      pacing, tone, violence tolerance, subtitles/foreign.
 *   4. TITLE ANCHORS — one they loved, one they couldn't finish. Concrete titles
 *      anchor the whole profile and feed the contradiction engine.
 *
 * `planDirective(state)` is what the server hands the client each turn. It is the
 * scripted counterpart to `decide`: it FIRST lets the pure engine preempt for the
 * things only the engine can judge — a live contradiction to reconcile, or the
 * completion/turn-cap that guarantees termination — and OTHERWISE walks the
 * script by turn index. When the script is spent it completes cleanly, so the
 * interview is a crisp, designed length rather than an open-ended crawl.
 *
 * PURE. Same state in → same directive out. No clock, no I/O, no LLM. The engine
 * still folds every answer's signals into confidence + DNA exactly as before —
 * this module only chooses which line the interviewer says next.
 */
import type { Directive, InterviewState, TasteCategory, Claim } from './types';
import { decide } from './director';
import { focusCategories, satisfiedCategories } from './planner';
import { normalizeSubject } from './categories';

/** The four product stages, plus the natural wrap the engine finishes on. */
export type InterviewStage = 'genre_triage' | 'drill_down' | 'viewing_prefs' | 'title_anchors' | 'wrap';

export const STAGE_LABELS: Record<InterviewStage, string> = {
  genre_triage: 'Genre triage',
  drill_down: 'Drilling in',
  viewing_prefs: 'How you watch',
  title_anchors: 'Your anchors',
  wrap: 'Reading your DNA',
};

interface ScriptStep {
  stage: InterviewStage;
  action: Directive['action'];
  category: TasteCategory | null;
  /** The line the interviewer says this turn. A function so drill-down can adapt. */
  line: (state: InterviewState) => string;
}

// ---------------------------------------------------------------------------
// STAGE 1 — rapid-fire grouped genre triples.
// Four triples cover the broad landscape. The first doubles as the greeting so
// there is no wasted turn. `deriveSignal` / the model resolve the spoken genre to
// its axes, so answering "crime" moves both `genres` and `crime`.
// ---------------------------------------------------------------------------

/** The genre triples, in order. Kept small and punchy — this stage is a sprint. */
export const GENRE_TRIPLES: readonly (readonly [string, string, string])[] = [
  ['horror', 'comedy', 'crime'],
  ['sci-fi', 'romance', 'action'],
  ['fantasy', 'documentary', 'thriller'],
  ['war', 'mystery', 'animation'],
];

function tripleLine(triple: readonly [string, string, string]): string {
  const [a, b, c] = triple;
  return `${a}, ${b}, or ${c}?`;
}

// ---------------------------------------------------------------------------
// STAGE 2 — adaptive drill-down.
// A drill prompt per genre; we pick the one the user leaned into hardest during
// triage. `GENRE_DRILL` keys are the normalized genre words `deriveSignal`
// produces, so a triage answer maps straight to a follow-up.
// ---------------------------------------------------------------------------

export const GENRE_DRILL: Record<string, string> = {
  crime: 'Crime it is — which corner: heists, detectives, or the serial-killer stuff?',
  horror: 'Horror — do you want supernatural dread, or a grounded, human kind of scary?',
  comedy: 'What actually makes you laugh — dry and dark, or big and warm?',
  'sci-fi': 'Sci-fi — big ideas that make you think, or spectacle and adventure?',
  scifi: 'Sci-fi — big ideas that make you think, or spectacle and adventure?',
  'science fiction': 'Sci-fi — big ideas that make you think, or spectacle and adventure?',
  fantasy: 'Fantasy — sweeping epic worlds, or something smaller and stranger?',
  romance: 'Romance — sweeping and epic, or sharp and funny?',
  thriller: 'Thrillers — is the tension in the mind, or in the chase?',
  thrillers: 'Thrillers — is the tension in the mind, or in the chase?',
  mystery: 'Mysteries — a cosy whodunit, or something darker and more twisted?',
  action: 'Action — grounded and gritty, or all-out spectacle?',
  documentary: 'Docs — true crime, nature, music, or the deep-dive kind?',
  documentaries: 'Docs — true crime, nature, music, or the deep-dive kind?',
  war: 'War stories — the battlefield itself, or the human cost around it?',
  animation: 'Animation — the big studio stuff, or anime and the artier end?',
  animated: 'Animation — the big studio stuff, or anime and the artier end?',
  drama: 'Drama — do you want it to gut you, or just move you a little?',
};

/** Genre words we recognise for drill-down, longest first for greedy matching. */
const GENRE_DRILL_KEYS = Object.keys(GENRE_DRILL).sort((a, b) => b.length - a.length);

/** Map a spoken subject to a drill key, or null if it names no known genre. */
function drillKeyFor(subject: string): string | null {
  const norm = normalizeSubject(subject);
  if (!norm) return null;
  if (GENRE_DRILL[norm]) return norm;
  return GENRE_DRILL_KEYS.find((k) => norm === k || norm.includes(k)) ?? null;
}

/**
 * The genres the user leaned into during triage, strongest first. A claim counts
 * when it reads positive (love/like) and names a genre we can drill into.
 * Deterministic: sort by strength desc, then most-recent turn, then order.
 */
export function likedGenres(state: InterviewState): { key: string; claim: Claim }[] {
  const positives = (Array.isArray(state.claims) ? state.claims : []).filter(
    (c) => c.sentiment === 'love' || c.sentiment === 'like',
  );
  const hits: { key: string; claim: Claim }[] = [];
  const seen = new Set<string>();
  for (const claim of positives) {
    const key = drillKeyFor(claim.subject);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    hits.push({ key, claim });
  }
  return hits.sort((a, b) => b.claim.strength - a.claim.strength || b.claim.turn - a.claim.turn);
}

/** The nth (0-based) drill line, adapting to what triage surfaced. */
function drillLine(state: InterviewState, rank: number): { line: string; category: TasteCategory | null } {
  const liked = likedGenres(state);
  const pick = liked[rank] ?? liked[0];
  if (pick) {
    const category = pick.claim.categories.find((c) => c !== 'genres') ?? 'genres';
    return { line: GENRE_DRILL[pick.key]!, category };
  }
  // Nothing recognisable from triage — a graceful generic that still teaches us.
  return rank === 0
    ? { line: 'Of everything so far, which one could you watch on a loop and never tire of?', category: 'rewatchability' }
    : { line: 'And what’s the one kind of thing you’ll almost never put on?', category: 'genres' };
}

// ---------------------------------------------------------------------------
// STAGE 3 — viewing preferences (the cross-genre axes).
// ---------------------------------------------------------------------------

const VIEWING_PREFS: readonly { line: string; category: TasteCategory }[] = [
  { line: 'Now, how you like it made: a slow burn that earns it, or something that grabs you from frame one?', category: 'pacing' },
  { line: 'When you sit down to watch, are you reaching for something bleak and intense, or warm and easy?', category: 'mood' },
  { line: 'How much on-screen violence is too much — no limit, or you’d rather it stayed off-screen?', category: 'violenceTolerance' },
  { line: 'And subtitles — completely fine, or a bit of a dealbreaker?', category: 'subtitles' },
];

// ---------------------------------------------------------------------------
// STAGE 4 — title anchors.
// ---------------------------------------------------------------------------

const TITLE_ANCHORS: readonly { line: string; action: Directive['action'] }[] = [
  { line: 'Nearly there. Name one film or show you absolutely loved — first that comes to mind.', action: 'explore' },
  { line: 'And one you started but just couldn’t finish?', action: 'wrap' },
];

// ---------------------------------------------------------------------------
// THE SCRIPT — a flat, ordered list of steps indexed by turn.
// ---------------------------------------------------------------------------

const GREETING = 'Right — let’s find what you actually love, and fast. Gut reaction, no overthinking. Of these three, which pulls you in most:';

const SCRIPT: readonly ScriptStep[] = [
  // Stage 1 — genre triage (turns 0..3)
  {
    stage: 'genre_triage',
    action: 'greet',
    category: 'genres',
    line: () => `${GREETING} ${tripleLine(GENRE_TRIPLES[0]!)}`,
  },
  ...GENRE_TRIPLES.slice(1).map(
    (triple): ScriptStep => ({
      stage: 'genre_triage',
      action: 'explore',
      category: 'genres',
      line: () => `And of these — ${tripleLine(triple)}`,
    }),
  ),
  // Stage 2 — drill-down (turns 4..5)
  {
    stage: 'drill_down',
    action: 'followUp',
    category: null,
    line: (s) => drillLine(s, 0).line,
  },
  {
    stage: 'drill_down',
    action: 'followUp',
    category: null,
    line: (s) => drillLine(s, 1).line,
  },
  // Stage 3 — viewing preferences (turns 6..9)
  ...VIEWING_PREFS.map(
    (p): ScriptStep => ({
      stage: 'viewing_prefs',
      action: 'explore',
      category: p.category,
      line: () => p.line,
    }),
  ),
  // Stage 4 — title anchors (turns 10..11)
  ...TITLE_ANCHORS.map(
    (a): ScriptStep => ({
      stage: 'title_anchors',
      action: a.action,
      category: null,
      line: () => a.line,
    }),
  ),
];

/** The total number of scripted questions before the interview wraps. */
export const SCRIPT_LENGTH = SCRIPT.length;

/** The stage the interview is in on a given turn (for optional UI progress). */
export function currentStage(state: InterviewState): InterviewStage {
  const step = SCRIPT[state.turn];
  return step ? step.stage : 'wrap';
}

/** The line spoken when the script is complete and the DNA is being assembled. */
const WRAP_LINE = 'That’s everything I need. Give me a second — I’m reading your Verdict DNA.';

/**
 * The scripted per-turn directive the server returns to the client.
 *
 * Order of authority:
 *   1. The pure engine preempts for what only it can judge — a live contradiction
 *      to reconcile, or the completion/turn-cap that guarantees the interview
 *      always terminates. (`decide` returns `challenge` / `complete` for these.)
 *   2. Otherwise walk the script by turn index.
 *   3. When the script is spent, complete cleanly.
 *
 * Same drill-down category resolution the script uses is reflected back so the
 * engine marks the right axis as asked.
 */
export function planDirective(state: InterviewState): Directive {
  const base = {
    focusCategories: focusCategories(state.confidence, 3),
    satisfiedCategories: satisfiedCategories(state.confidence),
    overallConfidence: state.overallConfidence,
  };

  // 1. Let the engine preempt for a contradiction or for completion/turn-cap.
  const engine = decide(state);
  if (engine.action === 'challenge' || engine.action === 'complete') return engine;

  // 2. Walk the script.
  const step = SCRIPT[state.turn];
  if (step) {
    // For drill-down, resolve the adaptive category alongside the line.
    const category =
      step.stage === 'drill_down'
        ? drillLine(state, state.turn - firstDrillTurn()).category
        : step.category;
    return {
      ...base,
      action: step.action,
      category,
      contradiction: null,
      suggestedLine: step.line(state),
      done: false,
    };
  }

  // 3. Script exhausted → wrap and reveal.
  return {
    ...base,
    action: 'complete',
    category: null,
    contradiction: null,
    suggestedLine: WRAP_LINE,
    done: true,
  };
}

/** The turn index of the first drill-down step (Stage 1 length). */
function firstDrillTurn(): number {
  return SCRIPT.findIndex((s) => s.stage === 'drill_down');
}
