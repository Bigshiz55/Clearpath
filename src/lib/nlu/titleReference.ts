/**
 * WHICH TITLE DID THEY ACTUALLY NAME?
 *
 * "Looking for a boxing movie kinda like Rocky or Cinderella Man that I
 * probably haven't seen" returned The Adventures of Jimmy Neutron.
 *
 * Two failures compounded:
 *
 *   1. The reference was taken as ONE string — the whole tail of the sentence,
 *      "Rocky or Cinderella Man that I probably haven't seen". That is not a
 *      title. It is two titles and a clause.
 *
 *   2. It was then matched against TMDB results with a raw substring test, so
 *      "Man", "Seen" and "That" all counted as matches. The first junk result
 *      became the seed, its media type became the filter, and a boxing request
 *      turned into a cartoon shortlist filtered to Shows.
 *
 * THE CINDERELLA MAN PROBLEM is the same bug at its sharpest: a substring test
 * cannot tell "Cinderella Man" from "Cinderella". It matches in BOTH directions
 * — ask for the boxing picture, get the fairy tale; ask for the fairy tale, get
 * the boxing picture. There is no popularity ranking that fixes this, because
 * whichever film is more famous wins both questions.
 *
 * The rule here: A NAMED TITLE RESOLVES ONLY TO AN EXACT TITLE. "Cinderella
 * Man" contains "Cinderella", and containment is not identity. When nothing
 * matches exactly we return NOTHING and say why, rather than substituting the
 * nearest famous thing — the caller then falls back to ordinary search, which
 * is a worse answer but an honest one.
 *
 * Pure. No I/O. `titleNormalize.ts` supplies the tiering; this decides what to
 * do with it.
 */
import { titleMatchTier, normalizeTitle, type TitleMatchTier } from '@/lib/nlu/titleNormalize';

/**
 * Clauses people tack onto a comparison that are not part of any title.
 *
 * "…that I probably haven't seen" is the one that broke it. Matching a fixed
 * word order does not survive real English — "probably haven't seen", "haven't
 * seen", "I've never seen", "I would like" all mean the same thing and none of
 * them agree on where the negation goes. So: a first-person pronoun, then a
 * viewing or preference verb within a short span, and everything from the
 * pronoun onward is the clause.
 */
const TRAILING_CLAUSE =
  /\s*[,;]?\s*(?:\b(?:that|which|but)\s+)?\b(?:i|we)\b[^.?!]{0,40}?\b(?:seen|watched|caught|like|liked|enjoy|enjoyed|love|loved|dig|want|need)\b.*$/i;

/** The other tail: who it is for, and when. */
const TRAILING_ASK = /\s*[,;]?\s*\b(?:for (?:me|us)|please|tonight|preferably|if possible)\b.*$/i;

/**
 * Cut a trailing clause off — but NEVER when it starts at position 0.
 *
 * "I Love You, Man" is a real film, and it is a pronoun followed by a
 * preference verb. A title cannot be entirely trailing clause, so a match at
 * the very start is proof we have matched the title itself.
 */
function cutTrailing(s: string, re: RegExp): string {
  const m = s.match(re);
  if (!m || m.index === undefined || m.index === 0) return s;
  return s.slice(0, m.index);
}

/** Leading noise between the comparison cue and the title itself. */
const LEADING_NOISE = /^\s*(?:to|the movie|the show|the film|maybe|either|both|something|anything|some|a|an)\s+/i;

/**
 * Splitters between two titles in one comparison: "Rocky or Cinderella Man",
 * "Heat and Sicario", "Fargo, No Country for Old Men".
 *
 * NOT split on: a comma or "and" INSIDE a title. We cannot know for certain,
 * so both readings are produced and the resolver keeps whichever actually
 * exists — "Sex, Lies, and Videotape" survives because the whole string
 * resolves exactly and the fragments do not.
 */
const SPLITTERS = /\s*(?:\bor\b|\band\b|\/|,|;|\+|&)\s*/i;

