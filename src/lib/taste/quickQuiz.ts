/**
 * THE QUICK TASTE QUIZ.
 *
 * A fast, familiar preference quiz — the kind people already know how to fill
 * in — that produces exactly the same structured claims as everything else in
 * `src/lib/taste/`. It replaces the retired interview: same destination, far
 * less effort, and no illusion of conversation.
 *
 * Four design rules carry the whole thing:
 *
 *  1. FOUR ANSWERS, AND ONE OF THEM IS "IT DEPENDS". Real taste is conditional.
 *     Forcing a yes/no is what makes quizzes produce profiles people disown, so
 *     "Depends" is a first-class answer that records a *condition*, not a
 *     weaker yes. It never opens a modal or an interview — just chips.
 *  2. EVERY ANSWER IS TRACEABLE. Each response produces claims carrying the
 *     question id, bank version, response, weights, conditions and timestamp
 *     (`AnswerProvenance`), so any line of the DNA reveal can be pointed back
 *     at the question that made it — and revised by re-answering.
 *  3. COVERAGE AND CONFIDENCE ARE DIFFERENT NUMBERS. Coverage is how much of
 *     the person we have asked about. Confidence is how firmly we hold the
 *     answers. Twelve emphatic answers about comedy are high confidence and
 *     low coverage, and the label must say so.
 *  4. THE WEIGHTS LIVE HERE. `RESPONSE_VALUES` is the single place the four
 *     answers are priced. No UI component hard-codes a number.
 *
 * Pure — no I/O, no clock, no model calls. `src/lib/scoring/` is untouched.
 */
import type { Claim, Condition, ConditionMode, EvidenceSource } from './types';
import { attribute } from './lexicon';

/** Bump when the bank changes in a way that makes old answers non-comparable. */
export const BANK_VERSION = '1.0.0';

/** How many questions a first session asks. */
export const SESSION_LENGTH = 12;

// ── Responses ───────────────────────────────────────────────────────────────

export type ResponseKey = 'exactly' | 'mostly' | 'depends' | 'not_me';

export const RESPONSE_KEYS: readonly ResponseKey[] = ['exactly', 'mostly', 'depends', 'not_me'];

export interface ResponseValue {
  key: ResponseKey;
  label: string;
  /** Signed weight applied to the question's targets. */
  value: number;
  /**
   * "Depends" is not a weak yes: it records a preference that only holds under
   * a condition, so the claim is scoped `conditional` and the profile discounts
   * it. Everything else is a plain, general claim.
   */
  scope: 'general' | 'conditional';
  /** How sure we are we understood them. */
  confidence: number;
}

/**
 * The price list. Configurable in one place on purpose — the UI reads labels
 * and weights from here rather than repeating them.
 */
export const RESPONSE_VALUES: Record<ResponseKey, ResponseValue> = {
  exactly: { key: 'exactly', label: 'Exactly me', value: 1.0, scope: 'general', confidence: 0.95 },
  mostly: { key: 'mostly', label: 'Mostly', value: 0.6, scope: 'general', confidence: 0.8 },
  depends: { key: 'depends', label: 'Depends', value: 0.5, scope: 'conditional', confidence: 0.7 },
  not_me: { key: 'not_me', label: 'Not me', value: -0.75, scope: 'general', confidence: 0.9 },
};

/** Keyboard order — 1..4 on desktop. Matches the visual order of the buttons. */
export const RESPONSE_ORDER: readonly ResponseKey[] = ['exactly', 'mostly', 'depends', 'not_me'];

// ── Questions ───────────────────────────────────────────────────────────────

export type SectionKey =
  | 'core_loves'
  | 'pace'
  | 'tone'
  | 'ingredients'
  | 'limits'
  | 'viewing'
  | 'exceptions';

export interface Section {
  key: SectionKey;
  label: string;
  /** One line explaining what this section is for, shown above its questions. */
  blurb: string;
}

export const SECTIONS: readonly Section[] = [
  { key: 'core_loves', label: 'Core loves', blurb: 'The kinds of thing you actively seek out.' },
  { key: 'pace', label: 'Pace & structure', blurb: 'How fast, how long, how much commitment.' },
  { key: 'tone', label: 'Tone', blurb: 'Dark, warm, funny, tense — the feel you want.' },
  { key: 'ingredients', label: 'Story ingredients', blurb: 'What a story needs to hold you.' },
  { key: 'limits', label: 'Deal-breakers & tolerances', blurb: 'What you will and will not sit through.' },
  { key: 'viewing', label: 'Viewing style', blurb: 'How you actually watch.' },
  { key: 'exceptions', label: 'Exceptions', blurb: 'When your own rules stop applying.' },
];

/**
 * Three shapes of question, deliberately distinguished:
 *  - `attribute` — a statement about the person ("I love a good scare").
 *  - `tradeoff`  — two real alternatives, so "Not me" means the other pole
 *                  rather than an absence.
 *  - `tolerance` — an explicit limit, where "Not me" may be a hard line and the
 *                  chips can say so.
 */
export type QuestionType = 'attribute' | 'tradeoff' | 'tolerance';

/** One attribute the question moves, and by how much relative to the response. */
export interface AttrTarget {
  key: string;
  polarity: -1 | 1;
  /** Relative share of the response weight. Defaults to 1. */
  weight?: number;
}

