/**
 * THE RAPID-FIRE QUESTION BANK — Stages 1 through 4.
 *
 * The shape of the interview is the product. It is deliberately NOT "tell me
 * about movies you like": an open prompt gets a vague answer, and a vague
 * answer is a recommendation engine's worst input. Instead the interview opens
 * with a grouped, scored question that anyone can answer in three seconds, and
 * spends its remaining turns on whatever those scores revealed.
 *
 *   STAGE 1 — GENRE PULSE. Three genres at a time, 1–10 each. Broad, fast, and
 *             it produces the numbers every later stage depends on.
 *   STAGE 2 — DRILL-DOWN. Only into genres they actually rated highly. A
 *             drill-down on a genre someone scored 2 is a question whose answer
 *             was already given; asking it burns the user's patience and
 *             teaches us nothing.
 *   STAGE 3 — WATCHING STYLE. Hard preferences (subtitles, slow burns,
 *             black-and-white, endings) that gate titles regardless of genre.
 *   STAGE 4 — TITLE ANCHORS, LAST. A named title is the highest-value signal
 *             in the interview, but only once the axes exist to interpret it
 *             against — "I loved Prisoners" means something different from
 *             someone who scored crime 10 than from someone who scored it 2.
 *             Asking for titles first throws that context away.
 *
 * Every item carries the `TasteCategory` axes it informs, so answers flow into
 * the SAME confidence model and the SAME `preference_events` bridge the rest of
 * WatchVerd1ct uses. There is no parallel taste model here — only a different
 * way of collecting evidence for the existing one.
 *
 * PURE DATA. No I/O, no clock, no randomness.
 */
import type { TasteCategory } from '../types';

export type Stage = 1 | 2 | 3 | 4;

/** One scored item inside a grouped question. */
export interface ScaleItem {
  /** Canonical key — also the drill-down gate key for stage 1 genres. */
  key: string;
  /** How the interviewer says it. */
  label: string;
  /** Ways the user might name it back, for label-anchored parsing. */
  aliases: string[];
  /** The taste axes a score on this item informs. */
  categories: TasteCategory[];
}

interface BaseQuestion {
  id: string;
  stage: Stage;
  /** The spoken prompt. Short — this is a rapid-fire interview. */
  prompt: string;
}

export interface ScaleQuestion extends BaseQuestion {
  kind: 'scale';
  items: ScaleItem[];
  /** Stage 2 only: the stage-1 genre key that must score well to earn this. */
  gatedByGenre?: string;
}

export interface AnchorQuestion extends BaseQuestion {
  kind: 'anchor';
  /** Whether we are asking for something they loved or something they bailed on. */
  polarity: 'positive' | 'negative';
}

export type ScriptQuestion = ScaleQuestion | AnchorQuestion;

/**
 * A genre must score at least this to earn a drill-down. Set at 7 because that
 * is where "I'd actively choose this" starts; 5–6 is tolerance, not appetite,
 * and drilling tolerance produces polite noise.
 */
export const DRILL_THRESHOLD = 7;

/** At most this many drill-downs, so a broad-taste user is not interrogated. */
export const MAX_DRILL_DOWNS = 3;

/** A normal interview must reach at least this many meaningful user turns. */
export const MIN_MEANINGFUL_TURNS = 8;

// ── STAGE 1 — genre pulse ──────────────────────────────────────────────────

export const STAGE1_QUESTIONS: ScaleQuestion[] = [
  {
    id: 's1-a',
    stage: 1,
    kind: 'scale',
    prompt: 'Quick gut check, one to ten each — crime, comedy, sci-fi.',
    items: [
      { key: 'crime', label: 'crime', aliases: ['crime'], categories: ['crime'] },
      { key: 'comedy', label: 'comedy', aliases: ['comedy', 'comedies'], categories: ['comedyTolerance'] },
      { key: 'scifi', label: 'sci-fi', aliases: ['sci-fi', 'scifi', 'science fiction'], categories: ['sciFi'] },
    ],
  },
  {
    id: 's1-b',
    stage: 1,
    kind: 'scale',
    prompt: 'Same again — horror, romance, documentaries.',
    items: [
      { key: 'horror', label: 'horror', aliases: ['horror'], categories: ['horrorTolerance'] },
      { key: 'romance', label: 'romance', aliases: ['romance', 'romantic'], categories: ['romance'] },
      { key: 'documentary', label: 'documentaries', aliases: ['documentary', 'documentaries', 'docs'], categories: ['documentaries'] },
    ],
  },
  {
    id: 's1-c',
    stage: 1,
    kind: 'scale',
    prompt: 'Last three — fantasy, war stories, animation.',
    items: [
      { key: 'fantasy', label: 'fantasy', aliases: ['fantasy'], categories: ['fantasy'] },
      { key: 'war', label: 'war stories', aliases: ['war', 'war stories'], categories: ['war'] },
      { key: 'animation', label: 'animation', aliases: ['animation', 'animated', 'anime'], categories: ['animation'] },
    ],
  },
];

