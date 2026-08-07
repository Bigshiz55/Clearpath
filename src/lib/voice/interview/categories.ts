/**
 * CATEGORY METADATA + THE SUBJECT LEXICON.
 *
 * Two pure tables the whole interview leans on:
 *
 *  1. `CATEGORY_META` — a label, a one-line `intent` (what the interviewer is
 *     trying to learn, so the model can phrase a natural question), and a
 *     `weight` for every one of the 36 taste axes. Core axes (genres, pacing,
 *     mood, the tolerances, complexity, emotional intensity, themes) weigh ~3x
 *     the niche ones (musicals, holiday, sports, westerns, black-and-white) so a
 *     high overall-confidence score is only reachable by covering the axes that
 *     actually define a viewer — never by over-nailing a niche.
 *
 *  2. The lexicon — a curated map of ~90 well-known titles, genres, elements and
 *     people to the axes each one informs, plus `categoriesFor(subject, kind)`
 *     which resolves a spoken subject to its axes (and `[]` when unknown). This
 *     is what lets the contradiction engine know that "The Silence of the Lambs"
 *     touches `horrorTolerance`, so loving it clashes with hating horror.
 *
 * Everything here is pure data + string math. No I/O, no clock, no LLM.
 */
import type { CategoryMeta, TasteCategory, SignalKind } from './types';
import { TASTE_CATEGORIES } from './types';

/** Weight of a core defining axis in the overall roll-up. */
export const WEIGHT_CORE = 3;
/** Weight of a standard axis. */
export const WEIGHT_MID = 1.5;
/** Weight of a niche axis — present, but never enough on its own to finish. */
export const WEIGHT_NICHE = 0.6;