/** A compact clarifier offered when the answer is "Depends". Never a modal. */
export interface QuizChip {
  id: string;
  label: string;
  /** Recorded verbatim on the claim as the condition. */
  condition: string;
  /** `requires` = only then; `suspends` = except then. */
  mode?: ConditionMode;
  /** Extra attributes this chip pins, on top of the question's own targets. */
  targets?: AttrTarget[];
  /**
   * Turns the claim into a never-recommend line. Only ever offered on tolerance
   * questions, and only ever set because the user picked it — a strong dislike
   * is not a hard exclusion.
   */
  hardExclusion?: boolean;
}

export interface QuizQuestion {
  id: string;
  section: SectionKey;
  type: QuestionType;
  /** The statement the four answers respond to. First person, plain language. */
  prompt: string;
  /** Optional clarifier under the prompt. */
  hint?: string;
  /** Credited when the answer is positive. */
  yes: AttrTarget[];
  /**
   * Credited when the answer is "Not me". Defaults to `yes` with the polarity
   * flipped — which is right for `attribute` and `tolerance` questions, and
   * wrong for `tradeoff`, where the other pole is a different attribute.
   */
  no?: AttrTarget[];
  /** Offered on "Depends". */
  chips?: QuizChip[];
  /**
   * How much this question is worth asking, all else equal. Used only to break
   * ties in selection — never shown.
   */
  priority?: number;
}

const ONLY_IF = (id: string, label: string, condition: string, targets?: AttrTarget[]): QuizChip => ({
  id,
  label,
  condition,
  mode: 'requires',
  ...(targets ? { targets } : {}),
});

/** Chips that fit almost any "depends" — mood, company, effort. */
const MOOD_CHIPS: QuizChip[] = [
  ONLY_IF('chip-mood', 'Depends on my mood', 'I am in the mood for it'),
  ONLY_IF('chip-alone', 'Only when I watch alone', 'I am watching on my own'),
  ONLY_IF('chip-energy', 'Only when I have the energy', 'I have the energy for it'),
];

/**
 * THE BANK.
 *
 * Every question maps to attributes the recommender can actually act on. A
 * question that would produce a compliment rather than a filter ("I like good
 * writing") is not in here, because it cannot change a single recommendation.
 */
