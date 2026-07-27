/**
 * THE "WHY" VOCABULARY.
 *
 * Knowing someone loved Sherlock is nearly worthless. Knowing they loved it for
 * the deduction and the cases — and not for the British setting — is what lets
 * us recommend Poirot instead of Downton Abbey.
 *
 * So every title in the interview gets a follow-up, and the follow-up is chips
 * rather than a text box: a chip is an unambiguous mapping to an attribute, at
 * a confidence free text can never reach, and it takes one tap on a phone.
 *
 * Three rules hold this together:
 *
 *  1. NOT EVERY REASON IS ACTIONABLE. "The acting was great" is real and worth
 *     showing back, but it cannot become a filter. Those chips are marked
 *     `unactionable`, carry zero weight, and say so in the review.
 *  2. NOT EVERY NEGATIVE IS A BAN. A deal-breaker is graded — hard exclusion,
 *     strong, mild, conditional, or just-now — and only the first one ever
 *     means never-recommend.
 *  3. NOT FINISHING IS NOT DISLIKING. Abandonment reasons carry their own
 *     weights, and "wrong mood" is temporary by construction.
 *
 * Pure data. No I/O.
 */
import type { Claim, Durability } from './types';

/** One tappable reason. */
export interface ReasonChip {
  value: string;
  label: string;
  /** Attribute this reason implicates, when it maps to one. */
  attribute?: string;
  /** Direction relative to the reaction being explained. */
  polarity?: -1 | 1;
  /** 0..1 relative to the other chips in its set. */
  weight?: number;
  /**
   * The part of the title this reason is about. Set for reasons that explain a
   * reaction without implying a standing preference ("the performances").
   */
  aspect?: string;
  /** True when the reason moves no dial — it is a note on one title. */
  unactionable?: boolean;
  /** True when picking this should open a further question. */
  opensFollowUp?: boolean;
}

/**
 * ASPECTS — the parts of a title someone comments on.
 *
 * These are NOT taste axes. "The story was weak" is a verdict on one film, not
 * a standing preference for weak stories, and forcing it into a dial would be
 * both wrong and unfalsifiable. So an aspect is stored as a reason attached to
 * a title: it explains the reaction, shows back in review as "The Notebook —
 * the story was weak", and never becomes a search filter.
 */
export interface Aspect {
  key: string;
  /** How it reads inside "the ___". */
  label: string;
  phrases: string[];
}

export const ASPECTS: readonly Aspect[] = [
  { key: 'story', label: 'story', phrases: ['the story', 'the plot', 'the storyline', 'the script'] },
  { key: 'writing', label: 'writing', phrases: ['the writing', 'the screenplay'] },
  { key: 'acting', label: 'performances', phrases: ['the acting', 'the performances', 'the performance', 'the cast'] },
  { key: 'pacing', label: 'pacing', phrases: ['the pacing', 'the pace'] },
  { key: 'ending', label: 'ending', phrases: ['the ending', 'the finale', 'the last episode'] },
  { key: 'characters', label: 'characters', phrases: ['the characters', 'the character'] },
  { key: 'humour', label: 'humour', phrases: ['the humour', 'the humor', 'the jokes', 'the comedy in it'] },
  { key: 'dialogue', label: 'dialogue', phrases: ['the dialogue', 'the dialog'] },
  { key: 'visuals', label: 'look', phrases: ['the visuals', 'the cinematography', 'the look of it', 'the effects'] },
  { key: 'music', label: 'music', phrases: ['the music', 'the soundtrack', 'the score'] },
  { key: 'atmosphere', label: 'atmosphere', phrases: ['the atmosphere', 'the mood of it', 'the vibe'] },
];

