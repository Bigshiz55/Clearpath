/**
 * IS THIS ACTUALLY THE FILM WE ASKED FOR?
 *
 * THE FAILURE THIS EXISTS TO MAKE IMPOSSIBLE. Showdown displayed anime artwork
 * beside "Making a Murderer" and a Russian series beside "The Great British Bake
 * Off". Nothing errored. The cause is not a bug in the fetch — the fetch worked
 * perfectly:
 *
 *   Each diagnostic title carries a HAND-AUTHORED `tmdbId`. TMDB ids are
 *   namespaced per media type and are otherwise arbitrary, so a typed number is
 *   a guess that always resolves to SOMETHING. `survivor` is recorded as
 *   `tv:810`. The poster route fetched `tv/810`, TMDB returned a real series
 *   with a real poster, and the app rendered it under the label "Survivor".
 *
 * The application had no concept of "that is the wrong film". It asked for an
 * id, got a title back, and showed the artwork — never once comparing the name
 * it received to the name it was going to print underneath. Every id in the
 * catalogue is one typo away from doing this, and the failure is SILENT: a
 * plausible poster under a wrong name looks like a working feature.
 *
 * So identity is now something a title EARNS, not something it declares.
 * Nothing reaches the screen — or the evidence log — until the name and year
 * TMDB returned have been checked against the name and year we intend to
 * display. A title that cannot be verified renders the typographic treatment
 * and is withheld from the diagnostic pool, because a matchup the player cannot
 * identify is not a question, it is noise that contaminates the profile.
 *
 * WHY IT ALSO CORRECTS RATHER THAN ONLY REJECTING. The catalogue's real content
 * is its trait vectors and its human-readable names; the ids were always the
 * weakest part of it. When the recorded id turns out to be someone else's work,
 * a title+year search usually finds the right one, and accepting a SEARCH result
 * that passes the same verification is strictly safer than trusting an id that
 * has already been proven wrong.
 *
 * PURE. The matching is arithmetic on strings and years; the network lives in
 * the resolver that calls this.
 */

/** What the catalogue claims a title is. */
export interface ClaimedIdentity {
  /** Diagnostic catalogue id, e.g. "making-a-murderer". */
  id: string;
  title: string;
  year: number;
  mediaType: 'movie' | 'tv';
}

/** What an upstream source says exists at some id. */
export interface ObservedIdentity {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  /** Original-language title, when the source provides one. */
  originalTitle?: string | null;
  year: number | null;
  posterPath?: string | null;
}

export type IdentityVerdict =
  | { ok: true; confidence: number; matchedOn: 'exact' | 'normalised' | 'original-title' }
  | { ok: false; reason: string };

/**
 * Comparison form: case, accents, punctuation and leading articles removed.
 *
 * TMDB is inconsistent about the definite article ("The Office" vs "Office") and
 * about punctuation in ways that are pure noise for identity — while being
 * completely reliable about which WORK a record describes. Normalising the noise
 * is what stops a correct match being rejected; nothing here loosens the check
 * enough to let a different work through, because two different works do not
 * share a normalised name and a release year.
 */
export function normaliseTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * How far a year may differ before it stops being the same work.
 *
 * TWO, NOT ZERO. A series' `first_air_date` is its premiere, and a catalogue
 * entry may record the season people mean; a film's release year differs by
 * region and between festival and general release. Two years absorbs that and
 * still rejects a remake, which is the case that actually matters — a 1978 and a
 * 2018 Halloween share a name and are not the same recommendation.
 */
export const YEAR_TOLERANCE = 2;

export function verifyIdentity(
  claimed: ClaimedIdentity,
  observed: ObservedIdentity | null,
): IdentityVerdict {
  if (!observed) return { ok: false, reason: 'no upstream record' };

  /* MEDIA TYPE FIRST. `movie:1396` and `tv:1396` are unrelated works, so a type
     mismatch is not a near miss — it is a different namespace entirely, and
     every other check below would be comparing against the wrong catalogue. */
  if (observed.mediaType !== claimed.mediaType) {
    return {
      ok: false,
      reason: `media type ${observed.mediaType} != claimed ${claimed.mediaType}`,
    };
  }

  const want = normaliseTitle(claimed.title);
  const got = normaliseTitle(observed.title);
  const gotOriginal = observed.originalTitle ? normaliseTitle(observed.originalTitle) : null;

  const yearOk =
    observed.year === null || Math.abs(observed.year - claimed.year) <= YEAR_TOLERANCE;

  if (want === got) {
    /* A NAME MATCH WITH A WRONG YEAR IS THE REMAKE CASE, and it is the one place
       where being strict matters most: the artwork would be real, the name would
       be right, and the film would be the wrong one. */
    if (!yearOk) {
      return {
        ok: false,
        reason: `title matches but year ${observed.year} != ${claimed.year} (likely a remake or a different season)`,
      };
    }
    return {
      ok: true,
      confidence: observed.year === claimed.year ? 1 : 0.9,
      matchedOn: observed.title === claimed.title ? 'exact' : 'normalised',
    };
  }

  if (gotOriginal && gotOriginal === want && yearOk) {
    // A localised title differs from the original; matching either is enough.
    return { ok: true, confidence: 0.85, matchedOn: 'original-title' };
  }

  return {
    ok: false,
    reason: `upstream title "${observed.title}"${observed.year ? ` (${observed.year})` : ''} != claimed "${claimed.title}" (${claimed.year})`,
  };
}