export const CATEGORY_META: Record<TasteCategory, CategoryMeta> = {
  genres: {
    category: 'genres',
    label: 'Genres',
    intent: 'Which genres they gravitate to and which they steer clear of.',
    weight: WEIGHT_CORE,
  },
  themes: {
    category: 'themes',
    label: 'Themes',
    intent: 'The recurring ideas that pull them in — revenge, family, redemption.',
    weight: WEIGHT_CORE,
  },
  pacing: {
    category: 'pacing',
    label: 'Pacing',
    intent: 'Slow burn that earns it, or something that moves from frame one.',
    weight: WEIGHT_CORE,
  },
  violenceTolerance: {
    category: 'violenceTolerance',
    label: 'Violence tolerance',
    intent: 'How much on-screen brutality they can sit with before it puts them off.',
    weight: WEIGHT_CORE,
  },
  comedyTolerance: {
    category: 'comedyTolerance',
    label: 'Comedy taste',
    intent: 'What makes them laugh — dry and dark, or broad and warm.',
    weight: WEIGHT_CORE,
  },
  horrorTolerance: {
    category: 'horrorTolerance',
    label: 'Horror tolerance',
    intent: 'Whether dread and scares are a draw or a hard no.',
    weight: WEIGHT_CORE,
  },
  complexity: {
    category: 'complexity',
    label: 'Complexity',
    intent: 'Do they want to be made to think, or to switch the brain off.',
    weight: WEIGHT_CORE,
  },
  emotionalIntensity: {
    category: 'emotionalIntensity',
    label: 'Emotional intensity',
    intent: 'How hard they like to be hit in the feelings.',
    weight: WEIGHT_CORE,
  },
  mood: {
    category: 'mood',
    label: 'Mood',
    intent: 'The overall tone they reach for — bleak, cosy, tense, uplifting.',
    weight: WEIGHT_CORE,
  },

  subtitles: {
    category: 'subtitles',
    label: 'Subtitles',
    intent: 'Whether reading a film is fine or a dealbreaker.',
    weight: WEIGHT_MID,
  },
  foreignFilms: {
    category: 'foreignFilms',
    label: 'Foreign films',
    intent: 'Openness to cinema from outside their own language.',
    weight: WEIGHT_MID,
  },
  actors: {
    category: 'actors',
    label: 'Actors',
    intent: 'Faces they will follow into anything.',
    weight: WEIGHT_MID,
  },
  directors: {
    category: 'directors',
    label: 'Directors',
    intent: 'Film-makers whose name alone is a reason to watch.',
    weight: WEIGHT_MID,
  },
  timePeriods: {
    category: 'timePeriods',
    label: 'Time periods',
    intent: 'Do they lean modern, or love a period piece.',
    weight: WEIGHT_MID,
  },
  animation: {
    category: 'animation',
    label: 'Animation',
    intent: 'Whether animation is for them or written off as kids-only.',
    weight: WEIGHT_MID,
  },
  tvVsMovies: {
    category: 'tvVsMovies',
    label: 'TV vs. movies',
    intent: 'A long series to live in, or a tight two hours.',
    weight: WEIGHT_MID,
  },
  documentaries: {
    category: 'documentaries',
    label: 'Documentaries',
    intent: 'Appetite for the real over the invented.',
    weight: WEIGHT_MID,
  },
  twistEndings: {
    category: 'twistEndings',
    label: 'Twist endings',
    intent: 'Do they live for the rug-pull, or find it cheap.',
    weight: WEIGHT_MID,
  },
  darkEndings: {
    category: 'darkEndings',
    label: 'Dark endings',
    intent: 'Can a film leave them in the dark, or do they need a way out.',
    weight: WEIGHT_MID,
  },
  feelGood: {
    category: 'feelGood',
    label: 'Feel-good',
    intent: 'How much they reach for warmth and a soft landing.',
    weight: WEIGHT_MID,
  },
  rewatchability: {
    category: 'rewatchability',
    label: 'Rewatchability',
    intent: 'Comfort rewatches, or always something new.',
    weight: WEIGHT_MID,
  },
  mystery: {
    category: 'mystery',
    label: 'Mystery',
    intent: 'The pull of a puzzle and a question that needs answering.',
    weight: WEIGHT_MID,
  },
  psychologicalThrillers: {
    category: 'psychologicalThrillers',
    label: 'Psychological thrillers',
    intent: 'Taste for tension that lives in the mind, not the chase.',
    weight: WEIGHT_MID,
  },
  crime: {
    category: 'crime',
    label: 'Crime',
    intent: 'Heists, detectives, mob sagas, serial killers — which corner.',
    weight: WEIGHT_MID,
  },
  trueStory: {
    category: 'trueStory',
    label: 'True story',
    intent: 'Whether "based on real events" is a draw.',
    weight: WEIGHT_MID,
  },
  sciFi: {
    category: 'sciFi',
    label: 'Science fiction',
    intent: 'Hard ideas and space, or written off as too out-there.',
    weight: WEIGHT_MID,
  },
  fantasy: {
    category: 'fantasy',
    label: 'Fantasy',
    intent: 'Openness to dragons, magic and invented worlds.',
    weight: WEIGHT_MID,
  },
  romance: {
    category: 'romance',
    label: 'Romance',
    intent: 'How much they welcome a love story at the centre.',
    weight: WEIGHT_MID,
  },
  family: {
    category: 'family',
    label: 'Family',
    intent: 'Whether they watch with kids or want the opposite.',
    weight: WEIGHT_MID,
  },
  war: {
    category: 'war',
    label: 'War',
    intent: 'Appetite for the battlefield and its cost.',
    weight: WEIGHT_MID,
  },
  superheroes: {
    category: 'superheroes',
    label: 'Superheroes',
    intent: 'All in on capes, or thoroughly done with them.',
    weight: WEIGHT_MID,
  },

  musicals: {
    category: 'musicals',
    label: 'Musicals',
    intent: 'Will they sit through a song, or is it an instant off.',
    weight: WEIGHT_NICHE,
  },
  holiday: {
    category: 'holiday',
    label: 'Holiday',
    intent: 'Christmas-movie warmth, or bah humbug.',
    weight: WEIGHT_NICHE,
  },
  sports: {
    category: 'sports',
    label: 'Sports',
    intent: 'Whether an underdog on the field lands for them.',
    weight: WEIGHT_NICHE,
  },
  westerns: {
    category: 'westerns',
    label: 'Westerns',
    intent: 'Any pull toward the frontier and the standoff.',
    weight: WEIGHT_NICHE,
  },
  blackAndWhite: {
    category: 'blackAndWhite',
    label: 'Black and white',
    intent: 'Will they watch monochrome, or is colour a must.',
    weight: WEIGHT_NICHE,
  },
};

