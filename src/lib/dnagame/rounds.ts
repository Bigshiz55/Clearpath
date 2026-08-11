/**
 * VERD1CT RUSH — the decision bank and the round contract.
 *
 * A question feels like work; a decision feels like a game. So nothing here
 * asks anyone to rate anything. Every entry is a THING YOU MIGHT WATCH or a
 * reason you would switch it off, and choosing between them is what produces
 * evidence.
 *
 * ONE SHARED CONTRACT for every format. A round declares what it shows, how
 * many picks it takes, and what a pick (or a rejection) means in trait terms —
 * so adding a tenth format later is data, not a new screen with its own logic.
 *
 * WHY REJECTIONS MATTER AS MUCH AS PICKS. Choosing "murder mystery" over five
 * alternatives says something mild about all six; eliminating "ghost story"
 * says something sharp about one. Negative evidence is scarce and valuable,
 * which is why several formats exist purely to collect it.
 *
 * PURE DATA + PURE FUNCTIONS. No I/O.
 */

import type { TraitKey } from '@/lib/voice/quickdna/traits';

export type RoundType =
  | 'pick-your-night'
  | 'one-has-to-go'
  | 'pick-two'
  | 'nope-two'
  | 'head-to-head'
  | 'movie-lightning'
  | 'six-movie'
  | 'dealbreaker'
  | 'vibe';

/** What choosing this option says. A rejection applies the mirror image. */
export interface ChoiceEffect {
  key: TraitKey;
  /** -1..1. Positive means "picking this suggests they like the trait". */
  pull: number;
}

export interface Choice {
  id: string;
  label: string;
  /** Which wheel wedge it belongs to, for the radial layout. */
  family: string;
  effects: ChoiceEffect[];
  /** Set for movie rounds so the reaction can be stored against a real title. */
  titleId?: string;
}

const c = (
  id: string,
  label: string,
  family: string,
  effects: Array<[TraitKey, number]>,
): Choice => ({ id, label, family, effects: effects.map(([key, pull]) => ({ key, pull })) });

/**
 * THE DECISION BANK, one entry per family so any six-way round can be dealt
 * with one option per wedge. Written as concrete nights out, not as categories:
 * "Bank heist" is a decision, "action 0–10" is a form field.
 */