export const QUESTION_BANK: readonly QuizQuestion[] = [
  // ── Core loves ────────────────────────────────────────────────────────────
  {
    id: 'q-crime',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'A good crime story is my default pick.',
    yes: [{ key: 'crime', polarity: 1 }, { key: 'investigation', polarity: 1, weight: 0.6 }],
    chips: [
      ONLY_IF('chip-crime-real', 'Only true crime', 'it is a true story', [{ key: 'true_story', polarity: 1 }]),
      ONLY_IF('chip-crime-detective', 'Only detective / procedural', 'it is an investigation', [{ key: 'investigation', polarity: 1 }]),
      ...MOOD_CHIPS.slice(0, 1),
    ],
    priority: 1.1,
  },
  {
    id: 'q-scifi',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'Science fiction and big ideas pull me in.',
    yes: [{ key: 'sci_fi', polarity: 1 }],
    chips: [
      ONLY_IF('chip-scifi-grounded', 'Only if it feels plausible', 'it stays grounded', [{ key: 'grounded', polarity: 1 }]),
      ONLY_IF('chip-scifi-nospace', 'Not space opera', 'it is not a space epic', [{ key: 'epic_stakes', polarity: -1 }]),
      ...MOOD_CHIPS.slice(0, 1),
    ],
  },
  {
    id: 'q-comedy',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'I would rather laugh than be put through something.',
    yes: [{ key: 'comedy', polarity: 1 }, { key: 'feel_good', polarity: 1, weight: 0.5 }],
    chips: [
      ONLY_IF('chip-comedy-dry', 'Only dry / deadpan humour', 'the humour is dry rather than broad', [{ key: 'cynical', polarity: 1, weight: 0.4 }]),
      ONLY_IF('chip-comedy-dark', 'Dark comedy counts', 'it can be dark as well as funny', [{ key: 'dark_tone', polarity: 1, weight: 0.5 }]),
      ...MOOD_CHIPS.slice(0, 1),
    ],
    priority: 1.1,
  },
  {
    id: 'q-doc',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'Documentaries and true stories are time well spent.',
    yes: [{ key: 'documentary', polarity: 1 }, { key: 'true_story', polarity: 1, weight: 0.7 }],
    chips: [
      ONLY_IF('chip-doc-crime', 'Mostly true crime', 'it is true crime', [{ key: 'crime', polarity: 1 }]),
      ONLY_IF('chip-doc-nature', 'Mostly nature / history', 'it is history or nature', [{ key: 'historical', polarity: 1 }]),
    ],
  },
  {
    id: 'q-action',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'I want something with real momentum — action, chases, set pieces.',
    yes: [{ key: 'action', polarity: 1 }, { key: 'fast_pace', polarity: 1, weight: 0.6 }],
    chips: [
      ONLY_IF('chip-action-grounded', 'Grounded action only', 'the action stays grounded', [{ key: 'grounded', polarity: 1 }]),
      ONLY_IF('chip-action-nocape', 'Not superhero films', 'it is not a superhero film', [{ key: 'superhero', polarity: -1 }]),
    ],
  },
  {
    id: 'q-romance',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'A love story at the centre is a draw, not a drawback.',
    yes: [{ key: 'romance_genre', polarity: 1 }],
    chips: [
      ONLY_IF('chip-rom-side', 'Only as a subplot', 'the romance is a subplot rather than the point'),
      ONLY_IF('chip-rom-happy', 'Only if it ends well', 'it ends happily', [{ key: 'feel_good', polarity: 1 }]),
    ],
  },
  {
    id: 'q-fantasy',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'Fantasy worlds, magic and myth are my thing.',
    yes: [{ key: 'fantasy', polarity: 1 }],
    chips: [
      ONLY_IF('chip-fant-adult', 'Only the adult, serious kind', 'it is not aimed at children', [{ key: 'dark_tone', polarity: 1, weight: 0.4 }]),
      ...MOOD_CHIPS.slice(0, 1),
    ],
  },
  {
    id: 'q-horror',
    section: 'core_loves',
    type: 'attribute',
    prompt: 'I actively enjoy being scared.',
    yes: [{ key: 'horror', polarity: 1 }, { key: 'scary', polarity: 1, weight: 0.8 }],
    chips: [
      ONLY_IF('chip-horror-nogore', 'Tension yes, gore no', 'it is tense rather than gory', [{ key: 'gore', polarity: -1 }]),
      ONLY_IF('chip-horror-company', 'Only with other people', 'I am not watching alone'),
    ],
    priority: 1.1,
  },

  // ── Pace & structure ──────────────────────────────────────────────────────
  {
    id: 'q-pace-tradeoff',
    section: 'pace',
    type: 'tradeoff',
    prompt: 'Given the choice, I want something that moves fast rather than something that takes its time.',
    hint: 'Not me = you would rather it took its time.',
    yes: [{ key: 'fast_pace', polarity: 1 }],
    no: [{ key: 'slow_pace', polarity: 1 }],
    chips: [
      ONLY_IF('chip-pace-tv', 'Fast for TV, slow is fine for film', 'it is a series rather than a film'),
      ONLY_IF('chip-pace-late', 'Depends how late it is', 'it is not late at night'),
    ],
    priority: 1.3,
  },
  {
    id: 'q-length-tradeoff',
    section: 'pace',
    type: 'tradeoff',
    prompt: 'I would rather have a tight two-hour film than an eight-episode series.',
    hint: 'Not me = you would rather have the series.',
    yes: [{ key: 'limited_series', polarity: -1, weight: 0.4 }, { key: 'many_seasons', polarity: -1 }],
    no: [{ key: 'serialized', polarity: 1 }, { key: 'many_seasons', polarity: 1, weight: 0.6 }],
    chips: [
      ONLY_IF('chip-len-limited', 'A limited series is the sweet spot', 'it is a limited series', [{ key: 'limited_series', polarity: 1 }]),
      ONLY_IF('chip-len-weekend', 'Long only at the weekend', 'I have a free evening'),
    ],
    priority: 1.2,
  },
  {
    id: 'q-runtime',
    section: 'pace',
    type: 'tolerance',
    prompt: 'A film over two and a half hours is fine by me.',
    yes: [{ key: 'long_runtime', polarity: 1 }],
    chips: [
      ONLY_IF('chip-run-great', 'Only if it is meant to be great', 'it is genuinely well reviewed'),
      ONLY_IF('chip-run-cinema', 'Only at the weekend', 'I have a free evening'),
    ],
  },
  {
    id: 'q-serialized',
    section: 'pace',
    type: 'tradeoff',
    prompt: 'I want a story that carries across episodes, not one that resets each week.',
    hint: 'Not me = you prefer self-contained episodes.',
    yes: [{ key: 'serialized', polarity: 1 }],
    no: [{ key: 'episodic', polarity: 1 }],
    chips: [
      ONLY_IF('chip-ser-finished', 'Only if it is finished', 'the series is complete', [{ key: 'unfinished', polarity: -1 }]),
    ],
  },
  {
    id: 'q-unfinished',
    section: 'pace',
    type: 'tolerance',
    prompt: 'Starting a show that has not finished airing does not bother me.',
    yes: [{ key: 'unfinished', polarity: 1 }],
    chips: [
      ONLY_IF('chip-unfin-renewed', 'Only if it is renewed', 'it has been renewed'),
    ],
  },

  // ── Tone ──────────────────────────────────────────────────────────────────
  {
    id: 'q-tone-tradeoff',
    section: 'tone',
    type: 'tradeoff',
    prompt: 'I would rather something dark and heavy than something warm and easy.',
    hint: 'Not me = you would rather have the warm one.',
    yes: [{ key: 'dark_tone', polarity: 1 }],
    no: [{ key: 'feel_good', polarity: 1 }],
    chips: [
      ONLY_IF('chip-tone-week', 'Depends on the week I have had', 'I am up to it'),
      ONLY_IF('chip-tone-hope', 'Dark, but it has to end somewhere hopeful', 'it does not end bleakly'),
    ],
    priority: 1.3,
  },
  {
    id: 'q-tense',
    section: 'tone',
    type: 'attribute',
    prompt: 'I like being kept on edge the whole way through.',
    yes: [{ key: 'tense', polarity: 1 }, { key: 'thriller', polarity: 1, weight: 0.6 }],
    chips: [
      ONLY_IF('chip-tense-nothreat', 'Not when children are in danger', 'no child is in danger', [{ key: 'child_harm', polarity: -1 }]),
      ...MOOD_CHIPS.slice(0, 1),
    ],
  },
  {
    id: 'q-emotional',
    section: 'tone',
    type: 'attribute',
    prompt: 'I do not mind something that makes me cry.',
    yes: [{ key: 'emotional', polarity: 1 }],
    chips: [
      ONLY_IF('chip-emo-earned', 'Only if it is earned, not manipulative', 'it is not sentimental'),
      ...MOOD_CHIPS.slice(0, 1),
    ],
  },
  {
    id: 'q-cynical',
    section: 'tone',
    type: 'tradeoff',
    prompt: 'I prefer something with a cynical edge over something sincere and hopeful.',
    hint: 'Not me = you would rather have the sincere one.',
    yes: [{ key: 'cynical', polarity: 1 }],
    no: [{ key: 'feel_good', polarity: 1, weight: 0.7 }],
  },
  {
    id: 'q-feelgood',
    section: 'tone',
    type: 'attribute',
    prompt: 'Most nights I want something that leaves me feeling better.',
    yes: [{ key: 'feel_good', polarity: 1 }],
    chips: [
      ONLY_IF('chip-fg-weeknight', 'On weeknights, yes', 'it is a weeknight'),
    ],
  },

  // ── Story ingredients ─────────────────────────────────────────────────────
  {
    id: 'q-character-tradeoff',
    section: 'ingredients',
    type: 'tradeoff',
    prompt: 'I care more about the people than about what happens to them.',
    hint: 'Not me = plot first.',
    yes: [{ key: 'character_driven', polarity: 1 }],
    no: [{ key: 'plot_driven', polarity: 1 }],
    priority: 1.3,
  },
  {
    id: 'q-complex',
    section: 'ingredients',
    type: 'attribute',
    prompt: 'I want something I have to concentrate on.',
    yes: [{ key: 'complex_plot', polarity: 1 }],
    chips: [
      ONLY_IF('chip-cplx-alone', 'Only when I am watching properly', 'I am giving it my full attention'),
      ONLY_IF('chip-cplx-notlate', 'Not late at night', 'it is not late at night'),
    ],
    priority: 1.2,
  },
  {
    id: 'q-twists',
    section: 'ingredients',
    type: 'attribute',
    prompt: 'A twist I did not see coming is the best part.',
    yes: [{ key: 'twists', polarity: 1 }],
  },
  {
    id: 'q-grey',
    section: 'ingredients',
    type: 'attribute',
    prompt: 'I want characters I am not sure I should be rooting for.',
    yes: [{ key: 'morally_grey', polarity: 1 }],
  },
  {
    id: 'q-stakes-tradeoff',
    section: 'ingredients',
    type: 'tradeoff',
    prompt: 'I would rather watch one family fall apart than the world end.',
    hint: 'Not me = you want the big canvas.',
    yes: [{ key: 'intimate_stakes', polarity: 1 }],
    no: [{ key: 'epic_stakes', polarity: 1 }],
  },
  {
    id: 'q-grounded',
    section: 'ingredients',
    type: 'tradeoff',
    prompt: 'I want it to feel like it could actually happen.',
    hint: 'Not me = you are happy with the unreal.',
    yes: [{ key: 'grounded', polarity: 1 }],
    no: [{ key: 'supernatural', polarity: 1, weight: 0.6 }, { key: 'fantasy', polarity: 1, weight: 0.6 }],
    chips: [
      ONLY_IF('chip-ground-scifi', 'Sci-fi is the exception', 'it is science fiction', [{ key: 'sci_fi', polarity: 1 }]),
    ],
  },

  // ── Deal-breakers & tolerances ────────────────────────────────────────────
  {
    id: 'q-gore',
    section: 'limits',
    type: 'tolerance',
    prompt: 'Graphic gore does not put me off.',
    yes: [{ key: 'gore', polarity: 1 }],
    chips: [
      ONLY_IF('chip-gore-purpose', 'Only if it serves the story', 'the violence has a point'),
      {
        id: 'chip-gore-never',
        label: 'Never — leave it out entirely',
        condition: 'no graphic gore',
        mode: 'suspends',
        hardExclusion: true,
        targets: [{ key: 'gore', polarity: -1 }],
      },
    ],
    priority: 1.2,
  },
  {
    id: 'q-violence',
    section: 'limits',
    type: 'tolerance',
    prompt: 'Sustained violence is fine with me.',
    yes: [{ key: 'violence', polarity: 1 }],
    chips: [
      ONLY_IF('chip-viol-purpose', 'Only if it is not gratuitous', 'the violence is not gratuitous'),
      {
        id: 'chip-viol-never',
        label: 'Never — that is a hard line',
        condition: 'no sustained violence',
        mode: 'suspends',
        hardExclusion: true,
        targets: [{ key: 'violence', polarity: -1 }],
      },
    ],
  },
  {
    id: 'q-child-harm',
    section: 'limits',
    type: 'tolerance',
    prompt: 'Stories where children come to harm are something I can watch.',
    yes: [{ key: 'child_harm', polarity: 1 }],
    chips: [
      ONLY_IF('chip-child-offscreen', 'Only if it is off-screen', 'it happens off-screen'),
      {
        id: 'chip-child-never',
        label: 'Never — that is a hard line',
        condition: 'no harm to children',
        mode: 'suspends',
        hardExclusion: true,
        targets: [{ key: 'child_harm', polarity: -1 }],
      },
    ],
    priority: 1.3,
  },
  {
    id: 'q-animal-harm',
    section: 'limits',
    type: 'tolerance',
    prompt: 'Animals being hurt on screen is something I can sit through.',
    yes: [{ key: 'animal_harm', polarity: 1 }],
    chips: [
      {
        id: 'chip-animal-never',
        label: 'Never — that is a hard line',
        condition: 'no harm to animals',
        mode: 'suspends',
        hardExclusion: true,
        targets: [{ key: 'animal_harm', polarity: -1 }],
      },
    ],
  },
  {
    id: 'q-sex',
    section: 'limits',
    type: 'tolerance',
    prompt: 'Explicit sexual content does not bother me.',
    yes: [{ key: 'sex_content', polarity: 1 }],
    chips: [
      ONLY_IF('chip-sex-alone', 'Not when I am watching with family', 'I am not watching with family'),
      {
        id: 'chip-sex-never',
        label: 'Never — leave it out',
        condition: 'no explicit sexual content',
        mode: 'suspends',
        hardExclusion: true,
        targets: [{ key: 'sex_content', polarity: -1 }],
      },
    ],
  },
  {
    id: 'q-subtitles',
    section: 'limits',
    type: 'tolerance',
    prompt: 'Reading subtitles is no obstacle at all.',
    yes: [{ key: 'subtitles', polarity: 1 }, { key: 'foreign_language', polarity: 1, weight: 0.8 }],
    chips: [
      ONLY_IF('chip-sub-attention', 'Only when I am watching properly', 'I am giving it my full attention'),
      ONLY_IF('chip-sub-dub', 'I would rather have a good dub', 'there is an English dub', [{ key: 'english_audio', polarity: 1 }]),
    ],
    priority: 1.2,
  },
  {
    id: 'q-reality',
    section: 'limits',
    type: 'tolerance',
    prompt: 'Reality TV is not something I look down on.',
    yes: [{ key: 'reality', polarity: 1 }],
  },

  // ── Viewing style ─────────────────────────────────────────────────────────
  {
    id: 'q-background',
    section: 'viewing',
    type: 'attribute',
    prompt: 'A lot of the time I want something I can half-watch.',
    yes: [{ key: 'background_friendly', polarity: 1 }],
    chips: [
      ONLY_IF('chip-bg-weeknight', 'Weeknights only', 'it is a weeknight'),
      ONLY_IF('chip-bg-rewatch', 'Only things I have already seen', 'I have seen it before'),
    ],
    priority: 1.2,
  },
  {
    id: 'q-together',
    section: 'viewing',
    type: 'attribute',
    prompt: 'Most of my watching is with someone else, so it has to work for two.',
    yes: [{ key: 'background_friendly', polarity: -1, weight: 0.3 }, { key: 'gore', polarity: -1, weight: 0.3 }],
    hint: 'This shapes how safe the picks need to be, not what genre you get.',
    chips: [
      ONLY_IF('chip-tog-kids', 'Children are sometimes in the room', 'nothing is unsuitable for children', [
        { key: 'sex_content', polarity: -1 },
        { key: 'gore', polarity: -1 },
      ]),
    ],
  },
  {
    id: 'q-animation',
    section: 'viewing',
    type: 'tolerance',
    prompt: 'Animation is for me as much as for children.',
    yes: [{ key: 'animation', polarity: 1 }],
    chips: [
      ONLY_IF('chip-anim-adult', 'Only the grown-up kind', 'it is aimed at adults'),
      ONLY_IF('chip-anim-anime', 'Anime specifically', 'it is anime', [{ key: 'foreign_language', polarity: 1, weight: 0.5 }]),
    ],
  },
  {
    id: 'q-many-seasons',
    section: 'viewing',
    type: 'tolerance',
    prompt: 'I am happy to commit to something with six seasons ahead of me.',
    yes: [{ key: 'many_seasons', polarity: 1 }],
    chips: [
      ONLY_IF('chip-seasons-good', 'Only if it stays good', 'it does not fall off after a couple of seasons'),
    ],
  },

  // ── Exceptions ────────────────────────────────────────────────────────────
  // These exist because a flat profile is a caricature. Each one is recorded as
  // a conditional claim, so it softens a rule instead of cancelling it.
  {
    id: 'q-except-scary',
    section: 'exceptions',
    type: 'tolerance',
    prompt: 'Even if a genre is not usually mine, a genuinely great one can win me over.',
    hint: 'This loosens your rules rather than adding one.',
    yes: [],
    chips: [
      ONLY_IF('chip-exc-acclaim', 'Only if it is properly acclaimed', 'it is exceptionally well reviewed'),
      ONLY_IF('chip-exc-recommend', 'Only if someone I trust says so', 'someone I trust recommends it'),
    ],
    priority: 0.7,
  },
  {
    id: 'q-except-subs',
    section: 'exceptions',
    type: 'tolerance',
    prompt: 'I will read subtitles for something that is supposed to be exceptional.',
    yes: [{ key: 'subtitles', polarity: 1, weight: 0.6 }],
    chips: [
      ONLY_IF('chip-exc-subs-acclaim', 'Only if it is properly acclaimed', 'it is exceptionally well reviewed'),
    ],
    priority: 0.8,
  },
  {
    id: 'q-except-long',
    section: 'exceptions',
    type: 'tolerance',
    prompt: 'Length stops mattering when the thing is good enough.',
    yes: [{ key: 'long_runtime', polarity: 1, weight: 0.6 }, { key: 'many_seasons', polarity: 1, weight: 0.4 }],
    chips: [
      ONLY_IF('chip-exc-long-acclaim', 'Only if it is properly acclaimed', 'it is exceptionally well reviewed'),
    ],
    priority: 0.8,
  },
  {
    id: 'q-except-rewatch',
    section: 'exceptions',
    type: 'attribute',
    prompt: 'I will happily rewatch something I love instead of trying anything new.',
    yes: [{ key: 'background_friendly', polarity: 1, weight: 0.5 }],
    priority: 0.7,
  },
];