// ── STAGE 2 — drill-downs, one per high-scoring genre ──────────────────────

export const STAGE2_QUESTIONS: ScaleQuestion[] = [
  {
    id: 's2-crime',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'crime',
    prompt: 'Crime scored high — serial killers, heists, courtroom?',
    items: [
      { key: 'serial-killers', label: 'serial killers', aliases: ['serial killers', 'serial killer', 'killers'], categories: ['crime', 'psychologicalThrillers'] },
      { key: 'heists', label: 'heists', aliases: ['heists', 'heist'], categories: ['crime'] },
      { key: 'courtroom', label: 'courtroom', aliases: ['courtroom', 'court', 'legal'], categories: ['crime', 'themes'] },
    ],
  },
  {
    id: 's2-comedy',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'comedy',
    prompt: 'Comedy scored high — dark comedy, rom-com, satire?',
    items: [
      { key: 'dark-comedy', label: 'dark comedy', aliases: ['dark comedy', 'dark'], categories: ['comedyTolerance', 'darkEndings'] },
      { key: 'romcom', label: 'rom-com', aliases: ['rom-com', 'romcom', 'romantic comedy'], categories: ['comedyTolerance', 'romance'] },
      { key: 'satire', label: 'satire', aliases: ['satire', 'satirical'], categories: ['comedyTolerance', 'complexity'] },
    ],
  },
  {
    id: 's2-scifi',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'scifi',
    prompt: 'Sci-fi scored high — space opera, dystopia, time travel?',
    items: [
      { key: 'space-opera', label: 'space opera', aliases: ['space opera', 'space'], categories: ['sciFi'] },
      { key: 'dystopia', label: 'dystopia', aliases: ['dystopia', 'dystopian'], categories: ['sciFi', 'themes'] },
      { key: 'time-travel', label: 'time travel', aliases: ['time travel'], categories: ['sciFi', 'complexity'] },
    ],
  },
  {
    id: 's2-horror',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'horror',
    prompt: 'Horror scored high — supernatural, slasher, psychological?',
    items: [
      { key: 'supernatural', label: 'supernatural', aliases: ['supernatural', 'ghost'], categories: ['horrorTolerance', 'fantasy'] },
      { key: 'slasher', label: 'slasher', aliases: ['slasher'], categories: ['horrorTolerance', 'violenceTolerance'] },
      { key: 'psychological-horror', label: 'psychological', aliases: ['psychological'], categories: ['horrorTolerance', 'psychologicalThrillers'] },
    ],
  },
  {
    id: 's2-romance',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'romance',
    prompt: 'Romance scored high — period romance, modern rom-com, tragic?',
    items: [
      { key: 'period-romance', label: 'period romance', aliases: ['period romance', 'period'], categories: ['romance', 'timePeriods'] },
      { key: 'modern-romcom', label: 'modern rom-com', aliases: ['modern rom-com', 'modern romcom', 'rom-com'], categories: ['romance', 'comedyTolerance'] },
      { key: 'tragic-romance', label: 'tragic romance', aliases: ['tragic', 'tragedy'], categories: ['romance', 'darkEndings'] },
    ],
  },
  {
    id: 's2-documentary',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'documentary',
    prompt: 'Docs scored high — true crime, nature, music?',
    items: [
      { key: 'true-crime-doc', label: 'true crime', aliases: ['true crime'], categories: ['documentaries', 'crime', 'trueStory'] },
      { key: 'nature-doc', label: 'nature', aliases: ['nature', 'wildlife'], categories: ['documentaries'] },
      { key: 'music-doc', label: 'music', aliases: ['music'], categories: ['documentaries'] },
    ],
  },
  {
    id: 's2-fantasy',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'fantasy',
    prompt: 'Fantasy scored high — epic, urban fantasy, fairy tale?',
    items: [
      { key: 'epic-fantasy', label: 'epic fantasy', aliases: ['epic'], categories: ['fantasy'] },
      { key: 'urban-fantasy', label: 'urban fantasy', aliases: ['urban'], categories: ['fantasy'] },
      { key: 'fairy-tale', label: 'fairy tale', aliases: ['fairy tale', 'fairytale'], categories: ['fantasy', 'family'] },
    ],
  },
  {
    id: 's2-war',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'war',
    prompt: 'War scored high — World War Two, modern conflict, war drama?',
    items: [
      { key: 'wwii', label: 'World War Two', aliases: ['world war two', 'wwii', 'ww2'], categories: ['war', 'timePeriods'] },
      { key: 'modern-conflict', label: 'modern conflict', aliases: ['modern conflict', 'modern'], categories: ['war'] },
      { key: 'war-drama', label: 'war drama', aliases: ['war drama', 'drama'], categories: ['war', 'emotionalIntensity'] },
    ],
  },
  {
    id: 's2-animation',
    stage: 2,
    kind: 'scale',
    gatedByGenre: 'animation',
    prompt: 'Animation scored high — anime, family animation, adult animation?',
    items: [
      { key: 'anime', label: 'anime', aliases: ['anime'], categories: ['animation', 'foreignFilms'] },
      { key: 'family-animation', label: 'family animation', aliases: ['family animation', 'family'], categories: ['animation', 'family'] },
      { key: 'adult-animation', label: 'adult animation', aliases: ['adult animation', 'adult'], categories: ['animation', 'comedyTolerance'] },
    ],
  },
];

