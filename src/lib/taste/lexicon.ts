/**
 * The attribute vocabulary — the finite, interpretable set of things a person
 * can express a taste about, and the phrases that mean each one.
 *
 * Two rules keep this honest:
 *  1. An attribute must map to something the recommender can actually act on —
 *     a content-DNA axis, a genre, or a hard availability fact. "Good writing"
 *     is a compliment, not a filter, so it maps to nothing and is recorded as
 *     an unactionable note rather than silently becoming a dial.
 *  2. Phrases are matched longest-first, so "science fiction" never resolves as
 *     "fiction" and "not in the mood" never resolves as "mood".
 *
 * Pure data + string matching. No I/O.
 */
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';

/** A dimension target implied by *liking* an attribute (0..100 on that axis). */
export interface DimTarget {
  key: string;
  target: number;
}

/** Which part of the review this attribute belongs under. */
export type AttributeSection =
  | 'genre' | 'pacing' | 'tone' | 'story' | 'content' | 'format' | 'language';

export interface Attribute {
  key: string;
  /** Review grouping. Defaults to 'story' when unset. */
  section?: AttributeSection;
  /** Human label, used in review copy and the DNA reveal. */
  label: string;
  /** Short noun phrase that reads well inside a sentence ("slow-burn shows"). */
  phrase: string;
  /** Axes this attribute pins when the user likes it. */
  dims?: DimTarget[];
  /** Genre slugs implicated. */
  genres?: string[];
  /**
   * True when the attribute is a hard fact about availability/format rather
   * than a taste axis (subtitles, runtime). These become filters, not dials.
   */
  structural?: boolean;
  /** Phrases that mean this attribute. Lowercase; matched on word boundaries. */
  phrases: string[];
}

/**
 * The catalog. Ordered by key for readability only — matching sorts by phrase
 * length, so order here has no effect on resolution.
 */