const BY_ID = new Map(QUESTION_BANK.map((q) => [q.id, q]));

export function question(id: string): QuizQuestion | undefined {
  return BY_ID.get(id);
}

/** The attributes a question can move, whichever way it is answered. */
export function questionAttributes(q: QuizQuestion): string[] {
  const keys = new Set<string>();
  for (const t of q.yes) keys.add(t.key);
  for (const t of q.no ?? []) keys.add(t.key);
  for (const c of q.chips ?? []) for (const t of c.targets ?? []) keys.add(t.key);
  return Array.from(keys);
}

/** The content-DNA axes a question can move. */
export function questionAxes(q: QuizQuestion): string[] {
  const axes = new Set<string>();
  for (const key of questionAttributes(q)) {
    for (const d of attribute(key)?.dims ?? []) axes.add(d.key);
  }
  return Array.from(axes);
}

// ── Selection ───────────────────────────────────────────────────────────────

export interface SelectionInput {
  /** Override the bank (tests). */
  bank?: readonly QuizQuestion[];
  /**
   * Attribute key → evidence weight we already hold, from existing DNA or an
   * import. Questions whose ground is already well covered are not asked again.
   */
  known?: Record<string, number>;
  /** Question ids already answered — never re-asked inside a session. */
  asked?: readonly string[];
  count?: number;
}

