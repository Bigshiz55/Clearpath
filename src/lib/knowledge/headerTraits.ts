/**
 * EVIDENCE-GROUNDED TONE + SETTING for the compiled title header (pure).
 *
 * The Knowledge Layer header carries a title's tone and setting, which the
 * ranking tone/setting nudge consumes. These are compiled from the title's REAL
 * evidence — title / alt title / overview / genres / keyword tags — using a
 * NORMALIZED concept lexicon. A concept is emitted ONLY when its trigger is
 * actually present in the evidence, so nothing is invented; a title with no
 * matching evidence yields []. It is a general concept lexicon (genres/words →
 * normalized tone; place words → normalized setting), NOT a per-title table and
 * NOT keyed to any search query. Bounded to HEADER_TRAITS_MAX per axis.
 *
 * This is deterministic on purpose: it runs inside the time-budgeted warm job,
 * so it must be cheap and never spend a model call to label a header.
 */

export const HEADER_TRAITS_MAX = 4;

interface ToneRule {
  concept: string;
  /** Exact genre names (lowercased) that evidence this tone. */
  genres?: string[];
  /** Word/phrase cues in title+overview that evidence this tone. */
  words?: string[];
}

interface SettingRule {
  concept: string;
  /** Place words/phrases in title+overview+keywords that evidence this setting. */
  words: string[];
}

// Normalized tone concepts (illustrative set — extend as data warrants; NOT a
// per-title hack). Genres are strong tone evidence; overview cues corroborate.
const TONE_RULES: ToneRule[] = [
  { concept: 'dark', genres: ['horror'], words: ['dark', 'brutal', 'sinister', 'bleak', 'grim'] },
  { concept: 'tense', genres: ['thriller'], words: ['tense', 'danger', 'deadly', 'race against'] },
  { concept: 'suspenseful', genres: ['mystery'], words: ['suspense', 'suspenseful', 'twist', 'whodunit'] },
  { concept: 'gritty', genres: ['crime', 'war'], words: ['gritty', 'raw', 'ruthless', 'violent'] },
  { concept: 'comedic', genres: ['comedy'], words: ['hilarious', 'comedic', 'comedy', 'laugh out loud'] },
  { concept: 'lighthearted', genres: ['family', 'animation'], words: ['heartwarming', 'feel good', 'feel-good', 'charming', 'whimsical'] },
  { concept: 'romantic', genres: ['romance'], words: ['romance', 'romantic', 'love story', 'falls in love'] },
  { concept: 'emotional', genres: ['drama'], words: ['emotional', 'moving', 'heartbreaking', 'poignant', 'tearjerker'] },
];

// Normalized setting concepts (illustrative — general place lexicon, not a
// per-title table). Matched against keywords + overview + title.
const SETTING_RULES: SettingRule[] = [
  { concept: 'courtroom', words: ['courtroom', 'trial', 'lawyer', 'attorney', 'prosecutor', 'defense attorney', 'on trial'] },
  { concept: 'small-town', words: ['small town', 'small-town', 'sleepy town'] },
  { concept: 'space', words: ['space', 'spacecraft', 'spaceship', 'astronaut', 'outer space', 'space station', 'orbit', 'mars', 'moon landing'] },
  { concept: 'school', words: ['school', 'high school', 'college', 'university', 'classroom', 'teacher', 'student'] },
  { concept: 'workplace', words: ['office', 'workplace', 'corporate', 'coworker', 'the company'] },
  { concept: 'hospital', words: ['hospital', 'surgeon', 'doctor', 'nurse', 'medical', 'emergency room'] },
  { concept: 'police', words: ['police', 'detective', 'precinct', 'homicide', 'police department'] },
  { concept: 'historical', words: ['historical', 'period drama', 'medieval', 'ancient', 'victorian', 'world war', 'wwii', 'set in the'] },
  { concept: 'urban', words: ['city', 'urban', 'metropolis', 'downtown'] },
  { concept: 'rural', words: ['rural', 'countryside', 'farm', 'village'] },
  { concept: 'prison', words: ['prison', 'jail', 'inmate', 'penitentiary', 'death row'] },
  { concept: 'submarine', words: ['submarine', 'u-boat', 'periscope'] },
];

const pad = (parts: string[]): string =>
  ` ${parts.join(' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** True when `phrase` appears as a whole word/phrase in the padded blob. */
const hasPhrase = (blob: string, phrase: string): boolean => blob.includes(` ${phrase} `);

export interface HeaderTraits {
  tone: string[];
  setting: string[];
}

/**
 * Derive evidence-backed tone[] and setting[] from a title's evidence. Only
 * concepts with real supporting evidence are returned; unsupported concepts are
 * never invented; no evidence ⇒ []. Bounded to HEADER_TRAITS_MAX each.
 */
export function deriveHeaderTraits(ev: {
  title?: string;
  altTitle?: string | null;
  overview?: string;
  genres?: string[];
  keywords?: string[];
}): HeaderTraits {
  const genres = new Set((ev.genres ?? []).map((g) => g.toLowerCase().trim()));
  const toneBlob = pad([ev.title ?? '', ev.altTitle ?? '', ev.overview ?? '']);
  const settingBlob = pad([ev.title ?? '', ev.altTitle ?? '', ev.overview ?? '', ...(ev.keywords ?? [])]);

  const tone: string[] = [];
  for (const rule of TONE_RULES) {
    const byGenre = (rule.genres ?? []).some((g) => genres.has(g));
    const byWord = (rule.words ?? []).some((w) => hasPhrase(toneBlob, w));
    if (byGenre || byWord) tone.push(rule.concept);
    if (tone.length >= HEADER_TRAITS_MAX) break;
  }

  const setting: string[] = [];
  for (const rule of SETTING_RULES) {
    if (rule.words.some((w) => hasPhrase(settingBlob, w))) setting.push(rule.concept);
    if (setting.length >= HEADER_TRAITS_MAX) break;
  }

  return { tone: Array.from(new Set(tone)), setting: Array.from(new Set(setting)) };
}
