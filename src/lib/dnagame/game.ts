/**
 * VERD1CT RUSH — the game loop.
 *
 * The existing planner already answers WHAT is worth learning next. This adds
 * the only thing it does not know: HOW to ask, and how to keep the asking from
 * becoming a survey with a wheel drawn behind it.
 *
 * TWO RULES DECIDE THE FORMAT.
 *
 *   1. FIT. A format is chosen for what the profile needs. Broad uncertainty
 *      across many families wants a six-way spread; two traits that are each
 *      half-known but never compared want a duel; a suspected dislike wants a
 *      format that collects rejections, because "no" is scarce evidence and
 *      worth more than another mild "yes".
 *   2. VARIETY. Fit alone produces six identical wheel rounds in a row, which
 *      is the failure mode this product exists to avoid. Recently used formats
 *      are penalised, so the game changes shape every few decisions whether or
 *      not the maths would have.
 *
 * Everything is deterministic given (profile, history, deal index). Same player,
 * same game — which is what makes the persona simulations meaningful.
 *
 * PURE. Time is passed in, never read.
 */

import { TITLES, type DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { observeAll, traitConfidence, traitUncertainty, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { dnaKnown, FAMILIES } from './families';
import {
  CHOICES,
  CHOICES_BY_FAMILY,
  DEALBREAKERS,
  MOOD_WEIGHT,
  PROMPTS,
  ROUND_WEIGHT,
  VIBES,
  type Choice,
  type Round,
  type RoundType,
} from './rounds';

export const GAME_VERSION = 'rush-v1';

/** One recorded decision, with everything a later model would need to weigh it. */
export interface Decision {
  roundType: RoundType;
  /** Ids shown, so a rejection is interpretable after the fact. */
  shown: string[];
  /** Ids chosen (or eliminated, when the round was negative). */
  chosen: string[];
  negative: boolean;
  at: number;
  /** Milliseconds from the round appearing to the choice landing. */
  responseMs: number;
  version: string;
}

export interface GameState {
  profile: TraitProfile;
  decisions: Decision[];
  /** Format history, newest last — drives the variety penalty. */
  recentTypes: RoundType[];
  usedChoiceIds: string[];
  usedTitleIds: string[];
  current: Round | null;
  startedAt: number;
  version: string;
}

/** Enough decisions to be worth something; few enough to stay a game. */
export const MIN_DECISIONS = 25;
export const MAX_DECISIONS = 35;

/** Stop early once we genuinely know someone — not at a fixed question count. */
export const STRONG_READ = 0.72;

export function createGame(startedAt: number, seed: TraitProfile = {}): GameState {
  return {
    profile: seed,
    decisions: [],
    recentTypes: [],
    usedChoiceIds: [],
    usedTitleIds: [],
    current: null,
    startedAt,
    version: GAME_VERSION,
  };
}

/** Uncertainty this choice would resolve, in the units the planner speaks. */
function choiceValue(choice: Choice, profile: TraitProfile): number {
  return choice.effects.reduce(
    (sum, e) => sum + Math.abs(e.pull) * traitUncertainty(profile, e.key),
    0,
  );
}

function titleValue(title: DiagnosticTitle, profile: TraitProfile): number {
  const raw = title.traits.reduce(
    (sum, t) => sum + t.strength * traitUncertainty(profile, t.key),
    0,
  );
  // Recognition is a multiplier, not a bonus: a title nobody has seen returns
  // "haven't seen it", and a round full of those teaches nothing.
  return raw * (0.35 + 0.65 * title.recognition);
}

/** Best unused option in a family, by what it would teach. */
function bestInFamily(familyId: string, profile: TraitProfile, used: Set<string>): Choice | null {
  const pool = (CHOICES_BY_FAMILY.get(familyId) ?? []).filter((x) => !used.has(x.id));
  if (pool.length === 0) return null;
  return pool.reduce((best, x) => (choiceValue(x, profile) > choiceValue(best, profile) ? x : best));
}

/** One option per wedge — the six-way spread every radial round is dealt from. */
function dealWheel(profile: TraitProfile, used: Set<string>): Choice[] {
  return FAMILIES.map((f) => bestInFamily(f.id, profile, used)).filter((x): x is Choice => Boolean(x));
}

/**
 * The two most informative options that DISAGREE.
 *
 * A duel is only worth a turn when the answer separates something. Two options
 * that both point at "likes crime" waste the sharpest format in the game, so
 * candidates are ranked by how much they pull in opposite directions.
 */
function dealDuel(profile: TraitProfile, used: Set<string>): Choice[] {
  const pool = CHOICES.filter((x) => !used.has(x.id));
  let best: [Choice, Choice] | null = null;
  let bestScore = 0;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (a.family === b.family) continue;
      let separation = 0;
      for (const ea of a.effects) {
        const eb = b.effects.find((x) => x.key === ea.key);
        const opposed = eb ? Math.abs(ea.pull - eb.pull) : Math.abs(ea.pull);
        separation += opposed * traitUncertainty(profile, ea.key);
      }
      for (const eb of b.effects) {
        if (a.effects.some((x) => x.key === eb.key)) continue;
        separation += Math.abs(eb.pull) * traitUncertainty(profile, eb.key);
      }
      if (separation > bestScore) {
        bestScore = separation;
        best = [a, b];
      }
    }
  }
  return best ? [best[0], best[1]] : pool.slice(0, 2);
}

