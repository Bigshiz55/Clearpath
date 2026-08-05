'use client';

/**
 * ONE FETCH PER TITLE, SHARED BY EVERY PART OF THE CARD.
 *
 * The ratings endpoint already hydrates a title's full metadata to compute the
 * scores, so its synopsis is sitting right there. Two components now want it —
 * the ratings strip and the synopsis line — and a grid of twenty cards must not
 * turn that into forty requests. So the in-flight promise cache that used to
 * live inside `CardRatings` moves here and is keyed by title, not by consumer.
 *
 * Everything degrades to empty rather than throwing: a card that cannot load
 * its facts still renders its poster and title.
 */
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import type { CardFactsInput } from '@/lib/verdict/cardFacts';
import type { MediaType } from '@/lib/types';
import type { CardAvailability } from '@/lib/watchmode/cardAvailability';
import type { TileProviders } from '@/lib/availability/providerOptions';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

export interface TileFacts {
  ratings: TileRatings;
  /** TMDB's own synopsis. Null when TMDB has none — never a placeholder. */
  overview: string | null;
  /** Length, certificate, genre, size of the run — see `verdict/cardFacts`. */
  facts: CardFactsInput | null;
  /** Cached Watchmode streaming sources — a DB read on the server side of
   *  this same request, never a second client fetch. See
   *  src/lib/watchmode/cardAvailability.ts. */
  availability: CardAvailability;
  /**
   * TMDB/report providers from the SAME hydration that produced the score.
   * The truthful fallback for the (very common) case where the Watchmode
   * enrichment cache has no row for this title — see
   * src/lib/availability/providerOptions.ts. Null when the request failed or
   * TMDB returned nothing for the region; an empty `options` array is a
   * RESULT ("nothing streams this here") and is not the same thing.
   */
  providers: TileProviders | null;
}

const EMPTY_AVAILABILITY: CardAvailability = { status: 'unconfirmed', sources: [], checkedAt: null };
const EMPTY: TileFacts = { ratings: EMPTY_TILE_RATINGS, overview: null, facts: null, availability: EMPTY_AVAILABILITY, providers: null };

const cache = new Map<string, Promise<TileFacts>>();

export function loadTileFacts(mediaType: MediaType, tmdbId: number): Promise<TileFacts> {
  const key = `${mediaType}:${tmdbId}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/ratings/${mediaType}/${tmdbId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`ratings fetch failed: ${r.status}`);
        return r.json();
      })
      .then((d) => ({
        ratings: (d?.ratings as TileRatings) ?? EMPTY_TILE_RATINGS,
        overview: typeof d?.overview === 'string' && d.overview.trim() ? (d.overview as string) : null,
        facts: (d?.facts as CardFactsInput | null) ?? null,
        availability: (d?.availability as CardAvailability | undefined) ?? EMPTY_AVAILABILITY,
        providers: (d?.providers as TileProviders | null | undefined) ?? null,
      }))
      .catch(() => {
        // A genuine failure (offline, a dropped connection, a non-2xx/non-JSON
        // response) must not be remembered as "this title has no facts"
        // forever — that would permanently stick every card for this title on
        // "Availability not currently confirmed" for the rest of the session,
        // even once the network recovers. Evict so the NEXT mount retries;
        // this call still resolves to EMPTY so the current render doesn't hang.
        cache.delete(key);
        reportReliabilityEvent('availability_resolution_failure', { mediaType });
        return EMPTY;
      });
    cache.set(key, p);
  }
  return p;
}
