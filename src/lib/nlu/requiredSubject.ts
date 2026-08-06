/**
 * REQUIRED SUBJECT — a subject the user named is a HARD constraint, not a genre
 * approximation.
 *
 * The live failure: a signed-in user asked the Forensic Search (POST /api/finder)
 * for "a boxing movie … made within the last 20 years" and got Avatar, Spider-
 * Verse and The Dark Knight, with the chips showing "Movies · Last 20 yr ·
 * 2 genres" — "boxing" gone. The AI parser had degraded the SUBJECT ("boxing")
 * into two generic genres, because FinderQuery had no way to carry a required
 * subject, and the finder's keyword-starvation relaxation then padded whatever
 * remained with popular genre matches.
 *
 * This module is the deterministic, LLM-independent detector that makes a named
 * subject survive. It does NOT depend on the model: "boxing" in the sentence
 * means boxing is required, full stop. Each subject carries its own bounded
 * keyword expansion (so "boxing" also finds "boxer", "prizefighter") and the
 * adjacent subjects it must NEVER be broadened into (wrestling, MMA, martial
 * arts). Those adjacents are separate subjects in their own right, so "a
 * wrestling movie" and "not martial arts" are handled by the same table.
 *
 * Pure, no I/O. Keyword-id resolution (searchKeywords) happens in the route;
 * here we only decide WHICH subject is required and which are excluded.
 */

export interface SubjectSpec {
  /** Chip + read-back label, e.g. "Boxing". */
  label: string;
  /** Canonical key, e.g. "boxing". */
  canonical: string;
  /** Trigger phrases that mean this subject was named (word-boundary matched). */
  triggers: string[];
  /** Bounded keyword expansion for TMDB `with_keywords` — the ONLY approved
   *  broadening. Never includes a generic parent (sports, fighting, action). */
  expansion: string[];
  /**
   * The subject's own VOCABULARY for the semantic-eligibility evaluator — the
   * subject word, its forms, and a bounded set of on-topic CONTEXT terms that a
   * genuinely-central title's title/summary uses (e.g. boxing → "heavyweight",
   * "ring", "knockout"). This is subject DATA, never a title name and never code
   * that branches on the subject. When omitted, the general path derives lexemes
   * from the user's own words.
   */
  lexemes: string[];
  /** Adjacent subjects this must never be conflated with. Their trigger words,
   *  when they appear as the REQUIRED subject, are different requests. */
  forbid: string[];
}

/**
 * The subject table. Deliberately explicit and narrow. Boxing is boxing; it is
 * not sports, not fighting, not martial arts, not wrestling, not MMA. Those
 * each get their own entry so they can be required OR excluded independently.
 */
export const SUBJECTS: Record<string, SubjectSpec> = {
  boxing: {
    label: 'Boxing',
    canonical: 'boxing',
    // "boxing" and "boxer" are the two well-tagged TMDB keywords; the rest are
    // included as search terms but TMDB may map several to the same id.
    triggers: ['boxing', 'boxer', 'prizefighter', 'prize fighter', 'prizefighting', 'prize fighting'],
    expansion: ['boxing', 'boxer', 'prizefighter', 'boxing match'],
    lexemes: ['boxing', 'boxer', 'prizefighter', 'prizefighting', 'heavyweight', 'ring', 'knockout', 'boxing match'],
    forbid: ['wrestling', 'mma', 'mixed martial arts', 'martial arts'],
  },
  wrestling: {
    label: 'Wrestling',
    canonical: 'wrestling',
    triggers: ['wrestling', 'wrestler', 'pro wrestling', 'professional wrestling'],
    expansion: ['wrestling', 'wrestler', 'professional wrestling'],
    lexemes: ['wrestling', 'wrestler', 'professional wrestling', 'wrestle', 'wrestlemania'],
    forbid: ['boxing', 'mma', 'mixed martial arts', 'martial arts'],
  },
  mma: {
    label: 'MMA',
    canonical: 'mma',
    triggers: ['mma', 'mixed martial arts', 'cage fighting', 'ufc'],
    expansion: ['mixed martial arts', 'mma', 'cage fighting'],
    lexemes: ['mixed martial arts', 'mma', 'cage fighting', 'cage fight', 'octagon', 'ufc'],
    forbid: ['boxing', 'wrestling'],
  },
  'martial arts': {
    label: 'Martial arts',
    canonical: 'martial arts',
    triggers: ['martial arts', 'kung fu', 'karate', 'taekwondo'],
    expansion: ['martial arts', 'kung fu', 'karate'],
    lexemes: ['martial arts', 'kung fu', 'karate', 'taekwondo', 'dojo'],
    forbid: ['boxing', 'wrestling', 'mma', 'mixed martial arts'],
  },
};