export const CHOICES: readonly Choice[] = [
  // ── Mystery ────────────────────────────────────────────────────────────
  c('murder-mystery', 'Murder mystery', 'mystery', [['investigation', 1], ['crime', 0.6]]),
  c('whodunit', 'A proper whodunit', 'mystery', [['investigation', 1], ['complexity', 0.5]]),
  c('procedural', 'Police procedural', 'mystery', [['crime', 0.9], ['grounded', 0.5], ['investigation', 0.6]]),
  c('courtroom', 'Courtroom showdown', 'mystery', [['legal', 1], ['grounded', 0.5]]),
  c('cold-case', 'Cold case documentary', 'mystery', [['trueCrime', 1], ['documentary', 0.8], ['grounded', 0.5]]),

  // ── Thrill ─────────────────────────────────────────────────────────────
  c('heist', 'Bank heist', 'thrill', [['action', 0.8], ['complexity', 0.5]]),
  c('spy', 'Spy conspiracy', 'thrill', [['action', 0.6], ['complexity', 0.7]]),
  c('car-chase', 'Car chases and gunfights', 'thrill', [['action', 1], ['patience', -0.5]]),
  c('survival', 'Survival against the clock', 'thrill', [['action', 0.7], ['psychological', 0.4]]),

  // ── Dark ───────────────────────────────────────────────────────────────
  c('serial-killer', 'Serial killer hunt', 'dark', [['psychological', 1], ['darkness', 0.9], ['grounded', 0.6]]),
  c('ghost-story', 'Ghost story', 'dark', [['supernatural', 1], ['grounded', -0.8], ['horrorTolerance', 0.6]]),
  c('slow-dread', 'Slow-building dread', 'dark', [['horrorTolerance', 0.8], ['patience', 0.8], ['darkness', 0.7]]),
  c('true-horror', 'Something genuinely frightening', 'dark', [['horrorTolerance', 1], ['darkness', 0.8]]),

  // ── Laugh ──────────────────────────────────────────────────────────────
  c('dark-comedy', 'Dark comedy', 'laugh', [['comedy', 0.9], ['darkness', 0.6]]),
  c('silly-comedy', 'Something properly silly', 'laugh', [['comedy', 1], ['darkness', -0.6]]),
  c('sitcom', 'Comfort sitcom', 'laugh', [['comedy', 0.9], ['complexity', -0.4]]),
  c('satire', 'Sharp satire', 'laugh', [['comedy', 0.8], ['complexity', 0.6]]),

  // ── Heart ──────────────────────────────────────────────────────────────
  c('family-drama', 'Family drama', 'heart', [['romance', 0.4], ['grounded', 0.6], ['darkness', -0.3]]),
  c('romance', 'A love story', 'heart', [['romance', 1], ['darkness', -0.5]]),
  c('tearjerker', 'Something that wrecks you', 'heart', [['romance', 0.5], ['complexity', 0.3]]),
  c('true-story', 'Based on a true story', 'heart', [['grounded', 0.9], ['documentary', 0.5]]),

  // ── Worlds ─────────────────────────────────────────────────────────────
  c('scifi-thriller', 'Sci-fi thriller', 'worlds', [['scifi', 1], ['complexity', 0.5]]),
  c('alien-invasion', 'Alien invasion', 'worlds', [['scifi', 0.9], ['action', 0.5], ['grounded', -0.6]]),
  c('epic-fantasy', 'Epic fantasy', 'worlds', [['fantasy', 1], ['grounded', -0.7], ['patience', 0.4]]),
  c('subtitled', 'Subtitled and brilliant', 'worlds', [['international', 1], ['subtitles', 1]]),
  c('period-piece', 'Something set a century ago', 'worlds', [['period', 1], ['patience', 0.4]]),

  /*
   * THE SECOND HELPING.
   *
   * The bank opened with six families' worth of crime, thrill, dark, comedy,
   * heart and worlds — and a real person's taste is wider than that. Westerns,
   * superheroes, cartoons, musicals, sport, war and the rest were unaskable,
   * which meant unlearnable, which meant a Verd1ct that could never account
   * for them. These carry the ten new axes and deepen the six old families.
   *
   * Depth matters twice over now: nothing is ever put to someone twice across
   * plays, so the size of this bank is exactly how many times the game can be
   * played before it has to start recycling.
   */

  // ── Mystery ────────────────────────────────────────────────────────────
  c('spy-thriller', 'Cold-war spy story', 'mystery', [['investigation', 0.8], ['period', 0.6], ['complexity', 0.7]]),
  c('heist-crew', 'Assembling the crew', 'mystery', [['crime', 0.8], ['complexity', 0.6], ['action', 0.4]]),
  c('missing-person', 'Someone has vanished', 'mystery', [['investigation', 1], ['psychological', 0.5]]),
  c('conspiracy-doc', 'Conspiracy documentary', 'mystery', [['documentary', 1], ['trueCrime', 0.6], ['complexity', 0.5]]),

  // ── Thrill ─────────────────────────────────────────────────────────────
  c('superhero-team', 'Superhero team-up', 'thrill', [['superhero', 1], ['action', 0.7], ['grounded', -0.5]]),
  c('gritty-vigilante', 'A masked vigilante, played straight', 'thrill', [['superhero', 0.8], ['darkness', 0.6], ['grounded', 0.3]]),
  c('kung-fu', 'Kung fu masterpiece', 'thrill', [['martialArts', 1], ['action', 0.8], ['international', 0.5]]),
  c('samurai', 'Lone swordsman', 'thrill', [['martialArts', 0.8], ['period', 0.7], ['international', 0.6]]),
  c('war-epic', 'War epic', 'thrill', [['war', 1], ['period', 0.6], ['darkness', 0.5]]),
  c('soldiers-story', 'Soldiers under fire', 'thrill', [['war', 0.9], ['grounded', 0.6], ['action', 0.5]]),
  c('disaster', 'Everything is on fire', 'thrill', [['action', 0.9], ['patience', -0.5]]),
  c('racing', 'Engines and rivalry', 'thrill', [['sport', 0.8], ['action', 0.8]]),

  // ── Dark ───────────────────────────────────────────────────────────────
  c('zombie', 'The dead are walking', 'dark', [['horrorTolerance', 0.8], ['action', 0.6], ['grounded', -0.5]]),
  c('vampire', 'Vampires', 'dark', [['supernatural', 0.9], ['horrorTolerance', 0.6], ['romance', 0.3]]),
  c('cult-doc', 'Inside a cult', 'dark', [['documentary', 0.9], ['psychological', 0.8], ['trueCrime', 0.6]]),
  c('prison', 'Life on the inside', 'dark', [['crime', 0.8], ['darkness', 0.7], ['grounded', 0.7]]),

  // ── Laugh ──────────────────────────────────────────────────────────────
  c('animated-comedy', 'Animated and very funny', 'laugh', [['animation', 1], ['comedy', 0.8], ['family', 0.5]]),
  c('pixar-cry', 'A cartoon that makes adults cry', 'laugh', [['animation', 1], ['family', 0.7], ['romance', 0.3]]),
  c('anime-series', 'A great anime', 'laugh', [['animation', 0.9], ['international', 0.8], ['subtitles', 0.6], ['fantasy', 0.5]]),
  c('buddy-comedy', 'Two idiots, one road trip', 'laugh', [['comedy', 0.9], ['complexity', -0.3]]),
  c('bake-off', 'A cosy competition show', 'laugh', [['reality', 1], ['comedy', 0.4], ['darkness', -0.6]]),
  c('reality-drama', 'Reality TV with real fallout', 'laugh', [['reality', 1], ['grounded', 0.5]]),
  c('stand-up', 'A stand-up special', 'laugh', [['comedy', 1], ['complexity', -0.2]]),

  // ── Heart ──────────────────────────────────────────────────────────────
  c('musical', 'A proper musical', 'heart', [['musical', 1], ['romance', 0.4]]),
  c('music-biopic', 'The band’s rise and fall', 'heart', [['musical', 0.9], ['documentary', 0.5], ['grounded', 0.6]]),
  c('underdog-sport', 'The underdogs win it', 'heart', [['sport', 1], ['grounded', 0.6]]),
  c('sports-doc', 'Sports documentary', 'heart', [['sport', 0.9], ['documentary', 0.9]]),
  c('coming-of-age', 'Growing up, badly', 'heart', [['romance', 0.4], ['grounded', 0.7], ['comedy', 0.4]]),
  c('kids-together', 'Something the whole room can watch', 'heart', [['family', 1], ['animation', 0.4], ['darkness', -0.7]]),

  // ── Worlds ─────────────────────────────────────────────────────────────
  c('classic-western', 'Classic western', 'worlds', [['western', 1], ['period', 0.7], ['vintage', 0.5]]),
  c('modern-western', 'A western in a pickup truck', 'worlds', [['western', 0.9], ['grounded', 0.7], ['darkness', 0.5]]),
  c('space-opera', 'Space opera', 'worlds', [['scifi', 1], ['fantasy', 0.5], ['action', 0.6]]),
  c('costume-drama', 'Corsets and consequences', 'worlds', [['period', 1], ['romance', 0.6], ['patience', 0.5]]),
  c('sword-sandal', 'Swords, sandals, empires', 'worlds', [['period', 0.9], ['action', 0.7], ['war', 0.5]]),
  c('black-and-white', 'A black-and-white classic', 'worlds', [['vintage', 1], ['patience', 0.6]]),
  c('korean-thriller', 'A Korean thriller everyone talks about', 'worlds', [['international', 1], ['subtitles', 0.9], ['darkness', 0.5]]),
] as const;

