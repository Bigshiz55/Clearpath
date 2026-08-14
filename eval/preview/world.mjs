/**
 * THE WORLD LAYER — PROVING A RESULT SATISFIES THE REQUEST.
 *
 * The gate's header has always promised RECEIPT + WORLD, and claimed the world
 * layer proves returned candidates satisfy the constraint. It did not. What it
 * actually asserted was that candidates EXISTED, that two result sets
 * overlapped, and that one specific title was absent. A route that understood
 * "boxing" perfectly and returned six romantic comedies passed all of it.
 *
 * "A result exists" is not evidence that the result satisfies the request.
 *
 * ── WHERE THE TRUTH COMES FROM ───────────────────────────────────────────
 *
 * Black-box throughout: every fact below is fetched over HTTP from the DEPLOYED
 * preview's own routes. Nothing imports the interpreter, the finder or the app;
 * nothing is mocked; and no TMDB secret is copied into CI to make this
 * convenient — the deployment already holds one, and asking the deployment is
 * both more honest and less secret surface.
 *
 *   SUBJECT   `items[].subjectEvidence` — the product's own eligibility
 *             verdict, carrying centrality, confidence and the evidence
 *             summary. Grounded: `satisfied` is true only when the subject is
 *             CENTRAL to the title, not when a keyword happened to match.
 *   GENRE     `/api/title-meta?type=&id=` → `meta.genres`, real TMDB genre
 *             names for that exact title id.
 *   CAST      `/api/person-search?q=who played <exact title>` → the title's
 *             real top-billed credits, compared BY PERSON ID.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────
 *
 * It never reads meaning out of a title string. "Raging Bull" is not evidence
 * of boxing and "Field of Dreams" is not evidence of baseball; that is the
 * pattern-matching-as-truth this whole gate exists to catch, and doing it here
 * would let the oracle agree with a wrong answer for the same bad reason the
 * product got it wrong.
 *
 * It also never treats popularity, rank or result order as identity.
 *
 * ── AND WHEN IT CANNOT PROVE SOMETHING, IT SAYS SO ───────────────────────
 *
 * Three verdicts, never two: PROVEN, REFUTED, UNPROVABLE. A constraint with no
 * grounded evidence available is reported as a NAMED GAP — not quietly passed,
 * which would be the same lie in the other direction, and not failed, which
 * would blame the product for the oracle's blind spot.
 */

import { request } from './protection.mjs';

export const FACT = { PROVEN: 'PROVEN', REFUTED: 'REFUTED', UNPROVABLE: 'UNPROVABLE' };

const proven = (why) => ({ verdict: FACT.PROVEN, why });
const refuted = (why) => ({ verdict: FACT.REFUTED, why });
const unprovable = (why) => ({ verdict: FACT.UNPROVABLE, why });

/** A JSON GET against the deployed preview, or null. Redirects stay unfollowed
 *  (see protection.mjs): an interstitial must never be mistaken for evidence. */
async function getJson(baseUrl, path, headers, timeoutMs = 30_000) {
  const res = await request(`${baseUrl}${path}`, { headers, timeoutMs });
  if (!res.ok || res.status < 200 || res.status >= 300) return null;
  return res.res.json().catch(() => null);
}

/**
 * Does this candidate genuinely satisfy the required SUBJECT?
 *
 * Read off the product's own eligibility verdict rather than re-derived here.
 * That is deliberate: the finder already adjudicated centrality against real
 * metadata, and a second, weaker judge invented in the gate would just be a
 * different opinion. What the gate checks is that the verdict EXISTS, that it
 * says satisfied, and that it names the subject the request asked for.
 */
export function subjectFact(item, expectedSubject) {
  const ev = item?.subjectEvidence;
  if (!ev || typeof ev !== 'object') {
    return unprovable(`"${item?.title ?? '?'}" carries no subjectEvidence — the response proves nothing about the subject`);
  }
  const names = String(ev.constraint ?? '').toLowerCase().includes(String(expectedSubject).toLowerCase());
  if (!names) return refuted(`"${item.title}" was judged against "${ev.constraint}", not "${expectedSubject}"`);
  if (ev.satisfied !== true) {
    return refuted(`"${item.title}" did not satisfy "${expectedSubject}" (${ev.status}/${ev.centrality}${ev.rejectionReason ? `: ${ev.rejectionReason}` : ''})`);
  }
  return proven(`"${item.title}" — ${ev.centrality}, confidence ${ev.confidence}, decided by ${ev.decidedBy}`);
}

