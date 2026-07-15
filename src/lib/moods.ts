// Shared mood catalog for the solo Mood Finder. Client-safe (chips) and used
// server-side (genre ids). TMDB genre ids: 28 Action, 12 Adventure, 16 Anim,
// 35 Comedy, 80 Crime, 99 Doc, 18 Drama, 10751 Family, 14 Fantasy, 36 History,
// 27 Horror, 9648 Mystery, 10749 Romance, 878 Sci-Fi, 53 Thriller, 10752 War.

export interface Mood {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
  genres: number[];
  /** Bias toward lighter/heavier picks changes the default sort/rating floor. */
  tone: 'light' | 'mid' | 'heavy';
}

export const MOODS: Mood[] = [
  { key: 'cozy', label: 'Cozy & easy', emoji: '☕', blurb: 'Warm, low-stakes, feel-good', genres: [35, 10751, 10749], tone: 'light' },
  { key: 'funny', label: 'Make me laugh', emoji: '😂', blurb: 'Comedy, front and center', genres: [35], tone: 'light' },
  { key: 'thrilling', label: 'Edge of my seat', emoji: '🔥', blurb: 'Tension, chases, stakes', genres: [53, 28, 80], tone: 'mid' },
  { key: 'dark', label: 'Dark & intense', emoji: '🌑', blurb: 'Crime, dread, the deep end', genres: [80, 53, 9648, 27], tone: 'heavy' },
  { key: 'mind', label: 'Mind-bending', emoji: '🧠', blurb: 'Twists, sci-fi, mysteries', genres: [878, 9648, 53], tone: 'mid' },
  { key: 'epic', label: 'Big & epic', emoji: '🗺️', blurb: 'Adventure and spectacle', genres: [12, 28, 14], tone: 'mid' },
  { key: 'romantic', label: 'Romantic', emoji: '💘', blurb: 'Love stories & swoons', genres: [10749, 18], tone: 'light' },
  { key: 'moving', label: 'Move me', emoji: '🥹', blurb: 'Prestige, true stories, drama', genres: [18, 36, 99], tone: 'heavy' },
];

export function moodByKey(key: string): Mood | undefined {
  return MOODS.find((m) => m.key === key);
}