/**
 * A quiz claim's `quote` is `"<the statement> — <the answer they gave>"`, built
 * in `claimsFrom` below. Rendered as one run of text it reads as a single
 * sentence, so a statement someone rejected looks like something they said:
 * "You avoid subtitles" sitting above "Reading subtitles is no obstacle at all
 * — Not me" reads as a contradiction until you get to the very end, and on a
 * phone the end is exactly what gets truncated away.
 *
 * So split it, and show the answer as its own thing. Deterministic: the tail
 * only counts as an answer when it is literally one of the four response
 * labels, otherwise the whole string stays the statement. Never invents, never
 * drops text — `statement` plus `answer` always reconstitutes the input.
 */
const RESPONSE_LABELS: ReadonlySet<string> = new Set(
  Object.values(RESPONSE_VALUES).map((r) => r.label),
);

export function splitQuote(quote: string): { statement: string; answer: string | null } {
  const at = quote.lastIndexOf(' — ');
  if (at < 0) return { statement: quote, answer: null };
  const answer = quote.slice(at + 3).trim();
  if (!RESPONSE_LABELS.has(answer)) return { statement: quote, answer: null };
  return { statement: quote.slice(0, at).trim(), answer };
}

/** Evidence at which an attribute counts as fully known for selection purposes. */
export const KNOWN_SATURATION = 1.5;

