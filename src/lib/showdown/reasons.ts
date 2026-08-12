/**
 * WHY DID YOU PICK THAT ONE?
 *
 * A pairwise choice is structurally ambiguous, and attribution can only price
 * that in — it lowers confidence in a confounded observation, it cannot
 * disambiguate one. Picking Silence of the Lambs over Lord of the Rings might
 * mean grounded over fantastical, dark over bright, crime over quest, short
 * over long, or none of those. The information needed to tell them apart was
 * never collected, so no amount of cleverness downstream recovers it.
 *
 * Asking recovers it. One tap on "darker" converts a six-axis guess into a
 * SINGLE-AXIS observation with attribution 1.0 — the same quality as a Twist
 * round, obtained by asking instead of by constructing a rare pair. That is the
 * highest-value evidence the game can collect per second spent.
 *
 * THE CHIPS ARE GENERATED FROM THE PAIR, NEVER FIXED. Showing the same five
 * reasons for every matchup is worse than showing none: it teaches players the
 * list, and a chip that does not describe a real difference between THESE two
 * films collects a click that means nothing. Every chip below is derived from
 * an axis on which the two titles actually diverge, phrased in the direction of
 * the film that won.
 *
 * THERE IS ALWAYS AN EXIT. "Just a gut call" is not a skip — it is the honest
 * answer most of the time, and forcing a reason someone does not hold is how a
 * profile fills up with confident nonsense. It records no reason evidence and
 * leaves the ordinary comparative evidence untouched.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import type { TraitKey } from '@/lib/voice/quickdna/traits';
import { pull } from './matchup';

export interface ReasonChip {
  /** Stable id, recorded on the decision. */
  id: string;
  /** What the player taps. Phrased for the film that WON. */
  label: string;
  /** The single axis this attributes the choice to. */
  key: TraitKey;
  /** Which pole of that axis the winner sits on. */
  high: boolean;
}

/** The gut-call escape. Never absent, never counted as evidence. */
export const GUT_CALL: ReasonChip = {
  id: 'gut',
  label: 'Just a gut call',
  key: 'comfort',
  high: true,
};

/**
 * Consumer phrasing per axis, in both directions.
 *
 * Written as comparatives ("darker", "funnier") because that is what the player
 * is actually reporting — a difference between two things in front of them, not
 * an absolute property. "Dark" invites "compared to what?"; "darker" does not.
 */
const HIGHER: Partial<Record<TraitKey, string>> = {
  darkness: 'Darker',
  horrorTolerance: 'Scarier',
  suspense: 'More tense',
  violence: 'More brutal',
  psychological: 'More psychological',
  weirdness: 'Stranger',
  ambiguity: 'Less tidy',
  crime: 'Criminal world',
  trueCrime: 'It really happened',
  investigation: 'Better mystery',
  documentary: 'Real story',
  grounded: 'More realistic',
  fantasy: 'Bigger imagination',
  scifi: 'Bigger ideas',
  supernatural: 'Supernatural pull',
  action: 'More momentum',
  spectacle: 'Bigger spectacle',
  patience: 'Slower burn',
  complexity: 'More demanding',
  characterFocus: 'Stronger characters',
  dialogue: 'Better written',
  emotion: 'Hits harder',
  warmth: 'Warmer',
  comedy: 'Funnier',
  romance: 'Romance matters',
  family: 'Everyone can watch',
  comfort: 'Easier watch',
  animation: 'Animation',
  international: 'Not in English',
  subtitles: 'Worth the subtitles',
  vintage: 'Older classic',
  period: 'Set in the past',
  episodic: 'Worth the commitment',
  mainstream: 'The crowd-pleaser',
  cynicism: 'Harder-edged',
  sentimentality: 'More heart',
  musical: 'The music',
  sport: 'The competition',
  western: 'Western',
  war: 'Wartime',
  superhero: 'Comic-book world',
  martialArts: 'The fighting',
  legal: 'Courtroom',
  reality: 'Unscripted',
};

