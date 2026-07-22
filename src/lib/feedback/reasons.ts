/**
 * The reason-code catalog for the Pass / feedback flow. Every reason is a STABLE
 * code (never the display text) mapped to what it means for the Taste-DNA:
 * a signal category, a base negative strength, and whether it's a permanent
 * preference or just temporary context. `reasonChipsFor` picks the ~7 most
 * relevant codes for a given title from its metadata, so the chips adapt
 * (horror shows "Too scary/Supernatural", a long historical drama shows
 * "Too long/Period setting", etc.). Client-safe (pure data + functions).
 */

export type SignalCategory =
  | 'genre'
  | 'runtime'
  | 'tone'
  | 'pacing'
  | 'violence'
  | 'supernatural'
  | 'scifi'
  | 'language'
  | 'cast'
  | 'ratings'
  | 'story'
  | 'quality'
  | 'mood'
  | 'context'
  | 'familiarity'
  | 'family'
  | 'other';

/** Lightweight title metadata the chip selector reasons over. */
export interface TitleMetaLite {
  mediaType: 'movie' | 'tv';
  genres: string[];
  runtimeMinutes: number | null; // movie feature length
  episodeRuntimeMinutes: number | null; // tv per-episode
  numberOfSeasons: number | null;
  year: number | null;
  originalLanguage: string | null; // 'en', 'ko', …
  englishNative: boolean; // true when originally English
  voteAverage: number | null; // 0..10
}

export interface ReasonDef {
  code: string;
  label: string;
  category: SignalCategory;
  /** Base negative strength 0..1 (scaled by the feedback type). */
  strength: number;
  /** True = a lasting preference; false = temporary context that must NOT skew permanent DNA. */
  permanent: boolean;
  /** Relevance predicate for adaptive selection (omitted = always eligible). */
  when?: (m: TitleMetaLite) => boolean;
}

const has = (m: TitleMetaLite, ...names: string[]) => {
  const g = m.genres.map((x) => x.toLowerCase());
  return names.some((n) => g.some((x) => x.includes(n)));
};
const isLong = (m: TitleMetaLite) =>
  (m.runtimeMinutes ?? 0) >= 140 || (m.numberOfSeasons ?? 0) >= 4;
const NOW_YEAR = new Date().getFullYear();
/** Old by RELEASE year (a dated pick), relative to now — not "period setting". */
const isOld = (m: TitleMetaLite) => m.year != null && m.year <= NOW_YEAR - 18;
const isForeign = (m: TitleMetaLite) => !m.englishNative;
const lowRated = (m: TitleMetaLite) => m.voteAverage != null && m.voteAverage < 6.2;