/** A question this far below the best one is not worth asking instead of it. */
const MIN_GAIN = 0.05;

function saturation(evidence: number): number {
  return Math.min(1, Math.max(0, evidence) / KNOWN_SATURATION);
}

/**
 * Choose the questions worth asking, by information gain.
 *
 * Greedy: each pick is the question that tells us most about ground we do not
 * already cover, with a bonus for opening a section we have not touched — a
 * profile that knows everything about tone and nothing about limits is worse
 * than one that knows a little about both. Deterministic: ties fall to bank
 * order, so the same inputs always produce the same quiz.
 */
export function selectQuestions(input: SelectionInput = {}): QuizQuestion[] {
  const bank = input.bank ?? QUESTION_BANK;
  const asked = new Set(input.asked ?? []);
  const count = input.count ?? SESSION_LENGTH;

  // Running coverage per attribute, seeded from what we already know.
  const cover: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.known ?? {})) cover[k] = saturation(Math.abs(v));

  const sectionsUsed = new Set<SectionKey>();
  const chosen: QuizQuestion[] = [];
  const pool = bank.filter((q) => !asked.has(q.id));

  while (chosen.length < count && pool.length > 0) {
    let best: QuizQuestion | null = null;
    let bestGain = -Infinity;

    for (const q of pool) {
      const attrs = questionAttributes(q);
      // Novelty of the ground it covers.
      let gain = attrs.reduce((sum, k) => sum + (1 - (cover[k] ?? 0)), 0);
      // A question with no attributes at all (a pure exception prompt) still
      // has value, but a small, fixed one.
      if (attrs.length === 0) gain = 0.5;
      else gain /= Math.sqrt(attrs.length); // breadth helps, padding does not
      gain *= q.priority ?? 1;
      if (!sectionsUsed.has(q.section)) gain += 0.6;

      if (gain > bestGain) {
        bestGain = gain;
        best = q;
      }
    }

    if (!best || bestGain < MIN_GAIN) break;
    chosen.push(best);
    sectionsUsed.add(best.section);
    pool.splice(pool.indexOf(best), 1);
    for (const k of questionAttributes(best)) cover[k] = Math.min(1, (cover[k] ?? 0) + 0.85);
  }

  return chosen;
}

// ── Answers ─────────────────────────────────────────────────────────────────

export interface QuizAnswer {
  questionId: string;
  response: ResponseKey;
  /** Chip ids picked on "Depends". Ignored for other responses. */
  chips?: string[];
  /** Epoch ms — supplied by the caller. This module never reads the clock. */
  at: number;
}

/**
 * The full record of one answer: what was asked, in which version of the bank,
 * what was answered, what it was priced at, what it moved, and when. This is
 * what makes a DNA line explainable and a correction possible.
 */