function dealTitles(profile: TraitProfile, used: Set<string>, count: number): DiagnosticTitle[] {
  return [...TITLES]
    .filter((t) => !used.has(t.id))
    .sort((a, b) => titleValue(b, profile) - titleValue(a, profile))
    .slice(0, count);
}

const titleChoice = (t: DiagnosticTitle): Choice => ({
  id: t.id,
  label: t.title,
  family: 'mystery',
  titleId: t.id,
  effects: t.traits.map((x) => ({ key: x.key, pull: x.invert ? -x.strength : x.strength })),
});

/**
 * How well each format fits what we still need. Variety is applied on top, in
 * `nextRound`, so fit and boredom stay separable and testable.
 */
function formatFit(profile: TraitProfile, decisionCount: number): Record<RoundType, number> {
  const spread = FAMILIES.map((f) =>
    f.traits.reduce((s, t) => s + traitUncertainty(profile, t.key) * t.weight, 0) /
    f.traits.reduce((s, t) => s + t.weight, 0),
  );
  const breadth = spread.reduce((a, b) => a + b, 0) / spread.length;
  const known = dnaKnown(profile);

  return {
    // Broad unknowns: cover ground fast.
    'pick-your-night': breadth,
    'six-movie': breadth * 0.9 + 0.1,
    // Rejections get more valuable once we have some positives to contrast.
    'one-has-to-go': known * 0.9,
    'nope-two': known * 0.7,
    'pick-two': breadth * 0.7,
    // Duels pay off once the broad picture exists and fine splits remain.
    'head-to-head': known * 1.1,
    // Titles are the strongest evidence; always worth something, more later.
    'movie-lightning': 0.55 + known * 0.5,
    dealbreaker: known * 1.0,
    // A little mood, early, for texture. Never much.
    vibe: decisionCount < 6 ? 0.35 : 0.12,
  };
}

/** Deal a specific format. */
function dealRound(type: RoundType, profile: TraitProfile, state: GameState): Round | null {
  const usedChoices = new Set(state.usedChoiceIds);
  const usedTitles = new Set(state.usedTitleIds);
  const base = { type, prompt: PROMPTS[type] };

  switch (type) {
    case 'pick-your-night':
    case 'one-has-to-go':
    case 'pick-two':
    case 'nope-two': {
      const choices = dealWheel(profile, usedChoices);
      if (choices.length < 4) return null;
      return {
        ...base,
        choices,
        picks: type === 'pick-two' || type === 'nope-two' ? 2 : 1,
        negative: type === 'one-has-to-go' || type === 'nope-two',
        layout: 'wheel',
      };
    }
    case 'head-to-head': {
      const pair = dealDuel(profile, usedChoices);
      if (pair.length < 2) return null;
      return { ...base, choices: pair, picks: 1, negative: false, layout: 'duel' };
    }
    case 'movie-lightning': {
      const [title] = dealTitles(profile, usedTitles, 1);
      if (!title) return null;
      return { ...base, choices: [titleChoice(title)], picks: 1, negative: false, layout: 'poster' };
    }
    case 'six-movie': {
      const titles = dealTitles(profile, usedTitles, 6);
      if (titles.length < 4) return null;
      return {
        ...base,
        choices: titles.map(titleChoice),
        picks: 1,
        negative: false,
        layout: 'wheel',
      };
    }
    case 'dealbreaker': {
      const pool = DEALBREAKERS.filter((x) => !usedChoices.has(x.id))
        .sort((a, b) => choiceValue(b, profile) - choiceValue(a, profile))
        .slice(0, 4);
      if (pool.length < 3) return null;
      return { ...base, choices: pool, picks: 1, negative: false, layout: 'cards' };
    }
    case 'vibe': {
      const pool = VIBES.filter((x) => !usedChoices.has(x.id));
      if (pool.length < 3) return null;
      return { ...base, choices: pool, picks: 1, negative: false, layout: 'cards' };
    }
    default:
      return null;
  }
}

/** How recently this format was used, as a penalty. Newest hurts most. */
function stalenessPenalty(type: RoundType, recent: readonly RoundType[]): number {
  const idx = [...recent].reverse().indexOf(type);
  if (idx === -1) return 0;
  return [0.85, 0.55, 0.3, 0.15][idx] ?? 0.05;
}

/** Choose and deal the next round, or null when the game is done. */
export function nextRound(state: GameState): Round | null {
  if (state.decisions.length >= MAX_DECISIONS) return null;
  if (state.decisions.length >= MIN_DECISIONS && dnaKnown(state.profile) >= STRONG_READ) return null;

  const fit = formatFit(state.profile, state.decisions.length);
  const ranked = (Object.keys(fit) as RoundType[])
    .map((type) => ({ type, score: fit[type] - stalenessPenalty(type, state.recentTypes) }))
    .sort((a, b) => b.score - a.score);

  for (const { type } of ranked) {
    const round = dealRound(type, state.profile, state);
    if (round) return round;
  }
  return null;
}

