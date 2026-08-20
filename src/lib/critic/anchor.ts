/**
 * ANCHOR IDENTITY — turning a name somebody typed into a work we can reason about.
 *
 * ── WHY THIS IS A SAFETY LAYER, NOT A LOOKUP ──────────────────────────────
 * GC8 made the critic signal move ranking. That promotes identity from a
 * nicety to a hazard: the term now pushes candidates relative to whatever it
 * believes the anchors are, with conviction. Resolving "Dune" to the wrong Dune
 * does not merely degrade the answer, it inverts the argument against the wrong
 * work — and the user is told we understood them.
 *
 * So a `ResolvedAnchor` must never mean "search returned something". It means
 * identity resolution SUCCEEDED. Everything else is `ambiguous` or `not_found`,
 * and neither may touch ranking.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 *     const hit = (await searchTitles(name).catch(() => []))[0];   // ask/route.ts:48
 *
 * Search-result order is POPULARITY. Popularity is not identity. That line
 * silently answers "Dune" with the 2021 film, "It" with the 2017 one, "Fargo"
 * with the movie rather than the series — and when it finds nothing it drops
 * the anchor and proceeds as though the request had been understood.
 *
 * ── THE MATCHER IS NOT NEW ────────────────────────────────────────────────
 * Identity rules come from `@/lib/packs/tmdbMatch`, ported unchanged from the
 * Lifetime work where the same popularity-as-identity defect was found and
 * fixed: exact normalized title (case, accents, punctuation and a leading
 * article are noise; a different WORD is a different title), media type as a
 * hard constraint, year as filter and tie-break, and — critically — a refusal
 * when more than one candidate survives. This file adds no new matching
 * algorithm; it adds the OUTCOME TYPE the critic needs and the rule that only
 * a resolved anchor may vote.
 *
 * PURE. Takes candidates, returns a verdict. The caller does the network, and
 * `criticNudge` never calls anything.
 */

import { pickMatch, normalizeTitle, type TmdbCandidate } from '@/lib/packs/tmdbMatch';
import type { CriticObjective, CriticRelation, ResolvedAnchor } from './objective';
import { objectiveAuthority } from './objective';

/**
 * A search result, in the shape identity resolution needs.
 *
 * `recognisability` is carried but NEVER consulted by the matcher — identity is
 * decided by title, media type and year, and popularity-as-identity is the
 * defect this file's header names. It exists solely so that WHEN the matcher
 * refuses and the user has to be asked, the alternatives can be listed with the
 * best-known one first. Ordering a question is not answering it.
 */
export type AnchorCandidate = TmdbCandidate & {
  /** TMDB popularity, when the search payload carried it. Display order only. */
  recognisability?: number | null;
  /** Cumulative vote count — how many people have an opinion. Display order
   *  only, and a better prior than popularity, which decays. */
  audience?: number | null;
};

export interface AnchorRequest {
  /** Exactly what the user typed — the label, and the round-trip key. */
  spokenAs: string;
  /**
   * The title to MATCH on, when the words the user said carry more than the
   * name: "Taken 2008" and "the Taken movie" are labels, not titles, and
   * matching on them finds nothing. Defaults to `spokenAs`, so a caller that
   * reads no cues behaves exactly as before. See `anchorSpan.ts`.
   */
  matchTitle?: string;
  /** Narrows identity when the request stated or implied it. */
  mediaType?: 'movie' | 'tv';
  /** Narrows identity when stated or recoverable. */
  year?: number | null;
}

/** One of the alternatives, when we cannot tell which was meant. */
export interface AnchorOption {
  tmdbId: number;
  title: string;
  mediaType: 'movie' | 'tv';
  year: number | null;
  /** Display order only — see AnchorCandidate. Absent when unknown. */
  recognisability?: number | null;
  /** Display order only — cumulative audience evidence. Absent when unknown. */
  audience?: number | null;
}

export type AnchorResolution =
  | { status: 'resolved'; anchor: ResolvedAnchor }
  /** We know the name but not the work. Enough detail to ASK. */
  | { status: 'ambiguous'; spokenAs: string; options: AnchorOption[] }
  | { status: 'not_found'; spokenAs: string };