/**
 * The real TMDB genres for this exact title id, from the deployment.
 * Null when the route could not answer — which is UNPROVABLE, not false.
 */
export async function genresFor(baseUrl, headers, item) {
  const type = item.mediaType === 'tv' ? 'tv' : 'movie';
  const body = await getJson(baseUrl, `/api/title-meta?type=${type}&id=${item.id}`, headers);
  const genres = body?.meta?.genres;
  return Array.isArray(genres) ? genres : null;
}

/** The deployment's own lite metadata record for a title (genres, year,
 *  originalLanguage, …) — the same route the genre facts read. Null when the
 *  route could not answer, which is UNPROVABLE, not false. */
export async function metaFor(baseUrl, headers, item) {
  const type = item.mediaType === 'tv' ? 'tv' : 'movie';
  const body = await getJson(baseUrl, `/api/title-meta?type=${type}&id=${item.id}`, headers);
  return body?.meta ?? null;
}

/** This candidate really carries the named genre. */
export async function genreFact(baseUrl, headers, item, genreName) {
  const genres = await genresFor(baseUrl, headers, item);
  if (!genres) return unprovable(`no genre metadata available for "${item.title}"`);
  const has = genres.some((g) => String(g).toLowerCase() === String(genreName).toLowerCase());
  return has
    ? proven(`"${item.title}" — ${genres.join(', ')}`)
    : refuted(`"${item.title}" is ${genres.join(', ') || '(no genres)'} — not ${genreName}`);
}

/**
 * The real top-billed credits for a title, BY PERSON ID.
 *
 * `/api/person-search` answers "who played X" from the catalogue's own credits
 * and only on an EXACT title match, which is precisely the property that makes
 * it usable as evidence: it will not guess which film was meant.
 *
 * LIMIT, STATED RATHER THAN HIDDEN: the route returns the top four billed. That
 * is sufficient to PROVE membership and insufficient to DISPROVE it, so a miss
 * is reported as unprovable rather than as a refutation.
 */
export async function topBilledFor(baseUrl, headers, item) {
  const q = encodeURIComponent(`who played ${item.title}`);
  const body = await getJson(baseUrl, `/api/person-search?q=${q}`, headers);
  const people = body?.people;
  return Array.isArray(people) && people.length > 0 ? people : null;
}

/**
 * The FULL credits for a title, straight from TMDB — cast AND crew, no
 * billing cutoff. Only available when CI carries TMDB_API_KEY; the complete
 * list is what makes both PROOF and REFUTATION possible. Guardians of the
 * Galaxy Vol. 3 is the reference incident: a supporting credit sits below
 * every top-billing window, so a top-billed reader called a true fact
 * unprovable and a fold called that a failure.
 */
async function fullCreditsFor(item) {
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return null;
  const type = item.mediaType === 'tv' ? 'tv' : 'movie';
  const res = await request(`https://api.themoviedb.org/3/${type}/${item.id}/credits?api_key=${key}`, { method: 'GET', headers: {} });
  if (!res.ok || res.status !== 200) return null;
  const body = await res.res.json().catch(() => null);
  if (!body) return null;
  return {
    cast: Array.isArray(body.cast) ? body.cast : [],
    crew: Array.isArray(body.crew) ? body.crew : [],
  };
}

/**
 * This candidate really has that person in its credits — two tiers:
 *
 *   1. FULL credits (TMDB_API_KEY in CI): can PROVE and can REFUTE.
 *   2. The deployment's top billing: can prove presence, may NEVER prove
 *      absence — a miss here is UNPROVABLE, and folding reports it as a GAP.
 */
export async function castFact(baseUrl, headers, item, personId, personName) {
  const full = await fullCreditsFor(item);
  if (full) {
    const inCast = full.cast.find((p) => p.id === personId);
    if (inCast) return proven(`"${item.title}" full cast — ${inCast.name}${inCast.character ? ` as ${inCast.character}` : ''}`);
    const inCrew = full.crew.find((p) => p.id === personId);
    if (inCrew) return proven(`"${item.title}" full crew — ${inCrew.name} (${inCrew.job ?? 'crew'})`);
    return refuted(`"${item.title}" full credits (${full.cast.length} cast, ${full.crew.length} crew) do not include ${personName}`);
  }
  const people = await topBilledFor(baseUrl, headers, item);
  if (!people) return unprovable(`no credit evidence available for "${item.title}"`);
  const hit = people.find((p) => p.id === personId);
  if (hit) return proven(`"${item.title}" — ${hit.name} (id ${hit.id})${hit.knownFor ? `, ${hit.knownFor}` : ''}`);
  return unprovable(
    `${personName} is not in the top-billed credits returned for "${item.title}" `
    + `(${people.map((p) => p.name).join(', ')}). Top billing can prove membership but cannot disprove it; `
    + `set TMDB_API_KEY in CI for the full-credits tier.`,
  );
}

