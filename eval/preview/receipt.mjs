/**
 * THE EXECUTABLE RECEIPT, READ AS STRUCTURED DATA.
 *
 * `body.query` is a typed object. Testing it by stringifying the whole response
 * and running a regex over it is not a weaker version of testing the field — it
 * is testing a DIFFERENT THING, and the difference is what produced a false RED
 * and could just as easily produce a false GREEN:
 *
 *   FALSE RED    `/thriller/` did not match `{"genreIds":[53]}`, so a route
 *                that had understood the request perfectly was reported as
 *                having misread it. TMDB genre 53 IS Thriller.
 *
 *   FALSE GREEN  `/\b53\b/` over the whole response also matches a 53-minute
 *                runtime cap, a 53-month window, an audience floor of 53,
 *                PERSON id 53, genre 53 in the EXCLUDE list — the opposite
 *                meaning — a returned item whose id is 53, and a returned item
 *                that IS a thriller. Any of those would have "proved" that a
 *                thriller was requested. Each one is asserted in
 *                receipt.test.ts: matched by the text oracle, rejected here.
 *
 * So a canonical field is asserted at its PATH, with an exact value. The claim
 * becomes precisely what it says: *TMDB Thriller genre id 53 is present in
 * query.genreIds* — not "the digits five and three occur somewhere".
 *
 * Text matching survives only where the field is genuinely free text.
 *
 * NO NORMALIZATION, DELIBERATELY. These read `query.genreIds`, not
 * `query.genreids`: a lowercased copy of the response is a different document,
 * and a receipt that quietly accepts either spelling cannot notice the day the
 * contract changes.
 */

/**
 * TMDB genre ids used by the canonical cases. Ids, because that is what the
 * executable query carries — a name here would be a translation layer that
 * could disagree with the thing it claims to describe.
 *
 * These are the app's OWN canonical mapping, not this file's opinion of TMDB:
 * `src/lib/finderGenres.ts:24` is `thriller: 53`, and line 32 pairs id 53 with
 * the label "Thriller". The gate asserts against the product's vocabulary.
 */
export const TMDB_GENRE = { THRILLER: 53, DOCUMENTARY: 99 };

/** TMDB person ids used by the canonical cases. */
export const TMDB_PERSON = { SYLVESTER_STALLONE: 16483 };

/** The executable query, or an empty object. Never the whole response. */
export function query(body) {
  const q = body?.query;
  return q && typeof q === 'object' && !Array.isArray(q) ? q : {};
}

/**
 * `query.genreIds` contains this exact TMDB genre id.
 *
 * The array must BE an array. A route that answered `genreIds: 53` or
 * `genreIds: "53"` has changed its contract, and that is a finding rather than
 * something to coerce past.
 */
export function hasGenreId(body, id) {
  const g = query(body).genreIds;
  return Array.isArray(g) && g.includes(id);
}

/** `query.excludeGenreIds` contains this exact TMDB genre id. */
export function excludesGenreId(body, id) {
  const g = query(body).excludeGenreIds;
  return Array.isArray(g) && g.includes(id);
}

/** `query.castIds` contains this exact TMDB person id — the RESOLVED person,
 *  not a name that happened to appear somewhere in the response. */
export function hasCastId(body, personId) {
  const c = query(body).castIds;
  return Array.isArray(c) && c.includes(personId);
}

/** `query.mediaType` is exactly this. */
export function mediaTypeIs(body, value) {
  return query(body).mediaType === value;
}

/** `query.maxRuntime` is exactly this many minutes. */
export function maxRuntimeIs(body, minutes) {
  return query(body).maxRuntime === minutes;
}

/**
 * The count the route says it was asked for, from the product's OWN counter.
 * `diagnostics.requestedCount` is the field the finder exposes for exactly this
 * (see FinderDiagnostics), so the gate reads that rather than inferring intent
 * from how many items came back — which would be assuming the answer.
 */
/**
 * WHICH KIND OF ANSWER CAME BACK.
 *
 * Evidence, not an assertion. Three very different products return zero items
 * — one that asked a clarifying question, one that never resolved the person
 * and searched for nothing, and one that resolved them and then retrieved
 * nothing — and until this was printed the count assertion could not tell them
 * apart. Two runs went by with the ambiguity unresolved because the failure
 * detail said only "got 0".
 */
export function kind(body) {
  const k = body?.kind;
  return typeof k === 'string' ? k : null;
}

export function requestedCount(body) {
  const d = body?.diagnostics;
  return d && typeof d === 'object' ? d.requestedCount ?? null : null;
}

/**
 * A required SUBJECT ("boxing", "baseball") carried in a canonical subject
 * field — `subjectCanonical`, `subjectLabel` or one of `subjectLexemes`.
 *
 * Still structured: named fields, compared as whole values, case-insensitively
 * because these carry a lexeme rather than an id. What it will NOT do is scan
 * the rest of the response, so a boxing film in the RESULTS can never satisfy a
 * claim about what the query ASKED for.
 */
export function subjectIs(body, term) {
  const q = query(body);
  const want = String(term).toLowerCase();
  const fields = [q.subjectCanonical, q.subjectLabel];
  if (fields.some((f) => typeof f === 'string' && f.toLowerCase() === want)) return true;
  return Array.isArray(q.subjectLexemes) && q.subjectLexemes.some((l) => typeof l === 'string' && l.toLowerCase() === want);
}

/** A compact, safe view of the executable query for a failure message. Only the
 *  canonical fields, so a diff is readable and nothing incidental leaks in. */
export function describeQuery(body) {
  const q = query(body);
  const picked = {
    mediaType: q.mediaType,
    genreIds: q.genreIds,
    excludeGenreIds: q.excludeGenreIds,
    castIds: q.castIds,
    maxRuntime: q.maxRuntime,
    subjectCanonical: q.subjectCanonical,
    subjectLexemes: q.subjectLexemes,
    subjectStrict: q.subjectStrict,
    // Whether the strict subject resolved to anything the catalog can retrieve
    // WITH. An empty list here and a zero candidate pool are the same fact seen
    // from two sides, and printing it stops that having to be inferred.
    subjectKeywordIds: q.subjectKeywordIds,
  };
  return JSON.stringify(Object.fromEntries(Object.entries(picked).filter(([, v]) => v !== undefined)));
}