/** Start, or resume, with the first round dealt. */
export function startGame(state: GameState, now: number): GameState {
  const withStart = { ...state, startedAt: now };
  return { ...withStart, current: nextRound(withStart) };
}

/**
 * Record a decision and deal the next round.
 *
 * A PICK pulls the chosen options' traits toward their direction. An
 * ELIMINATION pushes the chosen option's traits AWAY — the mirror image — which
 * is why the negative formats exist: the same tap buys evidence with the
 * opposite sign, and dislikes are what stop a recommender being bland.
 */
export function choose(
  state: GameState,
  chosenIds: readonly string[],
  now: number,
  responseMs: number,
): GameState {
  const round = state.current;
  if (!round) return state;

  const weight = round.type === 'vibe' ? MOOD_WEIGHT : ROUND_WEIGHT[round.type];
  const direction = round.negative ? -1 : 1;
  const chosen = round.choices.filter((x) => chosenIds.includes(x.id));

  let profile = state.profile;
  for (const choice of chosen) {
    profile = observeAll(
      profile,
      choice.effects.map((e) => {
        const signed = e.pull * direction;
        return {
          key: e.key,
          target: signed >= 0 ? 100 : 0,
          weight: weight * Math.abs(e.pull),
        };
      }),
    );
  }

  const decision: Decision = {
    roundType: round.type,
    shown: round.choices.map((x) => x.id),
    chosen: [...chosenIds],
    negative: round.negative,
    at: now,
    responseMs,
    version: state.version,
  };

  // ONLY WHAT WAS DECIDED IS CONSUMED.
  //
  // Retiring every option merely SHOWN burned six entries per wheel round and
  // emptied the bank after eighteen decisions — the game ended early, having
  // learned less than it should. An option the player passed over is not spent:
  // seeing "ghost story" beside a heist teaches something different from seeing
  // it beside a serial-killer hunt, and the router already avoids monotony on
  // its own. Titles are the exception — asking about the same film twice is
  // just a bug.
  const next: GameState = {
    ...state,
    profile,
    decisions: [...state.decisions, decision],
    recentTypes: [...state.recentTypes, round.type].slice(-5),
    usedChoiceIds: [...state.usedChoiceIds, ...chosen.filter((x) => !x.titleId).map((x) => x.id)],
    usedTitleIds: [...state.usedTitleIds, ...round.choices.filter((x) => x.titleId).map((x) => x.id)],
    current: null,
  };
  return { ...next, current: nextRound(next) };
}

/** A movie reaction — the strongest evidence the game collects. */
export function reactToTitle(
  state: GameState,
  reaction: 'yes' | 'no' | 'pass',
  now: number,
  responseMs: number,
): GameState {
  const round = state.current;
  if (!round || round.layout !== 'poster') return state;
  const choice = round.choices[0];
  if (!choice) return state;

  let profile = state.profile;
  if (reaction !== 'pass') {
    const liked = reaction === 'yes';
    profile = observeAll(
      profile,
      choice.effects.map((e) => {
        const positive = e.pull >= 0 ? liked : !liked;
        return {
          key: e.key,
          target: positive ? 100 : 0,
          weight: ROUND_WEIGHT['movie-lightning'] * Math.abs(e.pull),
        };
      }),
    );
  }

  const next: GameState = {
    ...state,
    profile,
    decisions: [
      ...state.decisions,
      {
        roundType: 'movie-lightning',
        shown: [choice.id],
        chosen: [reaction],
        negative: false,
        at: now,
        responseMs,
        version: state.version,
      },
    ],
    recentTypes: [...state.recentTypes, 'movie-lightning' as RoundType].slice(-5),
    usedChoiceIds: state.usedChoiceIds,
    usedTitleIds: [...state.usedTitleIds, choice.id],
    current: null,
  };
  return { ...next, current: nextRound(next) };
}

/** Decisions that produced evidence — a PASS teaches nothing. */
export function meaningfulDecisions(state: GameState): number {
  return state.decisions.filter((d) => !(d.roundType === 'movie-lightning' && d.chosen[0] === 'pass')).length;
}

/** Traits we have learned something real about. */
export function traitsCaptured(state: GameState, min = 0.2): number {
  const keys = new Set<TraitKey>();
  for (const key of Object.keys(state.profile) as TraitKey[]) {
    if (traitConfidence(state.profile, key) >= min) keys.add(key);
  }
  return keys.size;
}

export function passRate(state: GameState): number {
  const movies = state.decisions.filter((d) => d.roundType === 'movie-lightning');
  if (movies.length === 0) return 0;
  return movies.filter((d) => d.chosen[0] === 'pass').length / movies.length;
}

export function isComplete(state: GameState): boolean {
  return state.current === null && state.decisions.length > 0;
}