export interface AnswerProvenance {
  questionId: string;
  bankVersion: string;
  section: SectionKey;
  questionType: QuestionType;
  prompt: string;
  response: ResponseKey;
  responseWeight: number;
  chips: string[];
  conditions: string[];
  attributes: Array<{ key: string; polarity: -1 | 1; weight: number }>;
  source: EvidenceSource;
  at: number;
  confidence: number;
  durability: Claim['durability'];
  hardExclusion: boolean;
  claimIds: string[];
  /** 0 for the first answer to this question, 1 for the first correction, … */
  revision: number;
}

export interface ClaimOptions {
  bank?: readonly QuizQuestion[];
  source?: EvidenceSource;
  bankVersion?: string;
}

/**
 * The attributes an answer moves, already in their final polarity.
 *
 * "Not me" on a tradeoff credits the *other pole* — a question's `no` is
 * written the way it is meant, so it is used verbatim rather than negated. Only
 * a question without an explicit opposite gets its `yes` flipped.
 */
function targetsFor(q: QuizQuestion, response: ResponseKey, chips: QuizChip[]): AttrTarget[] {
  const base = response === 'not_me'
    ? (q.no ?? q.yes.map((t) => ({ ...t, polarity: (t.polarity === 1 ? -1 : 1) as -1 | 1 })))
    : q.yes;

  const merged = new Map<string, AttrTarget>();
  for (const t of base) merged.set(t.key, t);
  // Chip targets are the user's own narrowing, so they win on collision.
  for (const c of chips) for (const t of c.targets ?? []) merged.set(t.key, t);
  return Array.from(merged.values());
}

function conditionFor(chips: QuizChip[]): Condition | null {
  const real = chips.filter((c) => !c.hardExclusion);
  if (real.length === 0) return null;
  const first = real[0];
  if (!first) return null;
  return {
    text: real.map((c) => c.condition).join(' and '),
    attributes: real.flatMap((c) => (c.targets ?? []).map((t) => t.key)),
    mode: first.mode ?? 'requires',
  };
}

/** Stable per question+attribute, so re-answering a question replaces its claims. */
export function claimId(questionId: string, attributeKey: string): string {
  return `quiz:${questionId}:${attributeKey}`;
}

/**
 * Turn answers into claims.
 *
 * Later answers to the same question win — the claim ids are stable, so a
 * correction genuinely replaces the belief rather than stacking a second one
 * next to it. The provenance list keeps every revision.
 */
export function answersToClaims(answers: readonly QuizAnswer[], opts: ClaimOptions = {}): Claim[] {
  const bank = opts.bank ?? QUESTION_BANK;
  const byId = bank === QUESTION_BANK ? BY_ID : new Map(bank.map((q) => [q.id, q]));
  const source: EvidenceSource = opts.source ?? 'quiz';

  const out = new Map<string, Claim>();

  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const rv = RESPONSE_VALUES[a.response];
    if (!rv) continue;

    const chips = a.response === 'depends'
      ? (q.chips ?? []).filter((c) => (a.chips ?? []).includes(c.id))
      : [];
    const hardExclusion = chips.some((c) => c.hardExclusion);
    const condition = conditionFor(chips);
    const targets = targetsFor(q, a.response, chips);

    for (const t of targets) {
      const share = t.weight ?? 1;
      // A hard exclusion is the user drawing a line, so it lands at full force
      // regardless of how the underlying response was priced.
      const magnitude = hardExclusion ? 1 : Math.abs(rv.value) * share;
      if (magnitude <= 0) continue;

      const claim: Claim = {
        id: claimId(q.id, t.key),
        attribute: t.key,
        polarity: t.polarity,
        strength: Math.min(1, magnitude),
        confidence: rv.confidence,
        durability: 'durable',
        scope: rv.scope,
        source,
        // Not a transcript, so the honest "quote" is the statement they
        // answered plus the answer they gave. Never invented.
        quote: `${q.prompt} — ${rv.label}`,
        at: a.at,
      };
      if (condition && rv.scope === 'conditional') claim.condition = condition;
      if (hardExclusion) claim.hardExclusion = true;
      out.set(claim.id, claim);
    }
  }

  return Array.from(out.values());
}

/** The provenance rows for a set of answers, in answer order, with revisions. */
export function provenanceFor(answers: readonly QuizAnswer[], opts: ClaimOptions = {}): AnswerProvenance[] {
  const bank = opts.bank ?? QUESTION_BANK;
  const byId = bank === QUESTION_BANK ? BY_ID : new Map(bank.map((q) => [q.id, q]));
  const source: EvidenceSource = opts.source ?? 'quiz';
  const bankVersion = opts.bankVersion ?? BANK_VERSION;

  const seen = new Map<string, number>();
  const rows: AnswerProvenance[] = [];

  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const rv = RESPONSE_VALUES[a.response];
    if (!rv) continue;

    const chips = a.response === 'depends'
      ? (q.chips ?? []).filter((c) => (a.chips ?? []).includes(c.id))
      : [];
    const hardExclusion = chips.some((c) => c.hardExclusion);
    const targets = targetsFor(q, a.response, chips);

    const revision = seen.get(q.id) ?? 0;
    seen.set(q.id, revision + 1);

    rows.push({
      questionId: q.id,
      bankVersion,
      section: q.section,
      questionType: q.type,
      prompt: q.prompt,
      response: a.response,
      responseWeight: rv.value,
      chips: chips.map((c) => c.id),
      conditions: chips.map((c) => c.condition),
      attributes: targets.map((t) => ({
        key: t.key,
        polarity: t.polarity,
        weight: hardExclusion ? 1 : Math.abs(rv.value) * (t.weight ?? 1),
      })),
      source,
      at: a.at,
      confidence: rv.confidence,
      durability: 'durable',
      hardExclusion,
      claimIds: targets.map((t) => claimId(q.id, t.key)),
      revision,
    });
  }

  return rows;
}

