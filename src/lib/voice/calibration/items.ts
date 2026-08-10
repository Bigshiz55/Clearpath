/**
 * 60-SECOND VOICE DNA — the calibration items.
 *
 * Fifteen high-information taste dimensions, each rated 0–10. This is a
 * CALIBRATION, not an interview: the spoken prompt for each item is one or two
 * words, because the whole run has to fit in about a minute and every syllable
 * spent on phrasing is a syllable the user waits through.
 *
 * `prompt` is what gets spoken; `label` is what the screen shows in large type.
 * They are separate because the screen can afford "GHOSTS / SUPERNATURAL" while
 * the voice should say the shortest thing that is unambiguous out loud.
 *
 * `genres` maps an item onto the genre vocabulary the preference engine already
 * speaks, so a rating can become a prior without inventing a second taxonomy.
 * An item with no genre mapping (`slowBurn`, `foreign`) still carries taste —
 * it is stored verbatim and read by the ambiguity pass — it just has no genre
 * affinity to bump.
 *
 * PURE. No I/O, no clock, no randomness.
 */

export const CALIBRATION_VERSION = 'rapid-v1';

/** Every item is answered on this scale. 0 = never show me this, 10 = love it. */
export const RATING_MIN = 0;
export const RATING_MAX = 10;

export interface CalibrationItem {
  id: string;
  /** Large on-screen title. */
  label: string;
  /** Spoken prompt — as short as it can be while staying unambiguous aloud. */
  prompt: string;
  /** Genre slugs this rating informs, if any. */
  genres: string[];
}

export const CALIBRATION_ITEMS: readonly CalibrationItem[] = [
  { id: 'crime', label: 'Crime', prompt: 'Crime?', genres: ['crime'] },
  { id: 'trueCrime', label: 'True crime', prompt: 'True crime?', genres: ['documentary', 'crime'] },
  { id: 'mystery', label: 'Mystery / detective', prompt: 'Mystery?', genres: ['mystery'] },
  { id: 'thriller', label: 'Thriller / suspense', prompt: 'Thriller?', genres: ['thriller'] },
  { id: 'drama', label: 'Drama', prompt: 'Drama?', genres: ['drama'] },
  { id: 'comedy', label: 'Comedy', prompt: 'Comedy?', genres: ['comedy'] },
  { id: 'action', label: 'Action', prompt: 'Action?', genres: ['action'] },
  { id: 'documentary', label: 'Documentary', prompt: 'Documentaries?', genres: ['documentary'] },
  { id: 'romance', label: 'Romance', prompt: 'Romance?', genres: ['romance'] },
  { id: 'horror', label: 'Horror', prompt: 'Horror?', genres: ['horror'] },
  { id: 'scifi', label: 'Sci-fi', prompt: 'Sci-fi?', genres: ['scifi'] },
  { id: 'supernatural', label: 'Ghosts / supernatural', prompt: 'Ghosts and the supernatural?', genres: ['horror', 'fantasy'] },
  { id: 'fantasy', label: 'Fantasy', prompt: 'Fantasy?', genres: ['fantasy'] },
  { id: 'slowBurn', label: 'Slow-burn stories', prompt: 'Slow burns?', genres: [] },
  { id: 'foreign', label: 'Foreign-language / dubbed', prompt: 'Subtitles and dubbed shows?', genres: [] },
] as const;

export const CALIBRATION_ITEM_IDS: readonly string[] = CALIBRATION_ITEMS.map((i) => i.id);

/** The one sentence spoken before the run starts. Nothing else is explained. */
export const CALIBRATION_INTRO =
  "I'm going to name a few kinds of movies and shows. " +
  'Rate each from 0 to 10 — zero means never show me this, ten means I love it. ' +
  'Just say the number.';

/** What we say when we could not read an answer. Not a conversation. */
export const REASK_LINE = 'Sorry — number?';

export function itemById(id: string): CalibrationItem | undefined {
  return CALIBRATION_ITEMS.find((i) => i.id === id);
}