/** The full catalog, keyed by stable code. */
export const REASONS: Record<string, ReasonDef> = {
  not_my_genre: { code: 'not_my_genre', label: 'Not my genre', category: 'genre', strength: 0.7, permanent: true },
  story_not_interesting: { code: 'story_not_interesting', label: 'Story doesn’t interest me', category: 'story', strength: 0.5, permanent: true },
  too_violent: { code: 'too_violent', label: 'Too violent', category: 'violence', strength: 0.7, permanent: true, when: (m) => has(m, 'action', 'war', 'horror', 'thriller') },
  too_dark: { code: 'too_dark', label: 'Too dark', category: 'tone', strength: 0.6, permanent: true, when: (m) => has(m, 'crime', 'thriller', 'drama', 'horror', 'war') },
  too_scary: { code: 'too_scary', label: 'Too scary', category: 'tone', strength: 0.7, permanent: true, when: (m) => has(m, 'horror') },
  supernatural: { code: 'supernatural', label: 'Supernatural', category: 'supernatural', strength: 0.8, permanent: true, when: (m) => has(m, 'horror', 'fantasy') },
  sci_fi: { code: 'sci_fi', label: 'Too much sci-fi', category: 'scifi', strength: 0.8, permanent: true, when: (m) => has(m, 'science fiction', 'sci-fi') },
  too_slow: { code: 'too_slow', label: 'Too slow', category: 'pacing', strength: 0.6, permanent: true, when: (m) => has(m, 'drama', 'history', 'romance', 'documentary', 'mystery') || isLong(m) },
  too_long: { code: 'too_long', label: 'Too long', category: 'runtime', strength: 0.7, permanent: true, when: isLong },
  too_old: { code: 'too_old', label: 'Feels dated', category: 'genre', strength: 0.4, permanent: true, when: isOld },
  too_serious: { code: 'too_serious', label: 'Too serious', category: 'tone', strength: 0.5, permanent: true, when: (m) => has(m, 'drama', 'history', 'war') },
  too_silly: { code: 'too_silly', label: 'Too silly', category: 'tone', strength: 0.5, permanent: true, when: (m) => has(m, 'comedy', 'animation', 'family') },
  cast_dislike: { code: 'cast_dislike', label: 'Don’t like the cast', category: 'cast', strength: 0.6, permanent: true },
  poor_ratings: { code: 'poor_ratings', label: 'Poor ratings', category: 'ratings', strength: 0.5, permanent: true, when: lowRated },
  subtitles: { code: 'subtitles', label: 'Subtitles', category: 'language', strength: 0.7, permanent: true, when: isForeign },
  dubbed: { code: 'dubbed', label: 'Dubbed audio', category: 'language', strength: 0.6, permanent: true, when: isForeign },
  period_setting: { code: 'period_setting', label: 'Period setting', category: 'genre', strength: 0.5, permanent: true, when: (m) => has(m, 'history', 'war') },
  already_seen_similar: { code: 'already_seen_similar', label: 'Already seen too many like it', category: 'familiarity', strength: 0.4, permanent: true },
  predictable: { code: 'predictable', label: 'Looks predictable', category: 'story', strength: 0.5, permanent: true },
  not_interested_subject: { code: 'not_interested_subject', label: 'Not interested in the subject', category: 'story', strength: 0.5, permanent: true },
  too_childish: { code: 'too_childish', label: 'Too childish', category: 'family', strength: 0.6, permanent: true, when: (m) => has(m, 'family', 'animation') },
  not_with_kids: { code: 'not_with_kids', label: 'Not watching with kids', category: 'context', strength: 0.3, permanent: false, when: (m) => has(m, 'family', 'animation') },
  animation_not_my_thing: { code: 'animation_not_my_thing', label: 'Animation isn’t my thing', category: 'genre', strength: 0.7, permanent: true, when: (m) => has(m, 'animation') },
  too_generic: { code: 'too_generic', label: 'Too generic', category: 'story', strength: 0.4, permanent: true, when: (m) => has(m, 'action', 'adventure') },
  too_unrealistic: { code: 'too_unrealistic', label: 'Too unrealistic', category: 'story', strength: 0.5, permanent: true, when: (m) => has(m, 'action', 'science fiction', 'fantasy') },

  // "Didn't like it" (watched) specifics.
  weak_story: { code: 'weak_story', label: 'Weak story', category: 'story', strength: 0.7, permanent: true },
  bad_acting: { code: 'bad_acting', label: 'Bad acting', category: 'quality', strength: 0.6, permanent: true },
  bad_characters: { code: 'bad_characters', label: 'Didn’t like the characters', category: 'story', strength: 0.6, permanent: true },
  too_confusing: { code: 'too_confusing', label: 'Too confusing', category: 'story', strength: 0.5, permanent: true },
  not_believable: { code: 'not_believable', label: 'Not believable', category: 'story', strength: 0.5, permanent: true },
  bad_ending: { code: 'bad_ending', label: 'Ending disappointed me', category: 'story', strength: 0.6, permanent: true },
  not_expected: { code: 'not_expected', label: 'Not what I expected', category: 'story', strength: 0.4, permanent: true },

  // High-rating positive chips ("Seen it" loved).
  great_story: { code: 'great_story', label: 'Great story', category: 'story', strength: 0.8, permanent: true },
  loved_characters: { code: 'loved_characters', label: 'Loved the characters', category: 'story', strength: 0.7, permanent: true },
  kept_hooked: { code: 'kept_hooked', label: 'Kept me hooked', category: 'pacing', strength: 0.7, permanent: true },
  smart_original: { code: 'smart_original', label: 'Smart or original', category: 'story', strength: 0.7, permanent: true },
  great_acting: { code: 'great_acting', label: 'Great acting', category: 'quality', strength: 0.7, permanent: true },
  perfect_pacing: { code: 'perfect_pacing', label: 'Perfect pacing', category: 'pacing', strength: 0.6, permanent: true },
  would_recommend: { code: 'would_recommend', label: 'Would recommend', category: 'quality', strength: 0.8, permanent: true },

  // "Not right now" — temporary context only, never permanent DNA.
  not_in_mood: { code: 'not_in_mood', label: 'Not in the mood', category: 'mood', strength: 0.2, permanent: false },
  watching_with_others: { code: 'watching_with_others', label: 'Watching with someone else', category: 'context', strength: 0.2, permanent: false },
  too_long_tonight: { code: 'too_long_tonight', label: 'Too long for tonight', category: 'context', strength: 0.2, permanent: false },
  too_dark_tonight: { code: 'too_dark_tonight', label: 'Too dark tonight', category: 'mood', strength: 0.2, permanent: false },
  want_lighter: { code: 'want_lighter', label: 'Want something lighter', category: 'mood', strength: 0.2, permanent: false },
  want_faster: { code: 'want_faster', label: 'Want something faster', category: 'mood', strength: 0.2, permanent: false },
  saving_for_later: { code: 'saving_for_later', label: 'Saving it for later', category: 'context', strength: 0.1, permanent: false },

  other: { code: 'other', label: 'Other', category: 'other', strength: 0.3, permanent: false },
};