/** Attribute keys the user has drawn a hard line under. */
export function hardExclusions(claims: readonly Claim[]): string[] {
  return Array.from(new Set(claims.filter((c) => c.hardExclusion && c.attribute).map((c) => c.attribute!)));
}

// ── Coverage and confidence ─────────────────────────────────────────────────

export type DnaLabel = 'Starting' | 'Developing' | 'Strong' | 'Highly Calibrated';

export interface DnaState {
  /** 0..1 — how much of the person we have asked about. */
  coverage: number;
  /** 0..1 — how firmly we hold what we were told. */
  confidence: number;
  label: DnaLabel;
  /** How many distinct questions have been answered. */
  answered: number;
  /** Sections with at least one answer. */
  sectionsCovered: number;
  sectionsTotal: number;
  /** A sentence that cannot be read as accuracy. */
  summary: string;
}

/** Answers below this and nothing is called better than Developing. */
export const STRONG_MIN_ANSWERS = 10;
/** Answers below this and nothing is ever called Highly Calibrated. */
export const CALIBRATED_MIN_ANSWERS = 24;

/**
 * Coverage and confidence, kept separate on purpose.
 *
 * Coverage is breadth: how many of the seven sections and how many distinct
 * attributes we have touched. Confidence is firmness: how decisive the answers
 * were, discounted for "Depends" — a profile made entirely of "it depends" is
 * broad and weakly held, and should read that way.
 *
 * The label takes the *lower* of the two and is additionally gated on volume,
 * so twelve emphatic answers in one section can never read as a finished
 * profile.
 */
export function dnaState(answers: readonly QuizAnswer[], opts: ClaimOptions = {}): DnaState {
  const bank = opts.bank ?? QUESTION_BANK;
  const byId = bank === QUESTION_BANK ? BY_ID : new Map(bank.map((q) => [q.id, q]));

  // Latest answer per question — a correction is not a second data point.
  const latest = new Map<string, QuizAnswer>();
  for (const a of answers) if (byId.has(a.questionId)) latest.set(a.questionId, a);

  const live = Array.from(latest.values());
  const answered = live.length;

  const sections = new Set<SectionKey>();
  const attrs = new Set<string>();
  let confidenceSum = 0;

  for (const a of live) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    sections.add(q.section);
    for (const k of questionAttributes(q)) attrs.add(k);
    const rv = RESPONSE_VALUES[a.response];
    // "Depends" is a real answer, but it constrains less than the others.
    confidenceSum += rv ? rv.confidence * (rv.scope === 'conditional' ? 0.6 : 1) : 0;
  }

  const sectionsTotal = new Set(bank.map((q) => q.section)).size;
  const attrTotal = new Set(bank.flatMap((q) => questionAttributes(q))).size;

  const sectionBreadth = sectionsTotal > 0 ? sections.size / sectionsTotal : 0;
  const attrBreadth = attrTotal > 0 ? Math.min(1, attrs.size / attrTotal) : 0;
  const volume = Math.min(1, answered / CALIBRATED_MIN_ANSWERS);
  const coverage = clamp01(0.4 * sectionBreadth + 0.35 * attrBreadth + 0.25 * volume);

  const confidence = answered === 0 ? 0 : clamp01((confidenceSum / answered) * Math.min(1, answered / STRONG_MIN_ANSWERS));

  return {
    coverage,
    confidence,
    label: dnaLabel(coverage, confidence, answered),
    answered,
    sectionsCovered: sections.size,
    sectionsTotal,
    summary: dnaSummary(coverage, answered, sections.size, sectionsTotal),
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * The label. Conservative by construction: the lower of the two numbers
 * decides, and volume gates the top two tiers, so a short quiz cannot describe
 * itself as a finished profile.
 */
export function dnaLabel(coverage: number, confidence: number, answered: number): DnaLabel {
  const floor = Math.min(coverage, confidence);
  if (floor >= 0.8 && answered >= CALIBRATED_MIN_ANSWERS) return 'Highly Calibrated';
  if (floor >= 0.55 && answered >= STRONG_MIN_ANSWERS) return 'Strong';
  if (floor >= 0.25) return 'Developing';
  return 'Starting';
}

function dnaSummary(coverage: number, answered: number, sections: number, sectionsTotal: number): string {
  if (answered === 0) return 'Nothing yet — answer a few questions and this fills in.';
  return (
    `${Math.round(coverage * 100)}% covered — ${answered} answer${answered === 1 ? '' : 's'} across ` +
    `${sections} of ${sectionsTotal} areas. This is how much of you I have asked about, not how accurate my picks will be.`
  );
}

/** Sections still untouched, so the UI can say what a longer quiz would add. */
export function missingSections(answers: readonly QuizAnswer[], bank: readonly QuizQuestion[] = QUESTION_BANK): Section[] {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const done = new Set<SectionKey>();
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (q) done.add(q.section);
  }
  return SECTIONS.filter((s) => !done.has(s.key) && bank.some((q) => q.section === s.key));
}
