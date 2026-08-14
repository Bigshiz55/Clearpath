/**
 * A PERSON CONSTRAINT CARRIES THE ROLE, OR IT IS NOT A PERSON CONSTRAINT.
 *
 * ── THE PRODUCTION DEFECT THIS EXISTS TO MAKE IMPOSSIBLE ──────────────────
 * "movies directed by Christopher Nolan" resolved Nolan correctly and then
 * executed as `with_cast=525`, because the execution contract had exactly one
 * person field — `castIds: number[]` — and a bare list of ids has nowhere to
 * record what the person DID. So a request about a director was answered with
 * the handful of films he acted in. Not a miss: a confidently wrong answer,
 * which is strictly worse, because nothing downstream can tell.
 *
 * The fix is not another array beside the first one. `directorIds` next to
 * `castIds` reproduces the same defect the moment a third role exists, and it
 * leaves every consumer to remember which array means what. The role is a
 * property OF the constraint, so it lives inside it.
 *
 * ── SUPPORTED IS AN EXPLICIT, SHORT LIST ──────────────────────────────────
 * `CreditRole` in the interpretation layer can say `actor | director | creator
 * | any`, because a sentence can MEAN any of those. What a sentence can mean
 * and what this engine can execute are different questions, and conflating them
 * is how "written by" quietly becomes "acted in".
 *
 * So execution names its own, shorter list, and everything else is refused out
 * loud. UNSUPPORTED IS BETTER THAN CONFIDENTLY WRONG — a person asking for
 * films written by someone would rather be told we cannot filter on that than
 * be handed films they appeared in.
 *
 * ── WHY DIRECTOR IS MOVIE-ONLY ────────────────────────────────────────────
 * TMDB's `/discover/movie` accepts `with_cast` and `with_crew`; `/discover/tv`
 * accepts neither. That is a fact about the provider, not a preference, and the
 * honest expression of it is `supported: false` rather than a filter that
 * silently does nothing.
 *
 * PURE. No I/O, no clock.
 */

/** The credit roles this ENGINE can actually execute. Deliberately short. */
export type PersonRole = 'actor' | 'director';

export interface PersonConstraint {
  personId: number;
  role: PersonRole;
}

/**
 * Whether a requested role can be executed for a media type.
 *
 * A DISCRIMINATED RESULT, NOT A BOOLEAN. The caller needs the reason to say
 * something true to the user, and a bare `false` would leave it inventing one.
 */
export type RoleSupport =
  | { supported: true; role: PersonRole }
  | { supported: false; requested: string; reason: string };

/** Roles a sentence can express but this engine cannot filter on — yet. */
const UNSUPPORTED_REASON: Record<string, string> = {
  writer: 'we can’t filter by writing credits yet',
  creator: 'we can’t filter by series creator yet',
};

export function roleSupport(requested: string, mediaType: 'movie' | 'tv'): RoleSupport {
  if (requested === 'actor') {
    // Cast filtering is movie-only at the provider; see the header.
    return mediaType === 'movie'
      ? { supported: true, role: 'actor' }
      : { supported: false, requested, reason: 'we can’t filter TV by cast yet' };
  }
  if (requested === 'director') {
    return mediaType === 'movie'
      ? { supported: true, role: 'director' }
      : { supported: false, requested, reason: 'we can’t filter TV by director yet' };
  }
  return {
    supported: false,
    requested,
    reason: UNSUPPORTED_REASON[requested] ?? `we can’t filter by “${requested}” credits`,
  };
}

/**
 * The TMDB discover parameter a role retrieves on.
 *
 * `with_crew` is NOT a director filter — it is a CREW filter, and Nolan is also
 * a writer and producer on most of his films. It is the right RETRIEVAL
 * primitive because it narrows server-side while preserving every other filter
 * in the query, and it is not sufficient on its own. `satisfiesRole` below is
 * what makes the constraint hard.
 */
export function discoverParamFor(role: PersonRole): 'with_cast' | 'with_crew' {
  return role === 'director' ? 'with_crew' : 'with_cast';
}

/** The credits shape this needs. Narrower than TMDB's, so tests can build one. */
export interface CreditsView {
  cast: ReadonlyArray<{ id: number }>;
  crew?: ReadonlyArray<{ id: number; job?: string; department?: string }>;
}