const WB = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `phrase` appears as a whole token/phrase in `text`. */
function mentions(text: string, phrase: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${WB(phrase)}(?:[^a-z0-9]|$)`, 'i').test(text);
}

/**
 * Was `phrase` negated — "not boxing", "no boxing", "without boxing", "but not
 * boxing", "isn't boxing"? Scans a short window before the phrase for a
 * negator, stopping at clause boundaries so "a boxing movie, not wrestling"
 * negates only wrestling.
 */
function isNegated(text: string, phrase: string): boolean {
  const re = new RegExp(`\\b(?:not|no|without|never|non|isn'?t|aren'?t|excluding|except)\\b[^,.;]{0,24}?${WB(phrase)}`, 'i');
  return re.test(text);
}

export interface SubjectDetection {
  /** The required subject, or null when none was named as required. */
  required: SubjectSpec | null;
  /** Subjects explicitly excluded ("not wrestling"). */
  excluded: SubjectSpec[];
  /** True when the user paired a subject word with an explicit genre word, so
   *  the caller keeps genres; otherwise AI-inferred genres are subject noise. */
  explicitGenre: boolean;
}

const GENRE_WORDS = [
  'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary', 'drama',
  'family', 'fantasy', 'history', 'horror', 'music', 'mystery', 'romance',
  'sci-fi', 'science fiction', 'thriller', 'war', 'western',
];

/**
 * Decide the required subject and any excluded subjects for a raw request.
 *
 * A subject is REQUIRED when its trigger appears and is not negated. A subject
 * is EXCLUDED when its trigger appears negated. When the same sentence both
 * requires one subject and negates another ("a boxing movie, not wrestling"),
 * both are honored. "Rocky's underdog feeling but not boxing" yields NO required
 * subject and boxing excluded — the reference stays a soft similarity signal.
 */
export function detectRequiredSubject(raw: string): SubjectDetection {
  // Hyphens/underscores become spaces so "martial-arts" matches the "martial
  // arts" trigger and "prize-fighter" matches "prize fighter".
  const text = ` ${(raw ?? '').toLowerCase().replace(/[-_]+/g, ' ')} `;
  let required: SubjectSpec | null = null;
  const excluded: SubjectSpec[] = [];

  for (const spec of Object.values(SUBJECTS)) {
    const named = spec.triggers.some((t) => mentions(text, t));
    if (!named) continue;
    const negated = spec.triggers.some((t) => mentions(text, t) && isNegated(text, t))
      && !spec.triggers.some((t) => mentions(text, t) && !isNegated(text, t));
    if (negated) {
      excluded.push(spec);
    } else if (!required) {
      required = spec;
    }
  }

  const genreWord = GENRE_WORDS.find((g) => mentions(text, g)) ?? null;
  return { required, excluded, explicitGenre: genreWord != null };
}

// ── GENERAL (non-curated) STRICT-SUBJECT EXTRACTION ────────────────────────────
//
// The curated table above covers the four combat sports that must never be
// conflated. But the same "the subject must be CENTRAL, not merely tagged"
// guarantee has to hold for ANY subject a user names — courtroom, chess,
// mountaineering, journalism, a heist. This extractor derives a strict subject
// from the user's OWN words, with no per-topic table: it reads the noun in
// "a <subject> movie/series/drama" and enriches it from an emphasis clause
// ("where the trial is central", "centered on the climb"). It is deliberately
// conservative — it fires ONLY on that explicit singular-subject shape — so a
// plain genre browse ("crime shows") is untouched and cannot be narrowed.

/** Concrete media nouns that mark "<subject> <media>". */
const MEDIA_WORDS = [
  'movie', 'movies', 'film', 'films', 'flick', 'flicks', 'show', 'shows', 'series',
  'documentary', 'documentaries', 'sitcom', 'sitcoms', 'miniseries', 'drama', 'dramas',
  'feature', 'features', 'pic', 'pics', 'picture', 'pictures',
];
const PLURAL_MEDIA = new Set([
  'movies', 'films', 'flicks', 'shows', 'documentaries', 'sitcoms', 'dramas', 'features', 'pics', 'pictures',
]);

/** Words that are never themselves a subject (so they never become a strict gate). */
const NON_SUBJECT = new Set<string>([
  ...GENRE_WORDS,
  'drama', 'documentary', 'scifi', 'sci fi',
  // determiners / quality adjectives / vague quantities
  'a', 'an', 'the', 'one', 'some', 'any', 'another', 'other', 'good', 'great', 'nice',
  'decent', 'best', 'top', 'new', 'old', 'recent', 'classic', 'favorite', 'favourite',
  'perfect', 'solid', 'cool', 'fun', 'funny', 'scary', 'sad', 'short', 'long', 'quick',
  'easy', 'dark', 'light', 'obscure', 'underrated', 'generic', 'real', 'actual', 'typical',
  'usual', 'standard', 'ordinary', 'certain', 'particular', 'amazing', 'awesome', 'incredible',
  'wonderful', 'beautiful', 'interesting', 'entertaining', 'quality', 'little', 'big', 'small',
  // providers / platforms
  'netflix', 'hulu', 'prime', 'max', 'hbo', 'disney', 'peacock', 'paramount', 'apple',
  'appletv', 'showtime', 'starz', 'britbox', 'acorn', 'amazon',
  // languages / nationalities / origin
  'english', 'spanish', 'french', 'korean', 'japanese', 'chinese', 'german', 'italian',
  'indian', 'american', 'british', 'foreign', 'international', 'latin', 'nordic', 'scandinavian',
  // media / generic result nouns
  'movie', 'film', 'show', 'series', 'thing', 'things', 'ones', 'something', 'anything',
  'everything', 'nothing', 'kind', 'sort', 'type', 'stuff', 'title', 'titles', 'pick', 'picks',
  'option', 'options', 'recommendation', 'recommendations', 'flick', 'today', 'tonight', 'now',
]);

/** Stop tokens inside an emphasis clause capture. */
const EMPHASIS_STOP = new Set<string>([
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'drives', 'drive', 'driving', 'matters',
  'matter', 'central', 'the', 'a', 'an', 'plot', 'plots', 'story', 'stories', 'narrative',
  'main', 'whole', 'entire', 'to', 'and', 'or', 'of', 'that', 'which', 'really', 'actually',
  'itself', 'everything', 'themselves',
]);

const TITLE_CASE = (s: string) => s.replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());

export interface GeneralSubject {
  canonical: string;
  label: string;
  lexemes: string[];
}

/**
 * Detect a strict subject a user named generically ("a courtroom movie",
 * "a chess movie where chess drives the story"). Returns null unless the
 * explicit "a <subject> <media>" shape is present and the subject is a real
 * content noun (not a genre / provider / language / quality word).
 */
export function detectGeneralSubject(raw: string): GeneralSubject | null {
  const text = ` ${(raw ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const tokens = text.trim().split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  // Find the earliest media word that is directly preceded by a content noun.
  let subjectTokens: string[] | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (!MEDIA_WORDS.includes(tokens[i]!)) continue;
    // Walk back over the immediate content tokens (skip nothing — adjacency is
    // the signal). Collect up to two consecutive non-stop content tokens.
    const collected: string[] = [];
    for (let j = i - 1; j >= 0 && collected.length < 2; j--) {
      const w = tokens[j]!;
      if (w.length < 3) break;
      if (NON_SUBJECT.has(w)) break;
      if (MEDIA_WORDS.includes(w)) break;
      collected.unshift(w);
    }
    if (collected.length > 0) {
      subjectTokens = collected;
      break;
    }
  }
  if (!subjectTokens) return null;

  const head = subjectTokens[subjectTokens.length - 1]!;
  const phrase = subjectTokens.join(' ');
  if (NON_SUBJECT.has(head) || head.length < 3) return null;

  const lexemes = new Set<string>([phrase, head, ...subjectTokens]);

  // Enrich from an emphasis clause — the noun the request says is central.
  // Two shapes: the noun AFTER a focus preposition ("centered on the climb"),
  // and the noun BEFORE a centrality verb ("the theft drives the plot",
  // "the trial is central", "chess matters").
  const addFrom = (capture: string | undefined) => {
    if (!capture) return;
    const words = capture.split(' ').filter((w) => w && !EMPHASIS_STOP.has(w));
    for (const w of words.slice(-2)) {
      if (w.length >= 3 && !NON_SUBJECT.has(w)) lexemes.add(w);
    }
  };
  const afterRe =
    /\b(?:where(?:\s+the)?|centered\s+on(?:\s+the)?|centred\s+on(?:\s+the)?|about|focused\s+on(?:\s+the)?|driven\s+by(?:\s+the)?|revolves?\s+around(?:\s+the)?)\s+([a-z]+(?:\s+[a-z]+){0,2})/g;
  const beforeRe =
    /\b(?:the\s+)?([a-z]+(?:\s+[a-z]+)?)\s+(?:drives?|driving|is\s+central|are\s+central|matters?|is\s+the\s+(?:focus|point|heart))\b/g;
  let m: RegExpExecArray | null;
  while ((m = afterRe.exec(text)) !== null) addFrom(m[1]);
  while ((m = beforeRe.exec(text)) !== null) addFrom(m[1]);

  return { canonical: phrase, label: TITLE_CASE(phrase), lexemes: [...lexemes] };
}

/**
 * Is this a request for exactly ONE title of a named subject — "a boxing
 * movie", "a courtroom film" — with a singular media noun, an indefinite
 * article, and no explicit larger count? Drives the requested-count = 1
 * contract for strict subject requests. Plurals ("boxing movies", "three
 * courtroom films") are NOT singular.
 */
export function isSingularSubjectRequest(raw: string): boolean {
  const text = ` ${(raw ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;
  // An indefinite-article + singular media noun, with no plural media noun.
  const singular = /\b(?:a|an|one)\b[^.?!]*?\b(?:movie|film|flick|show|series|documentary|sitcom|miniseries|drama|feature|picture)\b/.test(text);
  const plural = /\b(?:movies|films|flicks|shows|documentaries|sitcoms|dramas|features|pictures)\b/.test(text);
  return singular && !plural;
}