/**
 * Normalise a spoken subject for lookup: lower-case, strip surrounding
 * punctuation, collapse whitespace. Deterministic and diacritic-tolerant for the
 * common cases the interview meets.
 */
export function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop a leading article so "the shining" and "shining" both resolve. */
function withoutArticle(norm: string): string {
  return norm.replace(/^(the|a|an)\s+/, '');
}

/**
 * Genres, elements and people → axes. A generic subject (a genre word, a craft
 * element, a director or actor) informs one or more axes regardless of the
 * specific title it rode in on.
 */
export const SUBJECT_LEXICON: Record<string, TasteCategory[]> = {
  // genres
  horror: ['horrorTolerance', 'genres'],
  scary: ['horrorTolerance'],
  comedy: ['comedyTolerance', 'genres'],
  comedies: ['comedyTolerance', 'genres'],
  funny: ['comedyTolerance'],
  crime: ['crime', 'genres'],
  'true crime': ['crime', 'trueStory', 'documentaries'],
  thriller: ['psychologicalThrillers', 'genres'],
  thrillers: ['psychologicalThrillers', 'genres'],
  mystery: ['mystery', 'genres'],
  mysteries: ['mystery', 'genres'],
  whodunit: ['mystery'],
  'sci-fi': ['sciFi', 'genres'],
  'science fiction': ['sciFi', 'genres'],
  scifi: ['sciFi', 'genres'],
  fantasy: ['fantasy', 'genres'],
  romance: ['romance', 'genres'],
  'rom-com': ['romance', 'comedyTolerance'],
  'romantic comedy': ['romance', 'comedyTolerance'],
  drama: ['genres', 'emotionalIntensity'],
  dramas: ['genres', 'emotionalIntensity'],
  action: ['genres', 'violenceTolerance'],
  documentary: ['documentaries', 'genres'],
  documentaries: ['documentaries', 'genres'],
  musical: ['musicals', 'genres'],
  musicals: ['musicals', 'genres'],
  western: ['westerns', 'genres'],
  westerns: ['westerns', 'genres'],
  war: ['war', 'genres'],
  'war movies': ['war', 'genres'],
  superhero: ['superheroes', 'genres'],
  superheroes: ['superheroes', 'genres'],
  'comic book': ['superheroes', 'genres'],
  animation: ['animation', 'genres'],
  animated: ['animation', 'genres'],
  anime: ['animation', 'foreignFilms', 'subtitles'],
  family: ['family', 'genres'],
  'family movies': ['family', 'genres'],
  holiday: ['holiday', 'genres'],
  christmas: ['holiday', 'genres'],
  'christmas movies': ['holiday', 'genres'],
  sports: ['sports', 'genres'],
  'sports movies': ['sports', 'genres'],
  foreign: ['foreignFilms', 'subtitles'],
  'foreign films': ['foreignFilms', 'subtitles'],
  'foreign movies': ['foreignFilms', 'subtitles'],

  // elements / craft
  'slow burn': ['pacing'],
  'slow-burn': ['pacing'],
  slow: ['pacing'],
  'fast paced': ['pacing'],
  'fast-paced': ['pacing'],
  'twist ending': ['twistEndings'],
  'twist endings': ['twistEndings'],
  twist: ['twistEndings'],
  twists: ['twistEndings'],
  'dark ending': ['darkEndings'],
  'dark endings': ['darkEndings'],
  bleak: ['darkEndings', 'mood'],
  'feel good': ['feelGood', 'mood'],
  'feel-good': ['feelGood', 'mood'],
  uplifting: ['feelGood', 'mood'],
  cosy: ['feelGood', 'mood'],
  cozy: ['feelGood', 'mood'],
  subtitles: ['subtitles', 'foreignFilms'],
  subtitled: ['subtitles', 'foreignFilms'],
  'black and white': ['blackAndWhite'],
  'black-and-white': ['blackAndWhite'],
  monochrome: ['blackAndWhite'],
  violence: ['violenceTolerance'],
  violent: ['violenceTolerance'],
  gore: ['violenceTolerance', 'horrorTolerance'],
  gory: ['violenceTolerance', 'horrorTolerance'],
  gritty: ['violenceTolerance', 'crime'],
  'mind bending': ['complexity'],
  'mind-bending': ['complexity'],
  complex: ['complexity'],
  complicated: ['complexity'],
  cerebral: ['complexity'],
  'true story': ['trueStory'],
  'based on a true story': ['trueStory'],
  revenge: ['themes'],
  redemption: ['themes'],
  dystopia: ['sciFi', 'themes'],
  dystopian: ['sciFi', 'themes'],
  supernatural: ['horrorTolerance', 'fantasy'],
  period: ['timePeriods'],
  'period piece': ['timePeriods'],
  rewatch: ['rewatchability'],
  rewatchable: ['rewatchability'],

  // people — directors
  'denis villeneuve': ['directors', 'sciFi', 'psychologicalThrillers'],
  'christopher nolan': ['directors', 'complexity', 'sciFi'],
  'quentin tarantino': ['directors', 'violenceTolerance', 'crime'],
  'martin scorsese': ['directors', 'crime', 'violenceTolerance'],
  'alfred hitchcock': ['directors', 'mystery', 'psychologicalThrillers'],
  'steven spielberg': ['directors'],
  'greta gerwig': ['directors', 'comedyTolerance'],
  'jordan peele': ['directors', 'horrorTolerance', 'psychologicalThrillers'],
  'ari aster': ['directors', 'horrorTolerance'],
  'wes anderson': ['directors', 'comedyTolerance'],
  'david fincher': ['directors', 'crime', 'psychologicalThrillers'],
  'stanley kubrick': ['directors', 'complexity'],
  'bong joon-ho': ['directors', 'foreignFilms', 'subtitles'],
  'hayao miyazaki': ['directors', 'animation', 'foreignFilms'],
  'the coen brothers': ['directors', 'crime', 'comedyTolerance'],
  // people — actors
  'tom hardy': ['actors'],
  'tom hanks': ['actors'],
  'meryl streep': ['actors'],
  'leonardo dicaprio': ['actors'],
  'denzel washington': ['actors'],
  'anthony hopkins': ['actors'],
  'jodie foster': ['actors'],
  'daniel day-lewis': ['actors'],
  'cate blanchett': ['actors'],
};

