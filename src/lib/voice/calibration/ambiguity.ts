/**
 * THE TWO QUESTIONS WORTH ASKING.
 *
 * Fifteen numbers buy a baseline, and the baseline is where the cheap wins are.
 * Intelligence belongs AFTER it, spent on the places where the numbers disagree
 * with something we already knew — "Horror: 1" from someone who loved The
 * Silence of the Lambs is not a preference, it is an ambiguity about what the
 * word `horror` meant to them.
 *
 * So this looks for exactly that kind of collision and returns at most TWO very
 * short questions. Never more: a third question turns a calibration back into
 * the interview this replaced.
 *
 * DETERMINISTIC AND RULE-BASED, on purpose. No model call — the repo forbids an
 * LLM in a user request path, and a fixed rule table is also the only version of
 * this that can be tested. Each rule states the collision it detects, the one
 * short question that resolves it, and what each answer writes back.
 *
 * PURE. No I/O.
 */

import type { DnaState } from '@/lib/preference/types';
import { evidenceConfidence } from '@/lib/preference/confidence';

/** What an answer records — the same correction vocabulary the engine speaks. */
export interface AmbiguityOutcome {
  dims?: Array<{ key: string; target: number }>;
  genres?: Array<{ genre: string; target: number }>;
}

export interface AmbiguityQuestion {
  id: string;
  /** Spoken and shown verbatim. Short enough to answer in one breath. */
  question: string;
  positiveLabel: string;
  negativeLabel: string;
  onPositive: AmbiguityOutcome;
  onNegative: AmbiguityOutcome;
  /** Higher wins when more than two rules fire. */
  weight: number;
}

/** Hard cap. Two is the product; three is a relapse. */
export const MAX_AMBIGUITY_QUESTIONS = 2;

/**
 * WHAT EACH ANSWER MEANS, keyed by question id and separate from the rules that
 * decide whether to ask. The server re-reads an answer through this table
 * rather than trusting the client to send an outcome back — the rule table is
 * the authority on what "Good" meant, and a client that could name its own
 * consequence could rewrite someone's DNA by posting a crafted payload.
 */
const OUTCOMES: Record<string, { positive: AmbiguityOutcome; negative: AmbiguityOutcome }> = {
  'horror-psychological': {
    positive: { dims: [{ key: 'realism', target: 80 }], genres: [{ genre: 'thriller', target: 85 }] },
    negative: { genres: [{ genre: 'horror', target: 5 }] },
  },
  'ghosts-not-gore': {
    positive: { dims: [{ key: 'violence', target: 20 }], genres: [{ genre: 'fantasy', target: 80 }] },
    negative: { genres: [{ genre: 'horror', target: 5 }, { genre: 'fantasy', target: 30 }] },
  },
  'crime-fiction-only': {
    positive: { genres: [{ genre: 'documentary', target: 70 }] },
    negative: { genres: [{ genre: 'documentary', target: 15 }] },
  },
  'slow-burn-pace': {
    positive: { dims: [{ key: 'pacing', target: 45 }] },
    negative: { dims: [{ key: 'pacing', target: 90 }] },
  },
  'foreign-dubbed': {
    positive: {},
    negative: {},
  },
};

/** The outcome for one answered question, or null when the id is unknown. */
export function followupOutcome(questionId: string, positive: boolean): AmbiguityOutcome | null {
  const entry = OUTCOMES[questionId];
  if (!entry) return null;
  return positive ? entry.positive : entry.negative;
}

const LOW = 2;
const HIGH = 8;

/** How much learned affinity counts as "we already knew something". */
const KNOWN_PREF = 70;
const KNOWN_CONFIDENCE = 0.25;

/** Strongest learned liking for a genre across the channels that judge taste. */
function learnedAffinity(dna: DnaState | null, genre: string): { pref: number; confidence: number } {
  if (!dna) return { pref: 50, confidence: 0 };
  let best = { pref: 50, confidence: 0 };
  for (const channel of [dna.experience, dna.attraction] as const) {
    const belief = channel.genres[genre];
    if (!belief) continue;
    const confidence = evidenceConfidence(belief.evidence);
    if (confidence > best.confidence) best = { pref: belief.pref, confidence };
  }
  return best;
}