/** Trim a single candidate down to something that could be a title. */
function tidy(s: string): string {
  return cutTrailing(cutTrailing(s ?? '', TRAILING_CLAUSE), TRAILING_ASK)
    .replace(LEADING_NOISE, '')
    .replace(/["“”']/g, '')
    .replace(/[?!.,\s]+$/g, '')
    .trim();
}

/**
 * Every string that might be the title the user named, best guess first.
 *
 * The WHOLE cleaned phrase comes first — a title containing "and" or a comma is
 * commoner than people expect — followed by each fragment. The caller resolves
 * them in order and takes what genuinely exists.
 */
export function referenceCandidates(raw: string): string[] {
  const whole = tidy(raw ?? '');
  if (!whole) return [];

  const out: string[] = [whole];
  for (const part of whole.split(SPLITTERS)) {
    const p = tidy(part);
    // One- and two-character fragments are never a title worth searching, and
    // bare stopwords ("the", "a") match everything.
    if (p.length >= 3 && !out.includes(p)) out.push(p);
  }
  return out;
}

export interface TitleCandidate {
  title: string;
  /** Higher = more widely known. Used ONLY to break ties within a tier — never
   *  to choose between different titles, which is the Cinderella Man trap. */
  popularity?: number | null | undefined;
}

export type ResolutionReason =
  | 'exact'
  /** Something similar exists, but not the title they named. */
  | 'only_near_matches'
  /** Nothing came back at all. */
  | 'no_results';

export interface TitleResolution<T> {
  /** The chosen candidate, or null when nothing matched exactly. */
  match: T | null;
  tier: TitleMatchTier;
  reason: ResolutionReason;
  /**
   * Titles that were REJECTED despite looking close — the "Cinderella" you did
   * not mean. Kept so the UI can say what it declined to substitute.
   */
  nearMisses: string[];
  /**
   * Several titles matched exactly and differ only by year ("Cinderella" 1950 /
   * 2015 / 2021). The most popular is chosen; this flags that a choice was made.
   */
  ambiguous: boolean;
}

const ACCEPTABLE: ReadonlySet<TitleMatchTier> = new Set<TitleMatchTier>(['exact', 'alt']);

/**
 * Resolve a named title against search results — strictly.
 *
 * Only an exact (article-insensitive) title identity is accepted. A 'contains'
 * match is precisely the Cinderella Man failure and is never returned as the
 * answer; it is reported as a near miss instead.
 */
export function resolveNamedTitle<T extends TitleCandidate>(
  requested: string,
  candidates: readonly T[],
): TitleResolution<T> {
  const want = normalizeTitle(requested);
  if (!want || candidates.length === 0) {
    return { match: null, tier: 'none', reason: 'no_results', nearMisses: [], ambiguous: false };
  }

  const tiered = candidates.map((c) => ({ c, tier: titleMatchTier(requested, c.title) }));
  const exact = tiered.filter((t) => ACCEPTABLE.has(t.tier));

  if (exact.length === 0) {
    const near = tiered
      .filter((t) => t.tier === 'contains' || t.tier === 'fuzzy')
      .map((t) => t.c.title);
    return {
      match: null,
      tier: near.length > 0 ? 'contains' : 'none',
      reason: near.length > 0 ? 'only_near_matches' : 'no_results',
      nearMisses: [...new Set(near)].slice(0, 5),
      ambiguous: false,
    };
  }

  // Prefer a true 'exact' over an article-shifted 'alt', then popularity — which
  // is how "Cinderella" picks a version rather than picking a different film.
  exact.sort((x, y) => {
    if (x.tier !== y.tier) return x.tier === 'exact' ? -1 : 1;
    return (y.c.popularity ?? 0) - (x.c.popularity ?? 0);
  });

  const best = exact[0]!;
  return {
    match: best.c,
    tier: best.tier,
    reason: 'exact',
    // What we declined to substitute — "Cinderella" when they said "Cinderella Man".
    nearMisses: [...new Set(tiered.filter((t) => t.tier === 'contains').map((t) => t.c.title))].slice(0, 5),
    ambiguous: exact.length > 1,
  };
}

/**
 * Resolve the FIRST of several candidate strings that genuinely exists.
 *
 * "Rocky or Cinderella Man" produces three candidates — the whole phrase, then
 * each half — and only the halves are real titles, so the whole phrase resolves
 * to nothing and is skipped rather than seeding on a substring of itself.
 */
export function resolveFirst<T extends TitleCandidate>(
  candidateStrings: readonly string[],
  lookup: (s: string) => readonly T[],
): { requested: string; resolution: TitleResolution<T> } | null {
  let bestNear: { requested: string; resolution: TitleResolution<T> } | null = null;
  for (const s of candidateStrings) {
    const resolution = resolveNamedTitle(s, lookup(s));
    if (resolution.match) return { requested: s, resolution };
    if (!bestNear && resolution.reason === 'only_near_matches') bestNear = { requested: s, resolution };
  }
  // Nothing resolved. Hand back the near-miss context so the caller can explain
  // itself instead of silently answering a different question.
  return bestNear;
}