export type ReasonBucket = 'not_for_me' | 'didnt_like' | 'not_right_now' | 'seen_high' | 'seen_low';

const BUCKET_CANDIDATES: Record<ReasonBucket, string[]> = {
  // Title-specific (gated) reasons first, so the most applicable ones surface;
  // generic catch-alls fill in only when little else matches.
  not_for_me: [
    'too_scary', 'supernatural', 'sci_fi', 'too_old', 'period_setting', 'subtitles', 'dubbed',
    'animation_not_my_thing', 'too_childish', 'too_violent', 'too_dark', 'too_slow', 'too_long',
    'too_serious', 'too_silly', 'poor_ratings', 'not_my_genre', 'story_not_interesting',
    'not_interested_subject', 'cast_dislike', 'predictable', 'already_seen_similar', 'too_generic', 'too_unrealistic',
  ],
  didnt_like: [
    'too_slow', 'predictable', 'weak_story', 'bad_characters', 'bad_acting', 'too_violent', 'too_dark',
    'too_confusing', 'not_believable', 'too_long', 'bad_ending', 'not_expected',
  ],
  not_right_now: [
    'not_in_mood', 'watching_with_others', 'too_long_tonight', 'too_dark_tonight', 'want_lighter', 'want_faster', 'saving_for_later',
  ],
  seen_high: ['great_story', 'loved_characters', 'kept_hooked', 'smart_original', 'great_acting', 'perfect_pacing', 'would_recommend'],
  seen_low: ['too_slow', 'predictable', 'weak_story', 'bad_characters', 'too_violent', 'too_dark', 'not_believable', 'bad_ending'],
};

/**
 * The most relevant reason chips for a title + bucket. Prioritizes reasons whose
 * `when` predicate matches this title's metadata, fills up to `max` with generic
 * ones, and always appends "Other" last. `not_right_now` and the "seen" buckets
 * aren't metadata-gated (they're about mood / the user's own reaction).
 */
export function reasonChipsFor(meta: TitleMetaLite | null, bucket: ReasonBucket, max = 7): ReasonDef[] {
  const codes = BUCKET_CANDIDATES[bucket];
  const gated = bucket === 'not_for_me' || bucket === 'didnt_like';
  const relevant: ReasonDef[] = [];
  const rest: ReasonDef[] = [];
  for (const code of codes) {
    const def = REASONS[code];
    if (!def) continue;
    if (gated && meta && def.when) {
      if (def.when(meta)) relevant.push(def);
      else rest.push(def);
    } else {
      relevant.push(def);
    }
  }
  const chosen = [...relevant, ...rest].slice(0, max);
  return [...chosen, REASONS.other!];
}

/** Codes → their display labels (for stored codes we render back). */
export function labelFor(code: string): string {
  return REASONS[code]?.label ?? code;
}