/**
 * Titles → axes. Kept separate from the generic lexicon so an ambiguous word
 * like "it" resolves to the horror film only when the signal kind says it is a
 * title. Real, widely-known films and shows only.
 */
export const TITLE_LEXICON: Record<string, TasteCategory[]> = {
  'the silence of the lambs': ['horrorTolerance', 'crime', 'psychologicalThrillers', 'mystery'],
  prisoners: ['crime', 'mystery', 'psychologicalThrillers', 'emotionalIntensity'],
  parasite: ['foreignFilms', 'subtitles', 'psychologicalThrillers', 'mystery'],
  'get out': ['horrorTolerance', 'psychologicalThrillers'],
  hereditary: ['horrorTolerance', 'emotionalIntensity'],
  midsommar: ['horrorTolerance', 'emotionalIntensity'],
  'the conjuring': ['horrorTolerance'],
  'the shining': ['horrorTolerance', 'psychologicalThrillers'],
  'the exorcist': ['horrorTolerance'],
  it: ['horrorTolerance'],
  'a nightmare on elm street': ['horrorTolerance'],
  seven: ['crime', 'psychologicalThrillers', 'darkEndings'],
  'se7en': ['crime', 'psychologicalThrillers', 'darkEndings'],
  'gone girl': ['crime', 'psychologicalThrillers', 'twistEndings'],
  'zodiac': ['crime', 'mystery', 'psychologicalThrillers'],
  inception: ['sciFi', 'complexity', 'twistEndings'],
  interstellar: ['sciFi', 'complexity', 'emotionalIntensity'],
  arrival: ['sciFi', 'complexity', 'emotionalIntensity'],
  'blade runner': ['sciFi', 'complexity'],
  dune: ['sciFi', 'fantasy'],
  'the matrix': ['sciFi', 'complexity'],
  'the dark knight': ['superheroes', 'crime'],
  'pulp fiction': ['crime', 'violenceTolerance'],
  goodfellas: ['crime', 'violenceTolerance'],
  'the godfather': ['crime'],
  'fight club': ['psychologicalThrillers', 'twistEndings'],
  'no country for old men': ['crime', 'violenceTolerance', 'westerns'],
  'there will be blood': ['darkEndings', 'emotionalIntensity'],
  'breaking bad': ['crime', 'tvVsMovies'],
  'the sopranos': ['crime', 'tvVsMovies'],
  'true detective': ['crime', 'mystery', 'psychologicalThrillers', 'tvVsMovies'],
  mindhunter: ['crime', 'psychologicalThrillers', 'tvVsMovies'],
  'the wire': ['crime', 'tvVsMovies'],
  severance: ['sciFi', 'psychologicalThrillers', 'tvVsMovies'],
  'the notebook': ['romance', 'feelGood'],
  'la la land': ['musicals', 'romance'],
  'love actually': ['romance', 'holiday', 'feelGood'],
  titanic: ['romance', 'emotionalIntensity'],
  'die hard': ['violenceTolerance', 'holiday'],
  'toy story': ['animation', 'family', 'feelGood'],
  'spirited away': ['animation', 'foreignFilms', 'subtitles', 'fantasy'],
  'the lord of the rings': ['fantasy'],
  'game of thrones': ['fantasy', 'tvVsMovies', 'violenceTolerance'],
  "schindler's list": ['war', 'trueStory', 'emotionalIntensity', 'darkEndings'],
  'saving private ryan': ['war', 'violenceTolerance', 'trueStory'],
  '1917': ['war'],
  oppenheimer: ['trueStory', 'complexity', 'timePeriods'],
  'the office': ['comedyTolerance', 'tvVsMovies', 'feelGood'],
  superbad: ['comedyTolerance'],
  bridesmaids: ['comedyTolerance'],
  'knives out': ['mystery', 'comedyTolerance'],
  chinatown: ['mystery', 'crime', 'timePeriods'],
  casablanca: ['romance', 'blackAndWhite', 'timePeriods'],
};