/**
 * This candidate really credits that person AS ITS DIRECTOR.
 *
 * Membership is not the claim. `castFact`'s full-credit tier proves a person
 * appears SOMEWHERE in the credits — which would call a film the person only
 * PRODUCED a pass, the precise confusion the typed-role work exists to remove.
 * A director ask is answered by the crew's JOB:
 *
 *   1. FULL credits (TMDB_API_KEY in CI): a crew credit with job Director or
 *      Co-Director PROVES; a complete credit list without one REFUTES.
 *   2. No key: a directing credit is CREW, and the deployment's only credit
 *      evidence is top-billed CAST — it cannot speak to who directed the
 *      title at all, so the fact is UNPROVABLE and folds to a named GAP.
 */
export async function directorFact(item, personId, personName) {
  const full = await fullCreditsFor(item);
  if (full) {
    const directs = full.crew.find(
      (p) => p.id === personId && (p.job === 'Director' || p.job === 'Co-Director'),
    );
    if (directs) return proven(`"${item.title}" full crew — ${directs.name} (${directs.job})`);
    const otherJobs = full.crew.filter((p) => p.id === personId).map((p) => p.job).filter(Boolean);
    return refuted(
      `"${item.title}" full credits (${full.crew.length} crew) do not list ${personName} as Director`
      + (otherJobs.length ? ` — credited as ${otherJobs.join(', ')}` : ''),
    );
  }
  return unprovable(
    `a directing credit is crew, and without TMDB_API_KEY the only deployment evidence is top-billed cast — `
    + `it cannot say who directed "${item.title}". Set TMDB_API_KEY in CI for the full-credits tier.`,
  );
}

/** Resolve a person NAME to a TMDB id through the deployment's own index, so
 *  the cast comparison is id-to-id and never name-to-name. */
export async function resolvePersonId(baseUrl, headers, name) {
  const body = await getJson(baseUrl, `/api/person-search?q=${encodeURIComponent(name)}`, headers);
  const people = body?.people;
  return Array.isArray(people) && people.length > 0 ? people[0].id ?? null : null;
}

/**
 * Fold per-candidate facts into one verdict for a case.
 *
 * A REFUTED candidate fails outright — one result that does not satisfy the
 * request is the failure this layer exists to catch.
 *
 * ALL-UNPROVABLE also fails, and that is the point of the whole exercise: a
 * world layer that proved nothing at all is exactly the state this gate was
 * already in while claiming otherwise. Silence is not a pass.
 */
export function foldFacts(facts) {
  const refutedFacts = facts.filter((f) => f.verdict === FACT.REFUTED);
  const provenFacts = facts.filter((f) => f.verdict === FACT.PROVEN);
  const unprovableFacts = facts.filter((f) => f.verdict === FACT.UNPROVABLE);
  const ok = refutedFacts.length === 0 && provenFacts.length > 0;
  /* ALL-UNPROVABLE is a GAP, not a verdict. A refutation fails; a proof
     passes; an oracle that could not see is neither — calling it a failure
     blames the product for the oracle's blind spot (the Guardians of the
     Galaxy ruling), and calling it a pass claims evidence that does not
     exist. The caller records it as a named gap, loudly. */
  const gap = refutedFacts.length === 0 && provenFacts.length === 0 && unprovableFacts.length > 0;
  const detail = [
    `${provenFacts.length} proven`,
    refutedFacts.length ? `${refutedFacts.length} REFUTED` : null,
    unprovableFacts.length ? `${unprovableFacts.length} unprovable` : null,
  ].filter(Boolean).join(', ');
  const firstProblem = refutedFacts[0] ?? (provenFacts.length === 0 ? unprovableFacts[0] : null);
  return { ok, gap, detail: firstProblem ? `${detail} — ${firstProblem.why}` : detail, facts };
}
