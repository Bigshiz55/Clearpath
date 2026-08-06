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
    forbid: ['wrestling', 'mma', 'mixed martial arts', 'martial arts'],
  },
  wrestling: {
    label: 'Wrestling',
    canonical: 'wrestling',
    triggers: ['wrestling', 'wrestler', 'pro wrestling', 'professional wrestling'],
    expansion: ['wrestling', 'wrestler', 'professional wrestling'],
    forbid: ['boxing', 'mma', 'mixed martial arts', 'martial arts'],
  },
  mma: {
    label: 'MMA',
    canonical: 'mma',
    triggers: ['mma', 'mixed martial arts', 'cage fighting', 'ufc'],
    expansion: ['mixed martial arts', 'mma', 'cage fighting'],
    forbid: ['boxing', 'wrestling'],
  },
  'martial arts': {
    label: 'Martial arts',
    canonical: 'martial arts',
    triggers: ['martial arts', 'kung fu', 'karate', 'taekwondo'],
    expansion: ['martial arts', 'kung fu', 'karate'],
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