export const ATTRIBUTES: readonly Attribute[] = [
  // ── Genres ────────────────────────────────────────────────────────────────
  {
    key: 'sci_fi',
    section: 'genre',
    label: 'Science fiction',
    phrase: 'science fiction',
    genres: ['science-fiction'],
    dims: [{ key: 'realism', target: 25 }],
    phrases: ['science fiction', 'sci-fi', 'sci fi', 'scifi', 'space opera', 'space movies', 'space shows'],
  },
  {
    key: 'horror',
    section: 'genre',
    label: 'Horror',
    phrase: 'horror',
    genres: ['horror'],
    dims: [
      { key: 'darkness', target: 85 },
      { key: 'suspense', target: 85 },
    ],
    phrases: ['horror', 'horror movies', 'horror films', 'slashers', 'slasher movies', 'scary movies'],
  },
  {
    key: 'fantasy',
    section: 'genre',
    label: 'Fantasy',
    phrase: 'fantasy',
    genres: ['fantasy'],
    dims: [{ key: 'realism', target: 15 }],
    phrases: ['fantasy', 'swords and sorcery', 'dragons', 'magic shows'],
  },
  {
    key: 'romance_genre',
    section: 'genre',
    label: 'Romance',
    phrase: 'romance',
    genres: ['romance'],
    dims: [{ key: 'romance', target: 85 }],
    phrases: ['romance', 'romances', 'rom coms', 'rom-coms', 'romantic comedies', 'love stories', 'romantic movies'],
  },
  {
    key: 'comedy',
    section: 'genre',
    label: 'Comedy',
    phrase: 'comedy',
    genres: ['comedy'],
    dims: [{ key: 'humor', target: 85 }],
    phrases: ['comedy', 'comedies', 'sitcoms', 'sitcom', 'funny stuff', 'stand-up', 'stand up'],
  },
  {
    key: 'documentary',
    section: 'genre',
    label: 'Documentaries',
    phrase: 'documentaries',
    genres: ['documentary'],
    dims: [{ key: 'realism', target: 95 }],
    phrases: ['documentary', 'documentaries', 'docs', 'docuseries', 'true crime docs'],
  },
  {
    key: 'animation',
    section: 'genre',
    label: 'Animation',
    phrase: 'animation',
    genres: ['animation'],
    dims: [{ key: 'realism', target: 20 }],
    phrases: ['animation', 'animated', 'animated movies', 'cartoons', 'anime'],
  },
  {
    key: 'reality',
    section: 'genre',
    label: 'Reality TV',
    phrase: 'reality TV',
    genres: ['reality'],
    dims: [
      { key: 'complexity', target: 20 },
      { key: 'attention', target: 15 },
    ],
    phrases: ['reality tv', 'reality shows', 'reality television', 'dating shows', 'competition shows'],
  },
  {
    key: 'musical',
    section: 'genre',
    label: 'Musicals',
    phrase: 'musicals',
    genres: ['music'],
    phrases: ['musical', 'musicals'],
  },
  {
    key: 'superhero',
    section: 'genre',
    label: 'Superhero films',
    phrase: 'superhero films',
    genres: ['action', 'science-fiction'],
    dims: [
      { key: 'stakes', target: 90 },
      { key: 'realism', target: 20 },
    ],
    phrases: ['superhero', 'superheroes', 'superhero movies', 'comic book movies', 'marvel', 'dc movies'],
  },
  {
    key: 'crime',
    section: 'genre',
    label: 'Crime',
    phrase: 'crime stories',
    genres: ['crime'],
    dims: [{ key: 'darkness', target: 70 }],
    phrases: ['crime', 'crime shows', 'crime dramas', 'true crime', 'cop shows', 'police shows', 'heist movies'],
  },
  {
    key: 'thriller',
    section: 'genre',
    label: 'Thrillers',
    phrase: 'thrillers',
    genres: ['thriller'],
    dims: [{ key: 'suspense', target: 85 }],
    phrases: ['thriller', 'thrillers', 'psychological thrillers'],
  },
  {
    key: 'war',
    section: 'genre',
    label: 'War stories',
    phrase: 'war stories',
    genres: ['war'],
    dims: [{ key: 'violence', target: 80 }],
    phrases: ['war movies', 'war films', 'war shows', 'military movies'],
  },
  {
    key: 'western',
    section: 'genre',
    label: 'Westerns',
    phrase: 'westerns',
    genres: ['western'],
    phrases: ['western', 'westerns'],
  },
  {
    key: 'sports',
    section: 'genre',
    label: 'Sports stories',
    phrase: 'sports stories',
    dims: [
      { key: 'realism', target: 80 },
      { key: 'emotion', target: 75 },
    ],
    phrases: ['sports movies', 'sports films', 'sports documentaries'],
  },
  {
    key: 'historical',
    section: 'genre',
    label: 'Period pieces',
    phrase: 'period pieces',
    genres: ['history'],
    dims: [{ key: 'realism', target: 75 }],
    phrases: ['period pieces', 'period drama', 'period dramas', 'historical dramas', 'costume dramas'],
  },

  {
    key: 'action',
    section: 'genre',
    label: 'Action',
    phrase: 'action',
    genres: ['action'],
    dims: [
      { key: 'pacing', target: 85 },
      { key: 'suspense', target: 75 },
    ],
    phrases: ['action', 'action movies', 'action films', 'shoot em up', 'car chases'],
  },
  {
    key: 'supernatural',
    section: 'content',
    label: 'Supernatural elements',
    phrase: 'supernatural stories',
    genres: ['fantasy', 'horror'],
    dims: [{ key: 'realism', target: 12 }],
    phrases: ['supernatural', 'ghosts', 'vampires', 'zombies', 'demons', 'paranormal', 'the occult'],
  },

  // ── Structural / availability facts ───────────────────────────────────────
  // Content advisories. Deliberately NO dimension mapping: "no child harm" is a
  // hard fact about a title, not a position on a taste axis, and blending it
  // into an axis would let a strong preference elsewhere outvote it.
  {
    key: 'child_harm',
    section: 'content',
    label: 'Harm to children',
    phrase: 'stories where children are hurt',
    structural: true,
    phrases: ['child harm', 'kids being hurt', 'children being hurt', 'harm to children', 'child abuse'],
  },
  {
    key: 'animal_harm',
    section: 'content',
    label: 'Harm to animals',
    phrase: 'stories where animals are hurt',
    structural: true,
    phrases: ['animal harm', 'animal cruelty', 'the dog dies', 'harm to animals', 'animals being hurt'],
  },

  {
    key: 'foreign_language',
    section: 'language',
    label: 'Foreign-language titles',
    phrase: 'foreign-language titles',
    structural: true,
    phrases: [
      'foreign language', 'foreign-language', 'foreign films', 'foreign movies', 'foreign shows',
      'non-english', 'non english', 'international titles',
    ],
  },
  {
    key: 'subtitles',
    section: 'language',
    label: 'Subtitles',
    phrase: 'subtitles',
    structural: true,
    phrases: ['subtitles', 'subtitled', 'subs', 'reading subtitles'],
  },
  {
    key: 'english_audio',
    section: 'language',
    label: 'English audio',
    phrase: 'English audio',
    structural: true,
    phrases: ['english audio', 'english dub', 'dubbed', 'dubbed in english', 'english language track', 'english track'],
  },
  {
    key: 'long_runtime',
    section: 'format',
    label: 'Very long films',
    phrase: 'very long films',
    structural: true,
    dims: [{ key: 'attention', target: 80 }],
    phrases: ['long movies', 'long films', 'three hour', 'three-hour', 'over two hours', 'really long'],
  },
  {
    key: 'many_seasons',
    section: 'format',
    label: 'Long-running series',
    phrase: 'long-running series',
    structural: true,
    phrases: ['long running', 'long-running', 'ten seasons', 'many seasons', 'shows that go on forever'],
  },
  {
    key: 'limited_series',
    section: 'format',
    label: 'Limited series',
    phrase: 'limited series',
    structural: true,
    phrases: ['limited series', 'miniseries', 'mini-series', 'one and done', 'self-contained series'],
  },
  {
    key: 'unfinished',
    section: 'format',
    label: 'Cancelled or unresolved endings',
    phrase: 'cancelled shows',
    structural: true,
    phrases: ['cancelled', 'canceled', 'cliffhanger', 'unresolved ending', 'no ending', 'never finished'],
  },

  // ── Experience axes ───────────────────────────────────────────────────────
  {
    key: 'slow_pace',
    section: 'pacing',
    label: 'Slow-burn pacing',
    phrase: 'slow-burn stories',
    dims: [{ key: 'pacing', target: 10 }],
    phrases: ['slow', 'slow burn', 'slow-burn', 'slow shows', 'slow movies', 'slow paced', 'slow-paced', 'takes its time', 'plodding', 'drags'],
  },
  {
    key: 'fast_pace',
    section: 'pacing',
    label: 'Fast pacing',
    phrase: 'fast-moving stories',
    dims: [{ key: 'pacing', target: 90 }],
    phrases: ['fast paced', 'fast-paced', 'fast moving', 'high energy', 'never lets up', 'relentless pace'],
  },
  {
    key: 'dark_tone',
    section: 'tone',
    label: 'Dark, heavy stories',
    phrase: 'dark, heavy stories',
    dims: [{ key: 'darkness', target: 90 }],
    phrases: ['dark', 'heavy', 'depressing', 'bleak', 'grim', 'dark stuff', 'heavy stuff', 'downers'],
  },
  {
    key: 'feel_good',
    section: 'tone',
    label: 'Feel-good stories',
    phrase: 'feel-good stories',
    dims: [
      { key: 'darkness', target: 15 },
      { key: 'warmth', target: 90 },
    ],
    phrases: ['feel good', 'feel-good', 'uplifting', 'wholesome', 'cozy', 'comfort watches', 'light stuff', 'lighthearted'],
  },
  {
    key: 'emotional',
    section: 'tone',
    label: 'Emotionally heavy stories',
    phrase: 'emotionally heavy stories',
    dims: [{ key: 'emotion', target: 90 }],
    phrases: ['tearjerker', 'tearjerkers', 'emotional', 'makes me cry', 'gut punch', 'sad movies', 'sad stuff'],
  },
  {
    key: 'scary',
    section: 'content',
    label: 'Frightening content',
    phrase: 'frightening content',
    dims: [
      { key: 'suspense', target: 90 },
      { key: 'darkness', target: 80 },
    ],
    phrases: ['scary', 'frightening', 'terrifying', 'jump scares', 'gives me nightmares'],
  },
  {
    key: 'tense',
    section: 'content',
    label: 'High tension',
    phrase: 'tense stories',
    dims: [{ key: 'suspense', target: 88 }],
    phrases: ['tense', 'tension', 'suspense', 'suspenseful', 'stressful', 'anxiety inducing', 'edge of my seat'],
  },
  {
    key: 'violence',
    section: 'content',
    label: 'Violence',
    phrase: 'violence',
    dims: [{ key: 'violence', target: 88 }],
    phrases: ['violence', 'violent', 'brutal', 'brutality'],
  },
  {
    key: 'gore',
    section: 'content',
    label: 'Gore',
    phrase: 'gore',
    dims: [{ key: 'violence', target: 95 }],
    phrases: ['gore', 'gory', 'blood and guts', 'graphic violence'],
  },
  {
    key: 'sex_content',
    section: 'content',
    label: 'Explicit sexual content',
    phrase: 'explicit content',
    dims: [{ key: 'romance', target: 70 }],
    phrases: ['sex scenes', 'nudity', 'explicit content', 'graphic sex'],
  },
  {
    key: 'complex_plot',
    section: 'story',
    label: 'Complicated plots',
    phrase: 'complicated plots',
    dims: [
      { key: 'complexity', target: 90 },
      { key: 'attention', target: 85 },
    ],
    phrases: ['complicated', 'complex', 'confusing', 'hard to follow', 'convoluted', 'cerebral', 'makes you think', 'thinky'],
  },
  {
    key: 'twists',
    section: 'story',
    label: 'Twists',
    phrase: 'twists',
    dims: [{ key: 'suspense', target: 80 }],
    phrases: ['twist', 'twists', 'twist endings', 'plot twists', 'mind bending', 'mind-bending'],
  },
  {
    key: 'character_driven',
    section: 'story',
    label: 'Character-driven stories',
    phrase: 'character-driven stories',
    dims: [{ key: 'character', target: 90 }],
    phrases: ['character driven', 'character-driven', 'character study', 'character studies', 'about the people'],
  },
  {
    key: 'plot_driven',
    section: 'story',
    label: 'Plot-driven stories',
    phrase: 'plot-driven stories',
    dims: [{ key: 'character', target: 12 }],
    phrases: ['plot driven', 'plot-driven', 'something happening', 'strong plot'],
  },
  {
    key: 'grounded',
    section: 'story',
    label: 'Grounded, realistic stories',
    phrase: 'grounded stories',
    dims: [{ key: 'realism', target: 90 }],
    phrases: ['realistic', 'grounded', 'believable', 'could actually happen'],
  },
  {
    key: 'true_story',
    section: 'story',
    label: 'True stories',
    phrase: 'true stories',
    dims: [{ key: 'realism', target: 95 }],
    phrases: ['true story', 'true stories', 'based on a true story', 'based on real events', 'real events'],
  },
  {
    key: 'background_friendly',
    section: 'format',
    label: 'Easy background watching',
    phrase: 'easy background watching',
    dims: [
      { key: 'attention', target: 10 },
      { key: 'complexity', target: 20 },
    ],
    phrases: ['background', 'background noise', 'half watch', 'half-watch', 'on in the background', 'easy watch', 'easy watching', 'turn my brain off'],
  },
  {
    key: 'cynical',
    section: 'tone',
    label: 'Cynical stories',
    phrase: 'cynical stories',
    dims: [{ key: 'warmth', target: 12 }],
    phrases: ['cynical', 'nihilistic', 'everyone is awful', 'mean spirited', 'mean-spirited'],
  },
  {
    key: 'morally_grey',
    section: 'tone',
    label: 'Morally grey characters',
    phrase: 'morally grey characters',
    dims: [{ key: 'morality', target: 90 }],
    phrases: ['morally grey', 'morally gray', 'antihero', 'anti-hero', 'antiheroes', 'no good guys', 'moral ambiguity'],
  },
  {
    key: 'serialized',
    section: 'story',
    label: 'Serialized, ongoing stories',
    phrase: 'serialized stories',
    dims: [{ key: 'serialized', target: 90 }],
    phrases: ['serialized', 'ongoing story', 'one long story', 'binge shows'],
  },
  {
    key: 'episodic',
    section: 'story',
    label: 'Episodic, standalone episodes',
    phrase: 'episodic shows',
    dims: [{ key: 'serialized', target: 10 }],
    phrases: ['episodic', 'standalone episodes', 'case of the week', 'monster of the week', 'dip in and out'],
  },
  {
    key: 'epic_stakes',
    section: 'story',
    label: 'Epic scale',
    phrase: 'epic stories',
    dims: [{ key: 'stakes', target: 92 }],
    phrases: ['epic', 'saving the world', 'world ending', 'big scale', 'huge scale'],
  },
  {
    key: 'intimate_stakes',
    section: 'story',
    label: 'Small, intimate stories',
    phrase: 'small, intimate stories',
    dims: [{ key: 'stakes', target: 12 }],
    phrases: ['small stories', 'intimate', 'quiet stories', 'low stakes'],
  },
  {
    key: 'investigation',
    section: 'story',
    label: 'A strong investigation',
    phrase: 'a strong investigation',
    dims: [
      { key: 'complexity', target: 75 },
      { key: 'character', target: 70 },
    ],
    genres: ['crime', 'mystery'],
    phrases: ['investigation', 'the investigation', 'procedural', 'procedurals', 'detective work', 'mystery to solve', 'whodunit'],
  },
] as const;