// ── STAGE 3 — watching style / hard preferences ────────────────────────────

export const STAGE3_QUESTIONS: ScaleQuestion[] = [
  {
    id: 's3-a',
    stage: 3,
    kind: 'scale',
    prompt: 'How you watch, one to ten — subtitles, slow burns, black-and-white.',
    items: [
      { key: 'subtitles', label: 'subtitles', aliases: ['subtitles', 'subs', 'subtitled'], categories: ['subtitles', 'foreignFilms'] },
      { key: 'slow-burn', label: 'slow burns', aliases: ['slow burns', 'slow burn', 'slow'], categories: ['pacing'] },
      { key: 'black-and-white', label: 'black-and-white', aliases: ['black-and-white', 'black and white', 'monochrome'], categories: ['blackAndWhite'] },
    ],
  },
  {
    id: 's3-b',
    stage: 3,
    kind: 'scale',
    prompt: 'Endings — twists, bleak endings, feel-good.',
    items: [
      { key: 'twists', label: 'twists', aliases: ['twists', 'twist', 'twist endings'], categories: ['twistEndings', 'complexity'] },
      { key: 'bleak-endings', label: 'bleak endings', aliases: ['bleak', 'bleak endings', 'dark endings'], categories: ['darkEndings'] },
      { key: 'feel-good', label: 'feel-good', aliases: ['feel-good', 'feel good', 'feelgood'], categories: ['feelGood'] },
    ],
  },
  {
    id: 's3-c',
    stage: 3,
    kind: 'scale',
    prompt: 'Last one — long films, series you can binge, rewatching favourites.',
    items: [
      { key: 'long-films', label: 'long films', aliases: ['long films', 'long', 'epics'], categories: ['pacing', 'complexity'] },
      { key: 'binge-series', label: 'series you can binge', aliases: ['series', 'binge', 'tv'], categories: ['tvVsMovies'] },
      { key: 'rewatching', label: 'rewatching favourites', aliases: ['rewatching', 'rewatch', 'favourites'], categories: ['rewatchability'] },
    ],
  },
];

// ── STAGE 4 — title anchors, last ──────────────────────────────────────────

export const STAGE4_QUESTIONS: AnchorQuestion[] = [
  {
    id: 's4-love',
    stage: 4,
    kind: 'anchor',
    polarity: 'positive',
    prompt: 'Now name one you genuinely loved.',
  },
  {
    id: 's4-bail',
    stage: 4,
    kind: 'anchor',
    polarity: 'negative',
    prompt: 'And one you couldn’t finish.',
  },
  {
    id: 's4-love-2',
    stage: 4,
    kind: 'anchor',
    polarity: 'positive',
    prompt: 'One more you’d recommend to anyone.',
  },
];

/** Every question, by id — for resume and for test lookups. */
export const ALL_QUESTIONS: ScriptQuestion[] = [
  ...STAGE1_QUESTIONS,
  ...STAGE2_QUESTIONS,
  ...STAGE3_QUESTIONS,
  ...STAGE4_QUESTIONS,
];

export function questionById(id: string): ScriptQuestion | null {
  return ALL_QUESTIONS.find((q) => q.id === id) ?? null;
}

/** The stage-1 genre keys, in ask order. */
export const STAGE1_GENRE_KEYS: string[] = STAGE1_QUESTIONS.flatMap((q) => q.items.map((i) => i.key));

/** The drill-down question for a genre key, if one exists. */
export function drillDownFor(genreKey: string): ScaleQuestion | null {
  return STAGE2_QUESTIONS.find((q) => q.gatedByGenre === genreKey) ?? null;
}