export const CHOICES_BY_FAMILY = new Map<string, Choice[]>();
for (const choice of CHOICES) {
  const list = CHOICES_BY_FAMILY.get(choice.family) ?? [];
  list.push(choice);
  CHOICES_BY_FAMILY.set(choice.family, list);
}

/**
 * DEALBREAKERS — what makes someone switch it off. Deliberately phrased as
 * complaints, because that is how people hold these opinions, and a complaint
 * is far more decisive than a preference.
 */
export const DEALBREAKERS: readonly Choice[] = [
  c('too-slow', 'Too slow', 'thrill', [['patience', -1]]),
  c('too-silly', 'Too silly', 'laugh', [['comedy', -0.9]]),
  c('supernatural-nope', 'Anything supernatural', 'dark', [['supernatural', -1], ['grounded', 0.7]]),
  c('too-violent', 'Too violent', 'dark', [['darkness', -0.9], ['horrorTolerance', -0.7]]),
  c('too-predictable', 'Too predictable', 'mystery', [['complexity', 0.9]]),
  c('too-romantic', 'Too romantic', 'heart', [['romance', -1]]),
  c('subtitles-nope', 'Having to read subtitles', 'worlds', [['subtitles', -1]]),
  c('too-long', 'Three hours long', 'thrill', [['patience', -0.8]]),
  // The new axes get their own switch-off reasons. A "no" here is worth more
  // than several mild yeses, and these are the ones people say out loud.
  c('cartoon-nope', 'It’s a cartoon', 'laugh', [['animation', -1]]),
  c('capes-nope', 'People in capes', 'thrill', [['superhero', -1]]),
  c('singing-nope', 'When they start singing', 'heart', [['musical', -1]]),
  c('western-nope', 'Cowboys', 'worlds', [['western', -1]]),
  c('sport-nope', 'Anything about sport', 'heart', [['sport', -1]]),
  c('war-nope', 'War films', 'thrill', [['war', -1]]),
  c('reality-nope', 'Reality TV', 'laugh', [['reality', -1]]),
  c('old-nope', 'Anything black and white', 'worlds', [['vintage', -1]]),
  c('period-nope', 'Costume drama', 'worlds', [['period', -1]]),
  c('martial-nope', 'Wire-work fight scenes', 'thrill', [['martialArts', -1]]),
  c('family-nope', 'Anything aimed at kids', 'laugh', [['family', -1], ['animation', -0.5]]),
] as const;