const ASPECT_INDEX = ASPECTS
  .flatMap((a) => a.phrases.map((p) => ({ phrase: p, key: a.key })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

export function aspectLabel(key: string): string {
  return ASPECTS.find((a) => a.key === key)?.label ?? key;
}

/** The first aspect mentioned in a piece of text, if any. */
export function findAspect(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { phrase, key } of ASPECT_INDEX) {
    if (lower.includes(phrase)) return key;
  }
  return null;
}

// ── Why they loved it ──────────────────────────────────────────────────────

/** The default set, used when we do not know the title's genres. */
export const LOVE_REASONS: readonly ReasonChip[] = [
  { value: 'characters', label: 'The characters', attribute: 'character_driven', polarity: 1, weight: 0.9 },
  { value: 'story', label: 'The story itself', attribute: 'plot_driven', polarity: 1, weight: 0.85 },
  { value: 'tension', label: 'The tension', attribute: 'tense', polarity: 1, weight: 0.85 },
  { value: 'twists', label: 'The twists', attribute: 'twists', polarity: 1, weight: 0.85 },
  { value: 'humour', label: 'It was funny', attribute: 'comedy', polarity: 1, weight: 0.8 },
  { value: 'emotion', label: 'It got to me', attribute: 'emotional', polarity: 1, weight: 0.85 },
  { value: 'dark', label: 'How dark it was', attribute: 'dark_tone', polarity: 1, weight: 0.85 },
  { value: 'pace', label: 'It never dragged', attribute: 'fast_pace', polarity: 1, weight: 0.8 },
  { value: 'slow_burn', label: 'It took its time', attribute: 'slow_pace', polarity: 1, weight: 0.8 },
  { value: 'realism', label: 'It felt real', attribute: 'grounded', polarity: 1, weight: 0.8 },
  { value: 'ending', label: 'It stuck the landing', attribute: 'unfinished', polarity: -1, weight: 0.7 },
  { value: 'acting', label: 'The performances', aspect: 'acting', unactionable: true },
  { value: 'look', label: 'How it looked', aspect: 'visuals', unactionable: true },
];

/** Crime, mystery and detective stories get their own vocabulary. */
export const CRIME_LOVE_REASONS: readonly ReasonChip[] = [
  { value: 'investigation', label: 'Solving the case', attribute: 'investigation', polarity: 1, weight: 0.95 },
  { value: 'clues', label: 'The clever clues', attribute: 'investigation', polarity: 1, weight: 0.9 },
  { value: 'twists', label: 'The twists', attribute: 'twists', polarity: 1, weight: 0.85 },
  { value: 'detective', label: 'The detective', attribute: 'character_driven', polarity: 1, weight: 0.85 },
  { value: 'psych', label: 'The psychological side', attribute: 'tense', polarity: 1, weight: 0.85 },
  { value: 'dark', label: 'How dark it was', attribute: 'dark_tone', polarity: 1, weight: 0.8 },
  { value: 'resolution', label: 'A satisfying resolution', attribute: 'unfinished', polarity: -1, weight: 0.8 },
  { value: 'atmosphere', label: 'The atmosphere', aspect: 'atmosphere', unactionable: true },
];

export const SFF_LOVE_REASONS: readonly ReasonChip[] = [
  { value: 'ideas', label: 'The ideas in it', attribute: 'complex_plot', polarity: 1, weight: 0.9 },
  { value: 'world', label: 'The world it built', attribute: 'epic_stakes', polarity: 1, weight: 0.8 },
  { value: 'characters', label: 'The characters', attribute: 'character_driven', polarity: 1, weight: 0.85 },
  { value: 'tension', label: 'The tension', attribute: 'tense', polarity: 1, weight: 0.8 },
  { value: 'emotion', label: 'It got to me', attribute: 'emotional', polarity: 1, weight: 0.8 },
  { value: 'spectacle', label: 'The spectacle', attribute: 'epic_stakes', polarity: 1, weight: 0.75 },
  { value: 'look', label: 'How it looked', aspect: 'visuals', unactionable: true },
];

export const COMEDY_LOVE_REASONS: readonly ReasonChip[] = [
  { value: 'humour', label: 'It was genuinely funny', attribute: 'comedy', polarity: 1, weight: 0.95 },
  { value: 'characters', label: 'The characters', attribute: 'character_driven', polarity: 1, weight: 0.85 },
  { value: 'comfort', label: 'It is easy to put on', attribute: 'background_friendly', polarity: 1, weight: 0.8 },
  { value: 'warmth', label: 'It has a good heart', attribute: 'feel_good', polarity: 1, weight: 0.85 },
  { value: 'sharp', label: 'It has a mean streak', attribute: 'cynical', polarity: 1, weight: 0.75 },
  { value: 'acting', label: 'The performances', aspect: 'acting', unactionable: true },
];

/** Pick the vocabulary that fits what we know about the title. */
export function loveReasonsFor(genres: string[] | undefined): readonly ReasonChip[] {
  const g = new Set((genres ?? []).map((x) => x.toLowerCase()));
  if (g.has('crime') || g.has('mystery')) return CRIME_LOVE_REASONS;
  if (g.has('science-fiction') || g.has('fantasy')) return SFF_LOVE_REASONS;
  if (g.has('comedy')) return COMEDY_LOVE_REASONS;
  return LOVE_REASONS;
}

// ── Why it did not work ────────────────────────────────────────────────────

export const DISLIKE_REASONS: readonly ReasonChip[] = [
  { value: 'too_slow', label: 'Too slow', attribute: 'slow_pace', polarity: -1, weight: 0.9 },
  { value: 'too_confusing', label: 'Too confusing', attribute: 'complex_plot', polarity: -1, weight: 0.85 },
  { value: 'predictable', label: 'Too predictable', attribute: 'twists', polarity: 1, weight: 0.8 },
  { value: 'characters', label: 'I disliked the characters', attribute: 'cynical', polarity: -1, weight: 0.7 },
  { value: 'too_violent', label: 'Too violent', attribute: 'violence', polarity: -1, weight: 0.9 },
  { value: 'too_disturbing', label: 'Too disturbing', attribute: 'dark_tone', polarity: -1, weight: 0.9 },
  { value: 'too_romantic', label: 'Too much romance', attribute: 'romance_genre', polarity: -1, weight: 0.85 },
  { value: 'unrealistic', label: 'Too far-fetched', attribute: 'grounded', polarity: 1, weight: 0.8 },
  { value: 'supernatural', label: 'The supernatural side', attribute: 'supernatural', polarity: -1, weight: 0.9 },
  { value: 'sci_fi', label: 'Too science-fiction', attribute: 'sci_fi', polarity: -1, weight: 0.9 },
  { value: 'bad_ending', label: 'The ending', attribute: 'unfinished', polarity: -1, weight: 0.8 },
  { value: 'humour', label: 'The humour did not land', attribute: 'comedy', polarity: -1, weight: 0.7 },
  { value: 'weak_story', label: 'The story was weak', aspect: 'story', unactionable: true },
  { value: 'acting', label: 'The acting', aspect: 'acting', unactionable: true },
];

// ── Why they gave up ───────────────────────────────────────────────────────

/** How far they actually got. Someone who bailed at minute four is telling us more. */
export const DNF_PROGRESS: readonly { value: Claim['watchedFraction']; label: string; factor: number }[] = [
  { value: 'barely', label: 'I barely started it', factor: 1 },
  { value: 'some', label: 'A few episodes in', factor: 0.8 },
  { value: 'most', label: 'I got most of the way', factor: 0.5 },
];

/**
 * Abandonment reasons. Note `wrong_mood` and `too_long`: these are the reasons
 * that must NOT harden into a permanent dislike, so they carry `durability`
 * overrides rather than being lumped in with "I hated it".
 */
export const DNF_REASONS: readonly (ReasonChip & { durability?: Durability })[] = [
  { value: 'pacing', label: 'It dragged', attribute: 'slow_pace', polarity: -1, weight: 0.85 },
  { value: 'confusing', label: 'I lost the plot', attribute: 'complex_plot', polarity: -1, weight: 0.8 },
  { value: 'repetitive', label: 'Every episode felt the same', attribute: 'serialized', polarity: 1, weight: 0.7 },
  { value: 'character', label: 'I stopped caring about anyone', attribute: 'character_driven', polarity: 1, weight: 0.6 },
  { value: 'content', label: 'Something in it I did not want to watch', opensFollowUp: true, weight: 0.8 },
  { value: 'wrong_mood', label: 'Wrong thing at the wrong time', durability: 'temporary', weight: 0.4 },
  { value: 'lost_interest', label: 'I just drifted off it', weight: 0.35, unactionable: true },
  { value: 'disliked', label: 'I genuinely disliked it', weight: 0.9 },
];

// ── Genres ─────────────────────────────────────────────────────────────────

export const GENRE_CHIPS: readonly ReasonChip[] = [
  { value: 'investigation', label: 'Detective mysteries', attribute: 'investigation', polarity: 1 },
  { value: 'crime', label: 'Crime investigations', attribute: 'crime', polarity: 1 },
  { value: 'thriller', label: 'Psychological thrillers', attribute: 'thriller', polarity: 1 },
  { value: 'action', label: 'Action', attribute: 'action', polarity: 1 },
  { value: 'comedy', label: 'Comedy', attribute: 'comedy', polarity: 1 },
  { value: 'romance_genre', label: 'Romance', attribute: 'romance_genre', polarity: 1 },
  { value: 'feel_good', label: 'Family stories', attribute: 'feel_good', polarity: 1 },
  { value: 'historical', label: 'Historical drama', attribute: 'historical', polarity: 1 },
  { value: 'sci_fi', label: 'Science fiction', attribute: 'sci_fi', polarity: 1 },
  { value: 'fantasy', label: 'Fantasy', attribute: 'fantasy', polarity: 1 },
  { value: 'supernatural', label: 'Supernatural', attribute: 'supernatural', polarity: 1 },
  { value: 'horror', label: 'Horror', attribute: 'horror', polarity: 1 },
  { value: 'documentary', label: 'Documentaries', attribute: 'documentary', polarity: 1 },
  { value: 'true_crime', label: 'True crime', attribute: 'crime', polarity: 1 },
  { value: 'war', label: 'War stories', attribute: 'war', polarity: 1 },
  { value: 'western', label: 'Westerns', attribute: 'western', polarity: 1 },
  { value: 'animation', label: 'Animation', attribute: 'animation', polarity: 1 },
  { value: 'musical', label: 'Musicals', attribute: 'musical', polarity: 1 },
];

/** What matters inside a genre — asked once, about the genre they leaned on hardest. */
export const GENRE_DEPTH: Record<string, readonly ReasonChip[]> = {
  investigation: CRIME_LOVE_REASONS,
  crime: CRIME_LOVE_REASONS,
  true_crime: CRIME_LOVE_REASONS,
  thriller: [
    { value: 'tension', label: 'Being kept on edge', attribute: 'tense', polarity: 1 },
    { value: 'twists', label: 'The twists', attribute: 'twists', polarity: 1 },
    { value: 'psych', label: 'The psychology of it', attribute: 'complex_plot', polarity: 1 },
    { value: 'grounded', label: 'That it could happen', attribute: 'grounded', polarity: 1 },
    { value: 'morality', label: 'Nobody being purely good', attribute: 'morally_grey', polarity: 1 },
  ],
  sci_fi: SFF_LOVE_REASONS,
  fantasy: SFF_LOVE_REASONS,
  comedy: COMEDY_LOVE_REASONS,
  horror: [
    { value: 'scary', label: 'Actually being scared', attribute: 'scary', polarity: 1 },
    { value: 'atmosphere', label: 'Dread rather than shocks', attribute: 'tense', polarity: 1 },
    { value: 'gore', label: 'The gore', attribute: 'gore', polarity: 1 },
    { value: 'supernatural', label: 'The supernatural side', attribute: 'supernatural', polarity: 1 },
    { value: 'grounded', label: 'Human monsters, not ghosts', attribute: 'grounded', polarity: 1 },
  ],
  documentary: [
    { value: 'true_story', label: 'That it is true', attribute: 'true_story', polarity: 1 },
    { value: 'investigation', label: 'Unpicking what happened', attribute: 'investigation', polarity: 1 },
    { value: 'emotion', label: 'The people in it', attribute: 'character_driven', polarity: 1 },
  ],
};

// ── Single-choice vocabularies ─────────────────────────────────────────────

export const TONE_OPTIONS: readonly ReasonChip[] = [
  { value: 'dark', label: 'Something dark', attribute: 'dark_tone', polarity: 1, weight: 0.8 },
  { value: 'light', label: 'Something that lifts me', attribute: 'feel_good', polarity: 1, weight: 0.8 },
  { value: 'depends', label: 'Depends entirely on the day' },
];

export const COMEDY_OPTIONS: readonly ReasonChip[] = [
  { value: 'yes', label: 'Yes — even the grim stuff needs jokes', attribute: 'comedy', polarity: 1, weight: 0.8 },
  { value: 'no', label: 'No — happy with it played straight', attribute: 'comedy', polarity: -1, weight: 0.5 },
  { value: 'sometimes', label: 'Only when it is the point' },
];

// ── Deal-breakers ──────────────────────────────────────────────────────────

export const DEALBREAKER_CHIPS: readonly ReasonChip[] = [
  { value: 'slow_pace', label: 'Slow pacing', attribute: 'slow_pace' },
  { value: 'complex_plot', label: 'Confusing timelines', attribute: 'complex_plot' },
  { value: 'unfinished', label: 'Unresolved or cancelled endings', attribute: 'unfinished' },
  { value: 'violence', label: 'Heavy violence', attribute: 'violence' },
  { value: 'gore', label: 'Gore', attribute: 'gore' },
  { value: 'supernatural', label: 'Supernatural content', attribute: 'supernatural' },
  { value: 'sci_fi', label: 'Heavy science fiction', attribute: 'sci_fi' },
  { value: 'romance_genre', label: 'Too much romance', attribute: 'romance_genre' },
  { value: 'dark_tone', label: 'Relentlessly depressing', attribute: 'dark_tone' },
  { value: 'child_harm', label: 'Harm to children', attribute: 'child_harm' },
  { value: 'animal_harm', label: 'Harm to animals', attribute: 'animal_harm' },
  { value: 'subtitles', label: 'Subtitles', attribute: 'subtitles' },
  { value: 'english_audio', label: 'Bad dubbing', attribute: 'english_audio' },
  { value: 'long_runtime', label: 'Very long films', attribute: 'long_runtime' },
  { value: 'many_seasons', label: 'Shows that never end', attribute: 'many_seasons' },
];

/**
 * How badly. This grading is the whole point of the stage: without it every
 * dislike becomes never-recommend and the catalog collapses.
 */
export interface DealbreakerStrength {
  value: string;
  label: string;
  hint: string;
  strength: number;
  durability: Durability;
  hardExclusion?: boolean;
  conditional?: boolean;
}

export const DEALBREAKER_STRENGTHS: readonly DealbreakerStrength[] = [
  {
    value: 'hard',
    label: 'Never show me this',
    hint: 'A hard line — no exceptions.',
    strength: 1,
    durability: 'durable',
    hardExclusion: true,
  },
  {
    value: 'strong',
    label: 'Strongly put me off',
    hint: 'Rank it way down, but do not hide it.',
    strength: 0.85,
    durability: 'durable',
  },
  {
    value: 'mild',
    label: 'A mild negative',
    hint: 'Slight mark against it.',
    strength: 0.45,
    durability: 'durable',
  },
  {
    value: 'conditional',
    label: 'Fine if the rest is right',
    hint: 'I will treat it as a condition, not a rule.',
    strength: 0.6,
    durability: 'durable',
    conditional: true,
  },
  {
    value: 'temporary',
    label: 'Just at the moment',
    hint: 'This will fade rather than stick.',
    strength: 0.6,
    durability: 'temporary',
  },
];

// ── Format and access ──────────────────────────────────────────────────────

export interface FormatQuestion {
  id: string;
  prompt: string;
  options: ReasonChip[];
  /** Only ask when this returns true for the answers so far. */
  relevantWhen?: (answers: Record<string, string>) => boolean;
}

export const FORMAT_QUESTIONS: readonly FormatQuestion[] = [
  {
    id: 'movies_or_shows',
    prompt: 'Films, series, or both?',
    options: [
      { value: 'movies', label: 'Mostly films', attribute: 'many_seasons', polarity: -1, weight: 0.6 },
      { value: 'shows', label: 'Mostly series', attribute: 'serialized', polarity: 1, weight: 0.6 },
      { value: 'both', label: 'Both, honestly' },
    ],
  },
  {
    id: 'runtime',
    prompt: 'How long is too long for a film?',
    options: [
      { value: 'ninety', label: 'Over 90 minutes pushes it', attribute: 'long_runtime', polarity: -1, weight: 0.9 },
      { value: 'two_hours', label: 'Two hours is my limit', attribute: 'long_runtime', polarity: -1, weight: 0.6 },
      { value: 'no_limit', label: 'Length does not bother me', attribute: 'long_runtime', polarity: 1, weight: 0.5 },
    ],
    relevantWhen: (a) => a.movies_or_shows !== 'shows',
  },
  {
    id: 'series_shape',
    prompt: 'Episodic cases, or one long story?',
    options: [
      { value: 'episodic', label: 'A case an episode', attribute: 'episodic', polarity: 1, weight: 0.9 },
      { value: 'serialized', label: 'One continuing story', attribute: 'serialized', polarity: 1, weight: 0.9 },
      { value: 'either', label: 'Either works' },
    ],
    relevantWhen: (a) => a.movies_or_shows !== 'movies',
  },
  {
    id: 'completed',
    prompt: 'Do you need a series to be finished before you start?',
    options: [
      { value: 'must_be_done', label: 'Yes — I will not start an unfinished one', attribute: 'unfinished', polarity: -1, weight: 0.95 },
      { value: 'prefer', label: 'I prefer it', attribute: 'unfinished', polarity: -1, weight: 0.6 },
      { value: 'dont_care', label: 'Does not bother me', attribute: 'unfinished', polarity: 1, weight: 0.4 },
    ],
    relevantWhen: (a) => a.movies_or_shows !== 'movies',
  },
  {
    id: 'subtitles',
    prompt: 'Where do you stand on subtitles?',
    options: [
      { value: 'happy', label: 'Happy with them', attribute: 'subtitles', polarity: 1, weight: 0.85 },
      { value: 'prefer_dub', label: 'Only if English audio exists', attribute: 'english_audio', polarity: 1, weight: 0.9 },
      { value: 'never', label: 'I will not read a film', attribute: 'subtitles', polarity: -1, weight: 0.95 },
    ],
  },
  {
    id: 'older',
    prompt: 'Older films — in or out?',
    options: [
      { value: 'yes', label: 'Happily' },
      { value: 'colour_only', label: 'Yes, but nothing black-and-white' },
      { value: 'modern', label: 'I stick to modern stuff' },
    ],
  },
];

// ── Chip → claim ───────────────────────────────────────────────────────────

export interface ChipClaimContext {
  id: string;
  at: number;
  source: Claim['source'];
  quote: string;
  /** The title this reason explains, if any. */
  title?: Claim['title'];
  /** Multiplies the chip's own weight (e.g. how far into a show they got). */
  factor?: number;
  /** Flips the chip's polarity — used when the same chip explains a dislike. */
  invert?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Turn one tapped chip into a claim. Returns null when the chip carries no
 * preference information at all — an honest nothing rather than a weak
 * something.
 */
export function chipToClaim(
  chip: ReasonChip & { durability?: Durability },
  ctx: ChipClaimContext,
): Claim | null {
  if (!chip.attribute) {
    if (!chip.unactionable) return null;
    // Recorded and shown back as a reason on the title, weighted at zero.
    return {
      id: ctx.id,
      attribute: null,
      ...(chip.aspect ? { aspect: chip.aspect } : {}),
      polarity: 1,
      strength: 0,
      confidence: 0.9,
      durability: 'durable',
      scope: 'general',
      source: ctx.source,
      quote: ctx.quote,
      at: ctx.at,
      unactionable: true,
      ...(ctx.title ? { title: ctx.title } : {}),
    };
  }

  const polarity = ((chip.polarity ?? 1) * (ctx.invert ? -1 : 1)) as -1 | 1;
  const claim: Claim = {
    id: ctx.id,
    attribute: chip.attribute,
    polarity,
    strength: clamp((chip.weight ?? 0.8) * (ctx.factor ?? 1), 0.05, 1),
    // A tapped chip is unambiguous in a way free text is not.
    confidence: 0.9,
    durability: chip.durability ?? 'durable',
    scope: 'general',
    source: ctx.source,
    quote: ctx.quote,
    at: ctx.at,
  };
  if (ctx.title) claim.title = ctx.title;
  if (chip.unactionable) claim.unactionable = true;
  return claim;
}

/** Look a chip up in a set by its value. */
export function findChip(
  set: readonly ReasonChip[],
  value: string,
): ReasonChip | undefined {
  return set.find((c) => c.value === value);
}
