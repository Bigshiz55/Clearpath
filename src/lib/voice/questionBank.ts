/**
 * VOICE DNA INTERVIEW — the typed question bank (pure data, no I/O).
 *
 * Every block is THREE items the interviewer speaks and the user rates 1–10.
 * The bank is a diagnostic, not a catalog taxonomy: each item earns its place by
 * how much recommendation-relevant signal it buys per second. Blocks are grouped
 * into the four interview stages and carry the DNA signal each item maps to, so
 * the deterministic DNA updater never has to parse free text — it reads
 * `signalKeys[i]` next to `values[i]`.
 *
 * The LLM orchestrator chooses AMONG these approved blocks (it never invents
 * taxonomy at request time); the state machine decides WHICH block is worth the
 * next ~5 seconds. Adding a block here is the only way to widen the interview.
 */

export type InterviewStage = 'genre_pulse' | 'genre_drill' | 'watching_style' | 'title_anchors';

/** What a signal maps onto in the three-DNA model. */
export type SignalKind = 'genre' | 'subgenre' | 'tone' | 'pacing' | 'format' | 'era' | 'language' | 'runtime' | 'content';

export interface QuestionItem {
  /** Stable signal key the DNA updater writes (e.g. "genre:crime", "tone:dark"). */
  signalKey: string;
  /** The word the interviewer says / the chip the UI shows ("Crime"). */
  label: string;
  /** What kind of DNA signal this is. */
  kind: SignalKind;
}

export interface QuestionBlock {
  id: string;
  stage: InterviewStage;
  /** For a drill-down block, the parent genre signal it deepens ("genre:crime"). */
  parent?: string;
  /** Exactly three items, spoken and rated together. */
  items: [QuestionItem, QuestionItem, QuestionItem];
  /** What the interviewer says aloud (kept short — speed matters). */
  tts: string;
  /** Estimated seconds this block costs (speak + listen). Drives the time budget. */
  estSeconds: number;
  /** Higher = more diagnostic; a tiebreaker for the selector. */
  priority: number;
}

const g = (key: string, label: string, kind: SignalKind = 'genre'): QuestionItem => ({ signalKey: key, label, kind });

// ── STAGE 1 — RAPID GENRE PULSE ──────────────────────────────────────────────
export const GENRE_PULSE: QuestionBlock[] = [
  { id: 'pulse_a', stage: 'genre_pulse', tts: 'Crime, drama, comedy.', estSeconds: 5, priority: 100,
    items: [g('genre:crime', 'Crime'), g('genre:drama', 'Drama'), g('genre:comedy', 'Comedy')] },
  { id: 'pulse_b', stage: 'genre_pulse', tts: 'Romance, action, thriller.', estSeconds: 5, priority: 95,
    items: [g('genre:romance', 'Romance'), g('genre:action', 'Action'), g('genre:thriller', 'Thriller')] },
  { id: 'pulse_c', stage: 'genre_pulse', tts: 'Horror, sci-fi, fantasy.', estSeconds: 5, priority: 90,
    items: [g('genre:horror', 'Horror'), g('genre:scifi', 'Sci-fi'), g('genre:fantasy', 'Fantasy')] },
  { id: 'pulse_d', stage: 'genre_pulse', tts: 'Animation, documentaries, reality.', estSeconds: 5, priority: 80,
    items: [g('genre:animation', 'Animation'), g('genre:documentary', 'Documentaries'), g('genre:reality', 'Reality TV')] },
];

