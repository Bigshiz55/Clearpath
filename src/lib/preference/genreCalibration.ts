/**
 * GENRE CALIBRATION — deliberate genre statements, in the REAL model.
 *
 * A first-run user tells us how they feel about each broad genre on a 1–10
 * scale (or rules it out entirely). This module is the pure translation of
 * that statement into the preference engine's OWN vocabulary — there is no
 * second model here, and nothing new to consume:
 *
 *   • The event is an ordinary `PreferenceEvent` in the append-only log the
 *     engine already folds (`deriveDna`), carrying its genre in
 *     `event.genres` exactly the way a title event does.
 *   • Intensity rides on the EXISTING attraction grades — must_watch /
 *     interested / maybe_interested / not_interested / absolutely_not — whose
 *     differing strengths (1.1 / 0.8 / 0.3 / 0.8 / 1.2 in signals.ts) are
 *     what makes a 9 move the belief harder than a 6. No new signal shape,
 *     no new strength table.
 *   • "Not for me" maps to `absolutely_not`, the model's real negative
 *     affinity — the strongest permanent attraction signal it has.
 *
 * The genre VOCABULARY is the app's canonical one: derived from
 * `GENRE_IDS` (finderGenres), deduplicated by TMDB id so aliases
 * ("sci-fi", "scifi") collapse into their canonical name. Nothing here can
 * invent a genre the rest of the product doesn't recognise.
 *
 * PURE. No I/O, no clock — callers supply `at` and the event id.
 */
import { GENRE_IDS } from '@/lib/finderGenres';
import type { AttractionGrade, PreferenceEvent } from './types';

/**
 * TMDB genre names → the slug vocabulary the preference model stores.
 * THE one owner of this transform — `lib/dna.ts` imports it for fingerprint
 * ranking, and calibration events use it here, so the two writers can never
 * drift into different keys for the same genre.
 */
export function genreSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export interface CalibrationGenre {
  /** Engine slug — the key `ChannelProfile.genres` stores beliefs under. */
  slug: string;
  /** Human label, title-cased from the canonical name. */
  label: string;
  /** TMDB genre id — proof the genre exists in the canonical vocabulary. */
  tmdbId: number;
}

const label = (name: string) => name.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The broad canonical genre list, first-name-wins per TMDB id so each real
 * genre appears once under its canonical spelling.
 */
export const CALIBRATION_GENRES: CalibrationGenre[] = (() => {
  const seen = new Set<number>();
  const out: CalibrationGenre[] = [];
  for (const [name, tmdbId] of Object.entries(GENRE_IDS)) {
    if (seen.has(tmdbId)) continue;
    seen.add(tmdbId);
    out.push({ slug: genreSlug(name), label: label(name), tmdbId });
  }
  return out;
})();

export const CALIBRATION_GENRE_SLUGS = CALIBRATION_GENRES.map((g) => g.slug);

export interface GenreAnswer {
  /** One of CALIBRATION_GENRE_SLUGS. */
  slug: string;
  /** 1..10 preference; omitted when notForMe. */
  rating?: number;
  /** Explicit rule-out — the model's strongest negative attraction. */
  notForMe?: boolean;
}

/**
 * 1–10 → the existing attraction grades. The scale's intensity is expressed
 * through the grades' REAL strengths, not a new number:
 *
 *   1–2  absolutely_not   (the model's strongest permanent negative)
 *   3–4  not_interested
 *   5–6  maybe_interested (mild openness — the scale has no exact neutral)
 *   7–8  interested
 *   9–10 must_watch       (the strongest positive pull)
 */
export function gradeForRating(rating: number): AttractionGrade {
  if (rating <= 2) return 'absolutely_not';
  if (rating <= 4) return 'not_interested';
  if (rating <= 6) return 'maybe_interested';
  if (rating <= 8) return 'interested';
  return 'must_watch';
}

const NEGATIVE: ReadonlySet<AttractionGrade> = new Set(['not_interested', 'absolutely_not']);

/**
 * Build the ordinary preference event for one genre statement.
 *
 * `titleId` is genre-anchored (`genre:<slug>`) — the store's tmdb/media
 * extraction is best-effort and stores null for both, which is the truth:
 * this statement is about a genre, not a title. `event.genres` carries the
 * slug, which is the ONLY field the engine's genre learning reads
 * (`applySignal` step 3), so the statement lands exactly where a title's
 * genre evidence lands — same map, same math, same consumers.
 */
export function genreAnswerToEvent(
  answer: GenreAnswer,
  at: number,
  eventId: string,
): PreferenceEvent {
  const grade: AttractionGrade = answer.notForMe
    ? 'absolutely_not'
    : gradeForRating(Math.min(10, Math.max(1, Math.round(answer.rating ?? 5))));
  return {
    id: eventId,
    at,
    titleId: `genre:${answer.slug}`,
    genres: [answer.slug],
    action: NEGATIVE.has(grade) ? 'unseen_not_interested' : 'unseen_interested',
    attractionGrade: grade,
    source: 'genre-calibration',
  };
}