/** The canonical engine key. Never a display string. */
export const canonicalKey = (mediaType: 'movie' | 'tv', tmdbId: number): string =>
  `${mediaType}:${tmdbId}`;

/**
 * Resolve one named anchor against a candidate list.
 *
 * Returns `ambiguous` rather than choosing whenever the evidence genuinely does
 * not separate two works — which is the entire point. An interactive surface
 * can ask; a server ranking path degrades that anchor to zero authority. What
 * neither may do is guess and then report the objective as understood.
 */
export function resolveAnchor(
  req: AnchorRequest,
  candidates: readonly AnchorCandidate[],
): AnchorResolution {
  const spokenAs = req.spokenAs.trim();
  if (!spokenAs) return { status: 'not_found', spokenAs: req.spokenAs };
  /* MATCH ON THE TITLE, LABEL WITH THE WORDS. Identity compares against the
     name; everything the user said around it ("2008", "the … movie") is a cue,
     not part of the name, and matching on the whole span finds nothing. */
  const matchTitle = (req.matchTitle ?? spokenAs).trim() || spokenAs;

  /* MEDIA TYPE IS IDENTITY, NOT A PREFERENCE. "The Office" the series and a
     same-named film are different works, so a stated type EXCLUDES rather than
     down-weights. `pickMatch` applies this too; narrowing here as well is what
     lets the ambiguity report below list only real alternatives. */
  const pool = req.mediaType
    ? candidates.filter((c) => c.mediaType === req.mediaType)
    : candidates;

  const match = pickMatch(
    { title: matchTitle, releaseYear: req.year ?? null, expectedMediaType: req.mediaType ?? null },
    pool,
  );

  if (match) {
    return {
      status: 'resolved',
      anchor: {
        titleId: canonicalKey(match.mediaType, match.id),
        tmdbId: match.id,
        mediaType: match.mediaType,
        spokenAs,
        /* Deliberately NO dims here. Loading the fingerprint is GC3's job, and
           an anchor without one earns zero authority — so an identity we
           resolved but cannot yet describe stays silent instead of pretending
           to be neutral. */
        confidence: 1,
      },
    };
  }

  /* THE MATCHER REFUSED. Two reasons are possible and they are different
     answers to the user, so they are different statuses: several works share
     the exact name (ask which), or nothing shares it (say we do not know it). */
  const want = normalizeTitle(matchTitle);
  const exact = pool.filter((c) => normalizeTitle(c.title ?? '') === want);
  if (exact.length > 1) {
    return {
      status: 'ambiguous',
      spokenAs,
      options: exact.map((c) => ({
        tmdbId: c.id,
        title: c.title,
        mediaType: c.mediaType,
        year: c.year,
        recognisability: c.recognisability ?? null,
        audience: c.audience ?? null,
      })),
    };
  }
  return { status: 'not_found', spokenAs };
}

/**
 * Fold resolutions into an objective ranking can act on.
 *
 * `requested` is how many anchors the user actually named. It matters: dropping
 * an ambiguous anchor and computing authority over only what survived would
 * report a half-understood request as fully understood, which is precisely the
 * silent degradation this gate exists to prevent.
 */
export function anchorsToObjective(
  relation: CriticRelation,
  resolutions: readonly AnchorResolution[],
  opts: { requested?: number } = {},
): CriticObjective {
  const anchors = resolutions
    .filter((r): r is Extract<AnchorResolution, { status: 'resolved' }> => r.status === 'resolved')
    .map((r) => r.anchor);
  const requested = Math.max(opts.requested ?? resolutions.length, anchors.length, 1);
  // Pad the denominator with the anchors we could NOT place, so coverage is
  // measured against what was asked rather than against what happened to work.
  const padded: ResolvedAnchor[] = [
    ...anchors,
    ...Array.from({ length: Math.max(0, requested - anchors.length) }, (_, i) => ({
      titleId: '',
      tmdbId: -1 - i,
      mediaType: 'movie' as const,
      spokenAs: '',
      confidence: 0,
    })),
  ];
  return { relation, anchors, authority: objectiveAuthority(padded) };
}

/** Anchors we could not place, for a surface that wants to ask. */
export function unresolved(resolutions: readonly AnchorResolution[]) {
  return resolutions.filter((r) => r.status !== 'resolved');
}