// ── STAGE 2 — GENRE-SPECIFIC DRILL-DOWNS (one block per broad genre) ─────────
export const GENRE_DRILL: QuestionBlock[] = [
  { id: 'crime_core', stage: 'genre_drill', parent: 'genre:crime', tts: 'Detective, psychological, true crime.', estSeconds: 5, priority: 70,
    items: [g('sub:detective', 'Detective', 'subgenre'), g('sub:psychological_crime', 'Psychological', 'subgenre'), g('sub:true_crime', 'True crime', 'subgenre')] },
  { id: 'crime_more', stage: 'genre_drill', parent: 'genre:crime', tts: 'Gangster, courtroom, police procedural.', estSeconds: 5, priority: 40,
    items: [g('sub:gangster', 'Gangster', 'subgenre'), g('sub:courtroom', 'Courtroom', 'subgenre'), g('sub:procedural', 'Procedural', 'subgenre')] },
  { id: 'horror_core', stage: 'genre_drill', parent: 'genre:horror', tts: 'Psychological, slasher, supernatural.', estSeconds: 5, priority: 70,
    items: [g('sub:psych_horror', 'Psychological', 'subgenre'), g('sub:slasher', 'Slasher', 'subgenre'), g('sub:supernatural', 'Supernatural', 'subgenre')] },
  { id: 'horror_more', stage: 'genre_drill', parent: 'genre:horror', tts: 'Home invasion, creature, occult.', estSeconds: 5, priority: 40,
    items: [g('sub:home_invasion', 'Home invasion', 'subgenre'), g('sub:creature', 'Creature', 'subgenre'), g('sub:occult', 'Occult', 'subgenre')] },
  { id: 'action_core', stage: 'genre_drill', parent: 'genre:action', tts: 'Grounded action, martial arts, disaster.', estSeconds: 5, priority: 70,
    items: [g('sub:grounded_action', 'Grounded', 'subgenre'), g('sub:martial_arts', 'Martial arts', 'subgenre'), g('sub:disaster', 'Disaster', 'subgenre')] },
  { id: 'action_more', stage: 'genre_drill', parent: 'genre:action', tts: 'Military, spy, superhero.', estSeconds: 5, priority: 40,
    items: [g('sub:military', 'Military', 'subgenre'), g('sub:spy', 'Spy', 'subgenre'), g('sub:superhero', 'Superhero', 'subgenre')] },
  { id: 'comedy_core', stage: 'genre_drill', parent: 'genre:comedy', tts: 'Dry, dark, broad.', estSeconds: 5, priority: 65,
    items: [g('tone:dry_comedy', 'Dry', 'tone'), g('tone:dark_comedy', 'Dark', 'tone'), g('tone:broad_comedy', 'Broad', 'tone')] },
  { id: 'scifi_core', stage: 'genre_drill', parent: 'genre:scifi', tts: 'Space, technology, time travel.', estSeconds: 5, priority: 65,
    items: [g('sub:space', 'Space', 'subgenre'), g('sub:tech_scifi', 'Technology', 'subgenre'), g('sub:time_travel', 'Time travel', 'subgenre')] },
  { id: 'drama_core', stage: 'genre_drill', parent: 'genre:drama', tts: 'Character study, family, historical.', estSeconds: 5, priority: 60,
    items: [g('sub:character_study', 'Character study', 'subgenre'), g('sub:family_drama', 'Family', 'subgenre'), g('sub:historical', 'Historical', 'subgenre')] },
  { id: 'doc_core', stage: 'genre_drill', parent: 'genre:documentary', tts: 'True crime, history, nature.', estSeconds: 5, priority: 60,
    items: [g('sub:doc_true_crime', 'True crime', 'subgenre'), g('sub:doc_history', 'History', 'subgenre'), g('sub:doc_nature', 'Nature', 'subgenre')] },
  { id: 'romance_core', stage: 'genre_drill', parent: 'genre:romance', tts: 'Rom-com, drama, period.', estSeconds: 5, priority: 55,
    items: [g('sub:romcom', 'Rom-com', 'subgenre'), g('sub:romantic_drama', 'Drama', 'subgenre'), g('sub:period_romance', 'Period', 'subgenre')] },
  { id: 'fantasy_core', stage: 'genre_drill', parent: 'genre:fantasy', tts: 'Epic, urban, fairy tale.', estSeconds: 5, priority: 55,
    items: [g('sub:epic_fantasy', 'Epic', 'subgenre'), g('sub:urban_fantasy', 'Urban', 'subgenre'), g('sub:fairy_tale', 'Fairy tale', 'subgenre')] },
];

// ── STAGE 3 — WATCHING STYLE / HARD FILTERS ─────────────────────────────────
export const WATCHING_STYLE: QuestionBlock[] = [
  { id: 'style_a', stage: 'watching_style', tts: 'Older movies, subtitles, dubbed.', estSeconds: 5, priority: 50,
    items: [g('era:older', 'Older movies', 'era'), g('language:subtitles', 'Subtitles', 'language'), g('language:dubbed', 'Dubbed', 'language')] },
  { id: 'style_b', stage: 'watching_style', tts: 'Slow burns, very long movies, graphic violence.', estSeconds: 5, priority: 45,
    items: [g('pacing:slow_burn', 'Slow burns', 'pacing'), g('runtime:very_long', 'Long movies', 'runtime'), g('content:graphic_violence', 'Graphic violence', 'content')] },
  { id: 'style_c', stage: 'watching_style', tts: 'Family-friendly, dark tone, foreign-language.', estSeconds: 5, priority: 40,
    items: [g('content:family_friendly', 'Family-friendly', 'content'), g('tone:very_dark', 'Dark tone', 'tone'), g('language:foreign', 'Foreign-language', 'language')] },
];

// ── STAGE 4 — TITLE ANCHORS (open-ended, no 1–10 scale) ─────────────────────
export interface AnchorPrompt {
  id: string;
  stage: 'title_anchors';
  tts: string;
  /** Positive = titles they love; negative = a title they disliked. */
  polarity: 'love' | 'dislike';
  estSeconds: number;
}
export const TITLE_ANCHORS: AnchorPrompt[] = [
  { id: 'anchor_love', stage: 'title_anchors', tts: 'Give me a few movies or shows you absolutely love.', polarity: 'love', estSeconds: 10 },
  { id: 'anchor_dislike', stage: 'title_anchors', tts: 'One you really disliked?', polarity: 'dislike', estSeconds: 6 },
];

/** All scored blocks (stages 1–3), indexed for the selector. */
export const ALL_BLOCKS: QuestionBlock[] = [...GENRE_PULSE, ...GENRE_DRILL, ...WATCHING_STYLE];

/** The drill-down block(s) available for a given genre signal key, best first. */
export function drillsForGenre(genreSignal: string): QuestionBlock[] {
  return GENRE_DRILL.filter((b) => b.parent === genreSignal).sort((a, b) => b.priority - a.priority);
}
