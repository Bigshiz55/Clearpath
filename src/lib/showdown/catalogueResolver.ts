import 'server-only';

import { getTitle, searchTitles } from '@/lib/tmdb/client';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { mediaTypeFor } from './mediaType';
import {
  resolveIdentity,
  type ObservedIdentity,
  type ResolvedIdentity,
  type UnverifiedIdentity,
} from './identity';

/**
 * ONE VERIFIED CATALOGUE, SHARED BY EVERY CONSUMER.
 *
 * Both the artwork endpoint and the evidence write path need to know which
 * TMDB record a diagnostic title actually is, and they must never disagree —
 * showing the corrected poster while filing evidence against the wrong id would
 * fix the visible half of the bug and leave the damaging half in place. A
 * mis-attributed poster is embarrassing for one screen; mis-attributed evidence
 * is permanent and invisible.
 *
 * MEMOISED FOR THE PROCESS. The catalogue is fixed and identical for everyone,
 * so this is ~113 upstream calls once per process, not per player. The promise
 * itself is cached rather than the result, so concurrent callers share one
 * resolution instead of stampeding.
 *
 * A FAILED RESOLUTION IS NOT CACHED AS SUCCESS. If the whole catalogue comes
 * back unverified — no key, dead upstream — the memo is cleared so the next
 * request tries again rather than serving a broken catalogue for the life of
 * the process.
 */

export interface VerifiedCatalogue {
  verified: ResolvedIdentity[];
  unverified: UnverifiedIdentity[];
  corrected: Array<{ id: string; recorded: number; actual: number; wasShowing: string }>;
  /** Catalogue id → verified canonical engine key, e.g. "tv:19885". */
  canonicalIds: Record<string, string>;
  posters: Record<string, string>;
}

async function fetchById(mediaType: 'movie' | 'tv', id: number): Promise<ObservedIdentity | null> {
  const meta = await getTitle(mediaType, id);
  return {
    tmdbId: meta.id,
    mediaType,
    title: meta.title,
    originalTitle: meta.originalTitle ?? null,
    year: meta.year,
    posterPath: meta.posterPath ?? null,
  };
}

async function search(
  title: string,
  year: number,
  mediaType: 'movie' | 'tv',
): Promise<ObservedIdentity[]> {
  const rows = await searchTitles(title, { year });
  return rows
    .filter((r) => r.mediaType === mediaType)
    .map((r) => ({
      tmdbId: r.id,
      mediaType: r.mediaType as 'movie' | 'tv',
      title: r.title,
      year: r.year,
      posterPath: r.posterPath,
    }));
}

let memo: Promise<VerifiedCatalogue> | null = null;

async function build(): Promise<VerifiedCatalogue> {
  const settled = await Promise.allSettled(
    TITLES.map((t) =>
      resolveIdentity(
        { id: t.id, title: t.title, year: t.year, mediaType: mediaTypeFor(t.id) },
        t.tmdbId,
        fetchById,
        search,
      ),
    ),
  );

  const out: VerifiedCatalogue = {
    verified: [],
    unverified: [],
    corrected: [],
    canonicalIds: {},
    posters: {},
  };

  for (const [i, r] of settled.entries()) {
    const t = TITLES[i]!;
    if (r.status !== 'fulfilled') {
      out.unverified.push({
        id: t.id,
        claimed: { title: t.title, year: t.year, mediaType: mediaTypeFor(t.id), tmdbId: t.tmdbId },
        reason: 'identity check failed upstream',
      });
      continue;
    }
    if (!r.value.ok) {
      out.unverified.push(r.value.unverified);
      continue;
    }
    const id = r.value.identity;
    out.verified.push(id);
    out.canonicalIds[t.id] = `${id.mediaType}:${id.tmdbId}`;
    if (id.posterPath) out.posters[t.id] = id.posterPath;
    if (r.value.corrected) {
      out.corrected.push({
        id: t.id,
        recorded: r.value.corrected.recorded,
        actual: id.tmdbId,
        wasShowing: r.value.corrected.wasShowing,
      });
    }
  }
  return out;
}

export async function resolveCatalogue(): Promise<VerifiedCatalogue> {
  if (!memo) {
    memo = build().catch((e) => {
      memo = null;
      throw e;
    });
  }
  const result = await memo;
  // Nothing verified means the checker itself was unavailable — do not hold that
  // for the life of the process.
  if (result.verified.length === 0) memo = null;
  return result;
}