function knowsTheyLike(dna: DnaState | null, genre: string): boolean {
  const { pref, confidence } = learnedAffinity(dna, genre);
  return pref >= KNOWN_PREF && confidence >= KNOWN_CONFIDENCE;
}

/**
 * Build the shortlist. `ratings` is itemId → 0..10; `dna` is what we already
 * believed, or null for a brand-new user (in which case only the collisions
 * *within* the ratings themselves can fire).
 */
export function ambiguityQuestions(
  ratings: Record<string, number>,
  dna: DnaState | null,
): AmbiguityQuestion[] {
  const at = (id: string): number | null => {
    const v = ratings[id];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const found: AmbiguityQuestion[] = [];

  const horror = at('horror');
  const supernatural = at('supernatural');
  const crime = at('crime');
  const trueCrime = at('trueCrime');
  const slowBurn = at('slowBurn');
  const foreign = at('foreign');

  // 1. "Horror: 1" from someone whose history says otherwise. Almost always a
  //    disagreement about supernatural vs. psychological, not about horror.
  if (horror !== null && horror <= LOW && knowsTheyLike(dna, 'horror')) {
    found.push({
      id: 'horror-psychological',
      question: 'Quick one: psychological killers without supernatural stuff — good or bad?',
      positiveLabel: 'Good',
      negativeLabel: 'Bad',
      onPositive: OUTCOMES['horror-psychological']!.positive,
      onNegative: OUTCOMES['horror-psychological']!.negative,
      weight: 10,
    });
  }

  // 2. The same collision stated entirely inside the ratings: ghosts are fine,
  //    horror is not. Worth one question because it splits the genre cleanly.
  if (horror !== null && supernatural !== null && horror <= LOW && supernatural >= HIGH) {
    found.push({
      id: 'ghosts-not-gore',
      question: 'Ghost stories with no gore — good or bad?',
      positiveLabel: 'Good',
      negativeLabel: 'Bad',
      onPositive: OUTCOMES['ghosts-not-gore']!.positive,
      onNegative: OUTCOMES['ghosts-not-gore']!.negative,
      weight: 8,
    });
  }

  // 3. Loves crime, will not watch true crime. Real cases vs. written ones is a
  //    genuine fork and it decides a whole content pack.
  if (crime !== null && trueCrime !== null && crime >= HIGH && trueCrime <= LOW) {
    found.push({
      id: 'crime-fiction-only',
      question: 'Made-up cases only, or real ones too?',
      positiveLabel: 'Real ones too',
      negativeLabel: 'Made-up only',
      onPositive: OUTCOMES['crime-fiction-only']!.positive,
      onNegative: OUTCOMES['crime-fiction-only']!.negative,
      weight: 7,
    });
  }

  // 4. Rates slow burns low but everything tense high — is that "no patience"
  //    or "no boredom"? It sets pacing, which touches every recommendation.
  if (slowBurn !== null && slowBurn <= LOW) {
    found.push({
      id: 'slow-burn-pace',
      question: 'Something that takes two episodes to get going — worth it or not?',
      positiveLabel: 'Worth it',
      negativeLabel: 'Not worth it',
      onPositive: OUTCOMES['slow-burn-pace']!.positive,
      onNegative: OUTCOMES['slow-burn-pace']!.negative,
      weight: 5,
    });
  }

  // 5. Subtitles are a hard practical constraint when they are a no.
  if (foreign !== null && foreign <= LOW) {
    found.push({
      id: 'foreign-dubbed',
      question: 'Dubbed in English — fine, or still no?',
      positiveLabel: 'Fine',
      negativeLabel: 'Still no',
      onPositive: OUTCOMES['foreign-dubbed']!.positive,
      onNegative: OUTCOMES['foreign-dubbed']!.negative,
      weight: 4,
    });
  }

  return found.sort((a, b) => b.weight - a.weight).slice(0, MAX_AMBIGUITY_QUESTIONS);
}