/**
 * VIBES are about tonight, not about the person. They are collected because
 * they are fun and fast, and deliberately weighted lower than everything else
 * (see `MOOD_WEIGHT`) — a Tuesday mood is not a permanent trait.
 */
export const VIBES: readonly Choice[] = [
  c('vibe-dark', 'Dark & tense', 'dark', [['darkness', 1], ['psychological', 0.6]]),
  c('vibe-clever', 'Clever mystery', 'mystery', [['investigation', 1], ['complexity', 0.7]]),
  c('vibe-fast', 'Fast & fun', 'thrill', [['action', 1], ['patience', -0.6]]),
  c('vibe-emotional', 'Emotional', 'heart', [['romance', 0.7], ['complexity', 0.4]]),
  c('vibe-weird', 'Weird & different', 'worlds', [['fantasy', 0.7], ['complexity', 0.8], ['grounded', -0.5]]),
  c('vibe-easy', 'Easy watch', 'laugh', [['comedy', 0.7], ['complexity', -0.8]]),
  c('vibe-epic', 'Big and epic', 'thrill', [['action', 0.8], ['superhero', 0.5], ['war', 0.4]]),
  c('vibe-nostalgic', 'Nostalgic', 'worlds', [['vintage', 0.8], ['period', 0.5], ['animation', 0.3]]),
  c('vibe-together', 'Something everyone can watch', 'heart', [['family', 1], ['darkness', -0.6]]),
  c('vibe-uplifting', 'Uplifting', 'heart', [['sport', 0.5], ['musical', 0.5], ['darkness', -0.7]]),
] as const;

/** A dealt round, ready to render. The UI needs nothing else. */
export interface Round {
  type: RoundType;
  prompt: string;
  choices: Choice[];
  /** How many the player must pick before the round completes. */
  picks: number;
  /**
   * True when picking means REJECTING. The evidence is the mirror image, and
   * the UI must make that unmistakable — tapping to condemn should not look
   * identical to tapping to choose.
   */
  negative: boolean;
  /** Radial layouts arrange by wedge; the rest are cards. */
  layout: 'wheel' | 'cards' | 'duel' | 'poster';
}

/** How strongly each format's evidence counts. */
export const ROUND_WEIGHT: Record<RoundType, number> = {
  // A pick among six says a little about all six.
  'pick-your-night': 0.18,
  'six-movie': 0.2,
  // An elimination is sharper: it is a decision against one specific thing.
  'one-has-to-go': 0.24,
  'nope-two': 0.24,
  'pick-two': 0.16,
  // A forced pair is the cleanest comparison available.
  'head-to-head': 0.26,
  // A reaction to a title the person has actually seen is the strongest thing
  // the game collects — it matches the evidence ladder the engine already uses.
  'movie-lightning': 0.32,
  'dealbreaker': 0.3,
  vibe: 0.1,
};

/** Tonight's mood is not who you are. Kept low on purpose. */
export const MOOD_WEIGHT = 0.1;

export const PROMPTS: Record<RoundType, string> = {
  'pick-your-night': 'Pick your night',
  'one-has-to-go': 'One has to go',
  'pick-two': 'Pick two',
  'nope-two': 'Nope two',
  'head-to-head': 'Tonight?',
  'movie-lightning': 'Seen it?',
  'six-movie': 'Which one are you watching?',
  dealbreaker: 'What kills it for you?',
  vibe: 'What sounds best right now?',
};