/*
 * BOTH POLES OR THE AXIS ONLY LEARNS ONE DIRECTION.
 *
 * `characterFocus` had a HIGHER phrase and no LOWER one, so "I picked it because
 * it's more plot-driven" was literally unsayable — a person who prefers plot to
 * character could play forever and never once state their actual reason. It
 * showed up as an axis that would not converge: measured over ten simulated
 * sessions, `character` reached confidence 0.10 for both opposed personas while
 * `ambiguity`, annotated on a comparable number of titles but phrasable in both
 * directions, reached 0.55. A missing word is a missing belief.
 */
const LOWER: Partial<Record<TraitKey, string>> = {
  characterFocus: 'More plot-driven',
  psychological: 'Less internal',
  suspense: 'Easier ride',
  grounded: 'More far-fetched',
  investigation: 'No puzzle needed',
  crime: 'Nothing to do with crime',
  scifi: 'No sci-fi',
  period: 'Set now',
  international: 'Closer to home',
  action: 'Less action',
  darkness: 'Less bleak',
  horrorTolerance: 'Not horror',
  violence: 'Less brutal',
  patience: 'Gets going faster',
  complexity: 'Less work',
  comedy: 'Takes itself seriously',
  romance: 'No romance needed',
  sentimentality: 'Less cheesy',
  spectacle: 'Less noisy',
  fantasy: 'Feet on the ground',
  animation: 'Live action',
  subtitles: 'No subtitles',
  mainstream: 'Less obvious',
  episodic: 'Ends tonight',
  weirdness: 'Makes more sense',
  ambiguity: 'Actually resolves',
  dialogue: 'Less talky',
  emotion: 'Less heavy',
  warmth: 'Less cosy',
  family: 'More adult',
  comfort: 'More of a challenge',
  supernatural: 'No ghosts',
  vintage: 'More recent',
};

/** How far apart the pair must be on an axis for a chip to be honest. */
export const CHIP_MIN_SEPARATION = 0.35;
/** More than four chips is a menu; fewer than two is not a choice. */
export const MAX_CHIPS = 4;

/**
 * The reasons worth offering for THIS pair, strongest difference first.
 *
 * Only axes where the two titles genuinely diverge, phrased in the winner's
 * direction, so every chip on screen describes something true about the
 * comparison the player just made.
 */
export function reasonsFor(
  winner: DiagnosticTitle,
  loser: DiagnosticTitle,
  limit = MAX_CHIPS,
): ReasonChip[] {
  const axes = new Set<TraitKey>();
  for (const e of winner.traits) axes.add(e.key);
  for (const e of loser.traits) axes.add(e.key);

  const scored: Array<{ chip: ReasonChip; gap: number }> = [];
  for (const key of axes) {
    const w = pull(winner, key);
    const l = pull(loser, key);
    const gap = w - l;
    if (Math.abs(gap) < CHIP_MIN_SEPARATION) continue;
    const high = gap > 0;
    const label = (high ? HIGHER : LOWER)[key];
    if (!label) continue;
    scored.push({ chip: { id: `${key}:${high ? 'hi' : 'lo'}`, label, key, high }, gap: Math.abs(gap) });
  }
  scored.sort((a, b) => b.gap - a.gap || (a.chip.id < b.chip.id ? -1 : 1));
  return scored.slice(0, limit).map((s) => s.chip);
}

/**
 * Is this pick worth interrupting for?
 *
 * ASKING COSTS A SECOND AND THE GAME IS SIXTY. A follow-up is only worth it
 * when the comparative evidence is genuinely confounded — a pick that already
 * isolates one axis has nothing to disambiguate, and asking anyway makes the
 * game feel like a form. So the trigger is the same attribution number the
 * evidence layer uses: low attribution means many candidate explanations, which
 * is exactly when the answer is worth most.
 */
export const ASK_BELOW_ATTRIBUTION = 0.55;

export function shouldAskWhy(attribution: number, chips: readonly ReasonChip[]): boolean {
  return attribution < ASK_BELOW_ATTRIBUTION && chips.length >= 2;
}

/**
 * How much a stated reason is worth.
 *
 * Deliberately the ceiling: the player has named the axis themselves, so there
 * is no attribution ambiguity left to price in. This is the cleanest signal the
 * product collects — cleaner than a Twist, which infers isolation from the pair
 * rather than being told.
 */
export const REASON_ATTRIBUTION = 1;