/** Attributes whose "praise" is real but not actionable as a filter. */
export const UNACTIONABLE_PRAISE: readonly string[] = [
  'good writing', 'well written', 'great acting', 'good acting', 'great performances',
  'good cinematography', 'beautiful', 'great soundtrack', 'good music', 'high quality',
  'well made', 'good production value',
];

const BY_KEY = new Map(ATTRIBUTES.map((a) => [a.key, a]));

export function attribute(key: string): Attribute | undefined {
  return BY_KEY.get(key);
}

export function attributeLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function attributePhrase(key: string): string {
  return BY_KEY.get(key)?.phrase ?? key;
}

/** Every phrase, longest first, so multi-word phrases win over their fragments. */
const PHRASE_INDEX: Array<{ phrase: string; key: string }> = ATTRIBUTES
  .flatMap((a) => a.phrases.map((p) => ({ phrase: p, key: a.key })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** A phrase hit inside a piece of text. */
export interface PhraseHit {
  key: string;
  phrase: string;
  start: number;
  end: number;
}

const WORDISH = /[a-z0-9]/;

function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !WORDISH.test(text[index] ?? '');
}

/**
 * Find every attribute mentioned in `text`, longest phrase first, without
 * overlaps. Matching is on word boundaries so "scary" does not fire inside
 * "scarcity" and "subs" does not fire inside "suburbs".
 */
export function findAttributes(text: string): PhraseHit[] {
  const lower = text.toLowerCase();
  const hits: PhraseHit[] = [];
  const taken: Array<[number, number]> = [];

  for (const { phrase, key } of PHRASE_INDEX) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(phrase, from);
      if (at === -1) break;
      const end = at + phrase.length;
      from = at + 1;
      if (!isBoundary(lower, at - 1) || !isBoundary(lower, end)) continue;
      if (taken.some(([s, e]) => at < e && end > s)) continue;
      taken.push([at, end]);
      hits.push({ key, phrase, start: at, end });
      break; // one hit per phrase is enough to establish the attribute
    }
  }
  // Keep only the first mention of each attribute, in reading order.
  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.start - b.start)
    .filter((h) => (seen.has(h.key) ? false : (seen.add(h.key), true)));
}

/** True when the text is praise we cannot turn into a filter. */
export function isUnactionablePraise(text: string): boolean {
  const lower = text.toLowerCase();
  return UNACTIONABLE_PRAISE.some((p) => lower.includes(p));
}

/**
 * The dimension targets implied by liking (`polarity` +1) or disliking (-1) an
 * attribute. A dislike credits the OPPOSITE end of each axis, exactly like the
 * preference engine does for a low rating — avoidance shapes taste too.
 */
export function dimTargetsFor(key: string, polarity: -1 | 1): DimTarget[] {
  const attr = BY_KEY.get(key);
  if (!attr?.dims) return [];
  return attr.dims
    .filter((d) => DIMENSION_KEYS.includes(d.key))
    .map((d) => ({ key: d.key, target: polarity === 1 ? d.target : 100 - d.target }));
}