/**
 * Pick the best verified candidate from a search.
 *
 * USED ONLY AFTER THE RECORDED ID HAS ALREADY FAILED. A search result is weaker
 * evidence than an id, so it has to clear exactly the same verification — the
 * point is not to be lenient when the id is wrong, it is to have a second source
 * that can also be checked. Ties break on the earliest result, which is TMDB's
 * own relevance order.
 */
export function pickVerified(
  claimed: ClaimedIdentity,
  candidates: readonly ObservedIdentity[],
): { observed: ObservedIdentity; confidence: number } | null {
  let best: { observed: ObservedIdentity; confidence: number } | null = null;
  for (const c of candidates) {
    const verdict = verifyIdentity(claimed, c);
    if (!verdict.ok) continue;
    if (!best || verdict.confidence > best.confidence) {
      best = { observed: c, confidence: verdict.confidence };
    }
  }
  return best;
}

/** A title's identity after verification — the only shape allowed downstream. */
export interface ResolvedIdentity {
  /** Diagnostic catalogue id. */
  id: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number;
  posterPath: string | null;
  confidence: number;
  /** How it was established. `recorded` means the catalogue's id was correct. */
  via: 'recorded' | 'search';
}

/** Why a title could not be verified. Reported, never silently swallowed. */
export interface UnverifiedIdentity {
  id: string;
  claimed: { title: string; year: number; mediaType: 'movie' | 'tv'; tmdbId: number };
  reason: string;
}

export interface IdentityReport {
  resolved: ResolvedIdentity[];
  unverified: UnverifiedIdentity[];
  /** Titles whose recorded `tmdbId` pointed at a different work. The real bug list. */
  corrected: Array<{ id: string; recorded: number; actual: number; wasShowing: string }>;
}

/**
 * Resolve one title, correcting the recorded id when it turns out to be wrong.
 *
 * The two fetches are injected rather than imported so this is testable without
 * a network or a key — which is the only reason the regression tests for the
 * three known failures can exist at all in an environment with neither.
 */
export async function resolveIdentity(
  claimed: ClaimedIdentity,
  recordedTmdbId: number,
  fetchById: (mediaType: 'movie' | 'tv', id: number) => Promise<ObservedIdentity | null>,
  search: (title: string, year: number, mediaType: 'movie' | 'tv') => Promise<ObservedIdentity[]>,
): Promise<
  | { ok: true; identity: ResolvedIdentity; corrected: null | { recorded: number; wasShowing: string } }
  | { ok: false; unverified: UnverifiedIdentity }
> {
  let wasShowing = '';
  try {
    const observed = await fetchById(claimed.mediaType, recordedTmdbId);
    const verdict = verifyIdentity(claimed, observed);
    if (verdict.ok && observed) {
      return {
        ok: true,
        corrected: null,
        identity: {
          id: claimed.id,
          tmdbId: observed.tmdbId,
          mediaType: observed.mediaType,
          title: claimed.title,
          year: claimed.year,
          posterPath: observed.posterPath ?? null,
          confidence: verdict.confidence,
          via: 'recorded',
        },
      };
    }
    if (observed) wasShowing = `${observed.title}${observed.year ? ` (${observed.year})` : ''}`;
  } catch {
    /* fall through to search — an upstream failure is not proof the id is wrong */
  }

  try {
    const candidates = await search(claimed.title, claimed.year, claimed.mediaType);
    const picked = pickVerified(claimed, candidates);
    if (picked) {
      return {
        ok: true,
        corrected: { recorded: recordedTmdbId, wasShowing: wasShowing || '(unfetchable)' },
        identity: {
          id: claimed.id,
          tmdbId: picked.observed.tmdbId,
          mediaType: picked.observed.mediaType,
          title: claimed.title,
          year: claimed.year,
          posterPath: picked.observed.posterPath ?? null,
          // A search-derived identity is never treated as certain as a verified
          // recorded id, even when both pass the same check.
          confidence: picked.confidence * 0.95,
          via: 'search',
        },
      };
    }
  } catch {
    /* nothing verifiable — fall through to unverified */
  }

  return {
    ok: false,
    unverified: {
      id: claimed.id,
      claimed: {
        title: claimed.title,
        year: claimed.year,
        mediaType: claimed.mediaType,
        tmdbId: recordedTmdbId,
      },
      reason: wasShowing
        ? `recorded id ${recordedTmdbId} is "${wasShowing}", and no search result verified`
        : `recorded id ${recordedTmdbId} did not resolve, and no search result verified`,
    },
  };
}

/**
 * WHICH TITLES THE GAME MAY DEAL, given what verification came back with.
 *
 * THE DISTINCTION THAT MATTERS: "checked and wrong" is not "could not check".
 *
 * If some titles verified and others did not, the checker demonstrably works and
 * the failures are real mismatches — those titles must never be dealt, because
 * the player would be shown a name we cannot prove we have the right work for.
 *
 * If NOTHING verified, the checker itself is unavailable: no TMDB key, a dead
 * upstream, an offline device. Excluding the whole catalogue there would take a
 * fully playable game — correct names, correct trait vectors, designed
 * typographic tiles — and replace it with an empty screen, on the strength of a
 * network failure. Artwork is worth a fetch; it is not worth the game.
 */
export function poolExclusions(report: {
  verified: readonly { id: string }[];
  unverified: readonly { id: string }[];
}): { exclude: string[]; reason: 'mismatch' | 'checker-unavailable' } {
  if (report.verified.length === 0) return { exclude: [], reason: 'checker-unavailable' };
  return { exclude: report.unverified.map((u) => u.id), reason: 'mismatch' };
}