/**
 * Resolve a spoken subject to the taste axes it informs. Titles are preferred
 * when the signal kind is `title` (so "it" is the film, not the pronoun);
 * everything else consults the generic lexicon first. Unknown subjects return
 * `[]` — the caller never guesses.
 */
export function categoriesFor(subject: string, kind: SignalKind): TasteCategory[] {
  const norm = normalizeSubject(subject);
  if (!norm) return [];
  const bare = withoutArticle(norm);

  const title = TITLE_LEXICON[norm] ?? TITLE_LEXICON[bare];
  const generic = SUBJECT_LEXICON[norm] ?? SUBJECT_LEXICON[bare];

  // Only a title-kind signal may resolve to the title lexicon, so an ambiguous
  // common word ("it") is the horror film only when the model says it is a title.
  const primary = kind === 'title' ? title ?? generic : generic;
  return primary ? [...primary] : [];
}

/**
 * The public lexicon view used by tests and the contradiction engine: the union
 * of both maps. Read-only.
 */
export const categoryLexicon: Readonly<Record<string, readonly TasteCategory[]>> = {
  ...SUBJECT_LEXICON,
  ...TITLE_LEXICON,
};

/** Axes that describe a hard presentational attribute (drive `attribute_conflict`). */
export const ATTRIBUTE_CATEGORIES: readonly TasteCategory[] = ['subtitles', 'blackAndWhite'];

/** Every category, in the canonical order — re-exported for iteration. */
export { TASTE_CATEGORIES };