/**
 * THE FOLLOW-UP, AS A SENTENCE ABOUT THESE TWO FILMS.
 *
 * ── WHAT WAS WRONG WITH IT ────────────────────────────────────────────────
 * The evidence side of this mechanic was already right: chips are built from
 * the axes THESE two titles actually diverge on, the question only fires when
 * attribution is genuinely ambiguous, and "gut call" is a real answer. What
 * shipped on top of it was a taxonomy form —
 *
 *     What tipped it?
 *     [ More realistic ] [ Less heavy ] [ Darker ] [ No romance needed ]
 *
 * — which reads as a survey interrupting a game, because nothing on screen
 * refers to the decision the player just made. The same chips asked as
 *
 *     You went with Prisoners.
 *     Was it that the danger felt more real?
 *
 * are the same observation, and one of them is a conversation.
 *
 * ── WHY THE LEADING CHIP GETS THE SENTENCE ────────────────────────────────
 * `rankChipsByValue` has already decided which axis is worth the interruption.
 * Promoting that one into the question — and leaving the rest as the ways to
 * disagree — makes the game commit to a guess, which is both more human and
 * more informative: "no, something else" about a NAMED hypothesis is a
 * different and better observation than declining to pick from a list.
 *
 * PURE. Copy only; it moves no belief and invents no axis.
 */

/** How the leading hypothesis is put, per axis. Falls back to the chip label. */
const HYPOTHESIS: Partial<Record<TraitKey, { high: string; low: string }>> = {
  grounded: { high: 'the danger felt more real?', low: 'you wanted it further from reality?' },
  horrorTolerance: { high: 'you wanted to be scared?', low: 'you did not fancy being scared?' },
  darkness: { high: 'you wanted the darker one?', low: 'you wanted the lighter one?' },
  psychological: { high: 'you wanted the tension?', low: 'you had had enough tension?' },
  emotion: { high: 'you wanted to feel something?', low: 'you did not want to be wrung out?' },
  romance: { high: 'the love story mattered?', low: 'you could do without the romance?' },
  comedy: { high: 'you wanted to laugh?', low: 'you were not after jokes?' },
  action: { high: 'you wanted the momentum?', low: 'you wanted something quieter?' },
  complexity: { high: 'you wanted to work for it?', low: 'you did not want homework?' },
  patience: { high: 'you were happy to let it build?', low: 'you wanted it to get going?' },
  supernatural: { high: 'the unexplained appealed?', low: 'ghosts were not it?' },
  spectacle: { high: 'you wanted the scale?', low: 'scale was not the draw?' },
  mainstream: { high: 'you wanted the crowd-pleaser?', low: 'you wanted the less obvious one?' },
  vintage: { high: 'the older one appealed?', low: 'you wanted something more recent?' },
  subtitles: { high: 'reading it was no obstacle?', low: 'you did not fancy subtitles?' },
  investigation: { high: 'you wanted a puzzle?', low: 'you did not want to work a case?' },
  trueCrime: { high: 'it being real mattered?', low: 'you wanted it invented?' },
  sentimentality: { high: 'you wanted the heart?', low: 'you wanted less sentiment?' },
};

export interface FollowUpPrompt {
  /** "You went with Prisoners." — states the decision back. */
  lead: string;
  /** The named hypothesis, as a question. */
  question: string;
  /** The chip the question is asking about, so a Yes maps to real evidence. */
  hypothesis: ReasonChip | null;
}

export function followUpPrompt(
  winnerTitle: string | null,
  chips: readonly ReasonChip[],
): FollowUpPrompt {
  const top = chips[0] ?? null;
  const lead = winnerTitle ? `You went with ${winnerTitle}.` : 'Interesting one.';
  if (!top) return { lead, question: 'What tipped it?', hypothesis: null };
  const phrasing = HYPOTHESIS[top.key];
  /* "Was it you did not want to work a case?" is what the naive join produced.
     A phrase that opens with a pronoun needs the complementiser; one that opens
     with a noun phrase does not ("Was it the danger felt more real?" is fine). */
  const phrase = phrasing ? (top.high ? phrasing.high : phrasing.low) : `${top.label.toLowerCase()}?`;
  const needsThat = /^(you|it|they|we|reading|ghosts|scale|capes)\b/i.test(phrase);
  const question = `Was it ${needsThat ? 'that ' : ''}${phrase}`;
  return { lead, question, hypothesis: top };
}