/**
 * Does this title actually satisfy the constraint?
 *
 * THE HALF THAT MAKES IT HARD. Retrieval narrows; this verifies. For a
 * director the question is not "is Nolan attached to this film" — he is
 * attached to films he only produced — but "is Nolan credited as its
 * DIRECTOR", and only the title's own credits can answer that.
 *
 * UNVERIFIABLE IS NOT A PASS. A title whose credits could not be fetched
 * returns `false` here; the caller decides whether to drop it or keep it, and
 * that decision is made where the consequences are known rather than hidden
 * behind a default in this function.
 */
export function satisfiesRole(credits: CreditsView | null, c: PersonConstraint): boolean {
  if (!credits) return false;
  if (c.role === 'actor') return credits.cast.some((p) => p.id === c.personId);
  return (credits.crew ?? []).some(
    (p) =>
      p.id === c.personId &&
      // `job` is the precise claim; `department` alone would admit a producer
      // in the Directing department (an assistant director, for instance).
      (p.job === 'Director' || p.job === 'Co-Director'),
  );
}

/** The legacy `castIds` list, expressed in the new shape. Actor by definition. */
export function fromCastIds(castIds: readonly number[] | undefined): PersonConstraint[] {
  return (castIds ?? []).map((personId) => ({ personId, role: 'actor' as const }));
}

/** Just the ids for a given role — what the discover call needs. */
export function idsForRole(people: readonly PersonConstraint[], role: PersonRole): number[] {
  return people.filter((p) => p.role === role).map((p) => p.personId);
}

/**
 * WHAT TO DO ABOUT A NAMED PERSON — decided once, in one place.
 *
 * A DISCRIMINATED PLAN, BECAUSE THE TWO OUTCOMES ARE NOT DEGREES OF EACH OTHER.
 * The first cut refused a role by setting a flag, not applying the filter, and
 * running the query anyway with a sentence appended to `interpretation`. That
 * is a list of films with nothing to do with the person, plus a note — an
 * answer to a different question, which a disclaimer does not convert back.
 *
 * `refuse` carries no constraint, so there is nothing for a caller to
 * accidentally run: the shape makes "ran it anyway" unrepresentable rather than
 * merely discouraged.
 */
export type PersonPlan =
  | { kind: 'apply'; constraint: PersonConstraint }
  | { kind: 'refuse'; requested: string; reason: string };

export function planPersonConstraint(
  personId: number,
  requestedRole: string,
  mediaType: 'movie' | 'tv',
): PersonPlan {
  const support = roleSupport(requestedRole, mediaType);
  return support.supported
    ? { kind: 'apply', constraint: { personId, role: support.role } }
    : { kind: 'refuse', requested: support.requested, reason: support.reason };
}

/** How many candidates to verify per round. Bounded fan-out at the provider. */
const QUALIFY_BATCH = 12;

/**
 * Verify candidates against the role until enough qualify — or they run out.
 *
 * ── THE DEFECT THIS REPLACES ──────────────────────────────────────────────
 * Qualification ran over `items.slice(0, max(24, cap * 4))`. A director whose
 * qualifying films ranked below that window was silently under-delivered: the
 * count was cut to whatever happened to be inside the slice, not to what
 * actually exists. "Three Nolan films" came back with one, for no reason the
 * user could see and none the code could state.
 *
 * ── WHY NOT SIMPLY VERIFY EVERYTHING ──────────────────────────────────────
 * Each verification is a credits fetch. Checking a hundred candidates to show
 * three is real latency spent on titles nobody will see. So it walks in
 * batches, in RANK ORDER, and stops the moment `need` is satisfied — the answer
 * is complete, and the work is proportional to the answer rather than to the
 * pool. When fewer qualify than were asked for, it reaches the end and returns
 * what genuinely exists: a short answer that is true, never a padded one.
 */
export async function qualifyByRole<T extends { id: number; mediaType: string }>(
  items: readonly T[],
  constraints: readonly PersonConstraint[],
  fetchCredits: (mediaType: 'movie' | 'tv', id: number) => Promise<CreditsView | null>,
  opts: { need: number },
): Promise<T[]> {
  if (constraints.length === 0) return [...items];
  const kept: T[] = [];
  for (let at = 0; at < items.length && kept.length < opts.need; at += QUALIFY_BATCH) {
    const batch = items.slice(at, at + QUALIFY_BATCH);
    const verdicts = await Promise.all(
      batch.map(async (i) => {
        if (i.mediaType !== 'movie') return false;
        const credits = await fetchCredits('movie', i.id).catch(() => null);
        return constraints.every((c) => satisfiesRole(credits, c));
      }),
    );
    batch.forEach((i, n) => {
      if (verdicts[n] && kept.length < opts.need) kept.push(i);
    });
  }
  return kept;
}
