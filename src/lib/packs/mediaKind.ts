/**
 * IS THIS PROGRAMME A FILM, OR IS IT NOT?
 *
 * ── THE DEFECT THIS EXISTS TO FIX ─────────────────────────────────────────
 * The Movie Vault filter asked exactly one question — "is `tmdb_media_type`
 * equal to 'movie'?" — and treated every other answer as unknown. Measured on
 * the real Lifetime stations: 18 of 20 distinct programmes had a null
 * `tmdb_media_type`, so 90% of the Pack was unclassifiable and the strict
 * filter removed all of it.
 *
 * That is not a filter problem. `tmdb_media_type` is written in exactly one
 * place — `resolveProgrammeTmdbId` in `dna.ts` — whose only caller is
 * `/api/packs/similar`, an on-demand endpoint that resolves ONE programme when
 * a user opens ONE title. Nothing has ever populated it in bulk. The two
 * matched rows were two titles somebody happened to click.
 *
 * ── THE EVIDENCE THAT WAS ALREADY THERE ───────────────────────────────────
 * Meanwhile `tv_programmes` has carried the provider's own answer since
 * migration 0032 and nothing read it:
 *
 *   programme_type   written by BOTH ingest writers on every row.
 *                    TV Media: `showTypeID === 'M'` -> 'movie' (the provider's
 *                    own movie flag, from its documented contract).
 *                    TVmaze:   `show.type === 'Movie'` -> 'movie', scripted /
 *                    animation / reality -> 'series', plus news and sports.
 *   season_number    the provider describing a specific instalment of a run.
 *   episode_number   same.
 *
 * So the answer is to READ THE DURABLE IDENTIFIERS THE PROVIDER ALREADY SENT
 * rather than to wait on a title-string search that nothing schedules. None of
 * this infers anything from a title's name, and none of it assumes a Lifetime
 * airing is a film because it aired on Lifetime.
 *
 * ── WHY THIS ORDER ────────────────────────────────────────────────────────
 * An EXPLICIT claim beats a STRUCTURAL inference, and structure beats silence:
 *
 *   1. TMDB      an external resolved identity; the strongest thing available.
 *   2. Provider  the feed's own type field, on every row, from its contract.
 *   3. Structure season/episode numbers, consulted only when 1 and 2 are silent.
 *   4. Nothing   unknown, which the Vault treats as ineligible.
 *
 * Structure is deliberately LAST and never vetoes an explicit claim, because
 * TVmaze delivers films as episode objects on its schedule feed (`m.episode
 * .season` / `.number` in `tvmazeIngest`), so a genuine movie can arrive
 * carrying episode numbers. Letting structure override would throw away real
 * films — the failure the assignment names as "an empty catalog is also a
 * failure".
 *
 * ── AND WHY CONTRADICTION IS NOT A TIE-BREAK ──────────────────────────────
 * When TMDB and the provider BOTH state a type and disagree, this returns
 * unknown rather than picking a winner. TMDB ids on these rows come from a
 * title-string search, which is fallible; a disagreement means one of the two
 * is wrong and there is no way to tell which. Silently preferring TMDB would
 * admit a series as a film every time the search matched the wrong title —
 * precisely the false-positive class that must not grow.
 *
 * PURE. No I/O, no network, no clock.
 */

/**
 * What can actually be established about a programme.
 *
 * `not-film` rather than `series` on purpose: news and sports land here too,
 * and calling a Tuesday newscast a "series" would be asserting more than the
 * evidence supports. The only distinction anything downstream needs is whether
 * the thing is a film.
 */
export type MediaKind = 'film' | 'not-film' | 'unknown';

/** Which signal decided it — reported so a diagnostic can show the mix. */
export type MediaKindSource =
  /** TMDB media type, from a resolved match. */
  | 'tmdb'
  /** `tv_programmes.programme_type`, from the provider's own feed. */
  | 'provider-type'
  /** Season/episode numbering, in the absence of any explicit claim. */
  | 'episode-structure'
  /** Two explicit claims that disagree. Deliberately undecidable. */
  | 'conflict'
  /** No signal at all. */
  | 'none';

export interface MediaKindEvidence {
  /** `tv_programmes.tmdb_media_type`. Null until something matches the row. */
  tmdbMediaType?: 'movie' | 'tv' | null;
  /** `tv_programmes.programme_type` — the provider's declared vocabulary. */
  programmeType?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export interface MediaKindVerdict {
  kind: MediaKind;
  source: MediaKindSource;
}

/**
 * The provider vocabulary, from migration 0032's own comment:
 * `movie|series|sports|news|kids|special`, plus TV Media's 'other'.
 *
 * ONLY THE DECISIVE MEMBERS ARE LISTED. 'special', 'kids' and 'other' are
 * catch-alls — the value each writer emits when it could not classify the row —
 * so treating them as evidence would be reading a shrug as an answer. They fall
 * through to structure, and then to unknown.
 */
const PROVIDER_FILM = new Set(['movie']);
const PROVIDER_NOT_FILM = new Set(['series', 'news', 'sports']);

function providerClaim(programmeType: string | null | undefined): MediaKind {
  const t = (programmeType ?? '').trim().toLowerCase();
  if (!t) return 'unknown';
  if (PROVIDER_FILM.has(t)) return 'film';
  if (PROVIDER_NOT_FILM.has(t)) return 'not-film';
  return 'unknown';
}

/** A row the provider numbered as an instalment of a run. */
function isEpisodic(e: MediaKindEvidence): boolean {
  return (e.seasonNumber ?? null) !== null || (e.episodeNumber ?? null) !== null;
}

export function resolveMediaKind(e: MediaKindEvidence): MediaKindVerdict {
  const tmdb: MediaKind =
    e.tmdbMediaType === 'movie' ? 'film' : e.tmdbMediaType === 'tv' ? 'not-film' : 'unknown';
  const provider = providerClaim(e.programmeType);

  // Two explicit claims that contradict each other are not a tie to be broken.
  if (tmdb !== 'unknown' && provider !== 'unknown' && tmdb !== provider) {
    return { kind: 'unknown', source: 'conflict' };
  }
  if (tmdb !== 'unknown') return { kind: tmdb, source: 'tmdb' };
  if (provider !== 'unknown') return { kind: provider, source: 'provider-type' };
  if (isEpisodic(e)) return { kind: 'not-film', source: 'episode-structure' };
  return { kind: 'unknown', source: 'none' };
}

/**
 * The kind a matcher should CONSTRAIN its search to, or null for no constraint.
 *
 * Used to stop a title search returning a series for a row the provider already
 * called a film (and the reverse). It reads only evidence that exists before any
 * TMDB call, so it can narrow the search that produces `tmdbMediaType` without
 * depending on it.
 */
export function expectedTmdbMediaType(
  e: Omit<MediaKindEvidence, 'tmdbMediaType'>,
): 'movie' | 'tv' | null {
  const verdict = resolveMediaKind({ ...e, tmdbMediaType: null });
  if (verdict.kind === 'film') return 'movie';
  if (verdict.kind === 'not-film') return 'tv';
  return null;
}
