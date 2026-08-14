/**
 * PR #69 BLACK-BOX ACCEPTANCE — a resolved person is not a content subject.
 *
 * Runs the #69 contract against a DEPLOYED preview over HTTP: real routes, real
 * TMDB resolution, real finder, real cookie session. Nothing in-process.
 *
 * THE CONTRACT UNDER TEST (and nothing beyond it):
 *
 *   "I watched 3 movies yesterday. Give me a Sylvester Stallone movie."
 *     → query.castIds contains Sylvester Stallone's id (16483)
 *     → NO Stallone-derived strict subject survives to the query
 *     → retrieval is not starved: items come back
 *
 *   control: "a Tom Hanks courtroom movie"
 *     → the person survives as a cast constraint
 *     → the SUBJECT survives as `courtroom`
 *     → no `hanks` / `hanks courtroom` subject
 *
 * DELIBERATELY NOT ASSERTED: requestedCount. The legacy route still reads the
 * count off the whole utterance, so this ask may return 3 rather than 1. That
 * is the KNOWN count-scoping defect the canonical interpreter (PR #64) owns —
 * asserting it here would fail #69 for a defect that is explicitly out of its
 * scope. The observed count is RECORDED so the record stays honest.
 *
 * WORLD ORACLE — FULL CREDITS, NOT TOP BILLING. Ruling on the GotG Vol. 3
 * incident: top-billed credits can prove membership but never disprove it, so
 * a supporting credit read as "0 proven" was an oracle gap, not a product
 * failure. This gate therefore proves cast membership in two tiers:
 *
 *   1. TMDB full credits, directly — when CI holds TMDB_API_KEY. The complete
 *      cast AND crew list, which can both PROVE and REFUTE.
 *   2. The deployment's own `/api/person-search` top billing — prove-only.
 *      A miss here is UNPROVABLE and is reported as a GAP, never as a FAIL.
 *
 * Exit codes: 0 = contract holds (GAPs, if any, are listed loudly);
 * 1 = SEMANTIC failure (the deployed product violated the contract);
 * 2 = INFRASTRUCTURE (the gate could not run — not a product verdict).
 */

import {
  PROTECTION,
  bypassHeaders,
  classifyLocation,
  diagnoseProtection,
  explainProtection,
  makeRedactor,
  request,
} from './protection.mjs';

const BASE_URL = process.env.BASE_URL;
const EXPECT_SHA = process.env.EXPECT_SHA ?? '';
const LOGIN_SECRET = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';
/** Optional. Enables the full-credits tier of the world oracle. */
const TMDB_KEY = process.env.TMDB_API_KEY ?? '';

/** Nothing printed by this script may contain a secret. */
const redact = makeRedactor([LOGIN_SECRET, BYPASS, TMDB_KEY]);

const EXIT = { OK: 0, SEMANTIC: 1, INFRA: 2 };

function infra(message, hint) {
  console.error(`\n❌ INFRASTRUCTURE: ${redact(message)}`);
  if (hint) console.error(`   → ${redact(hint)}`);
  console.error('   The black-box gate did not run. This is NOT a product verdict.');
  process.exit(EXIT.INFRA);
}

const results = [];
function check(caseName, layer, label, ok, detail) {
  results.push({ caseName, layer, label, ok, detail });
  console.log(`   ${ok ? '✓' : '✗'} [${layer}] ${label}${detail ? ` — ${redact(detail)}` : ''}`);
}

/** A world fact the oracle cannot settle: named and counted, never a verdict. */
const gaps = [];
function gap(caseName, label, why) {
  gaps.push({ caseName, label, why });
  console.log(`   ⚠ [world] ${label} — NOT PROVABLE: ${redact(why)}`);
}

function headers(extra = {}) {
  return bypassHeaders(BYPASS, { 'content-type': 'application/json', ...extra });
}

function redirectIsInfra(label, status, location) {
  if (status < 300 || status >= 400) return;
  const where = classifyLocation(location, BASE_URL);
  infra(
    `${label} answered ${status} → ${where?.host ?? '?'}${where?.path ?? ''} (query withheld).`,
    'An API route redirected after protection was cleared. It is not supposed to.',
  );
}

let sessionCookies = '';

async function post(path, body) {
  const out = await request(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(sessionCookies ? { cookie: sessionCookies } : {}),
    body: JSON.stringify(body),
  });
  if (!out.ok) infra(`POST ${path} did not reach the deployment: ${out.error?.detail ?? out.error?.kind ?? 'transport error'}.`);
  redirectIsInfra(`POST ${path}`, out.status, out.location);
  if (out.status !== 200) infra(`POST ${path} answered ${out.status}.`);
  return out.res.json();
}

async function getJson(path) {
  const out = await request(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: headers(sessionCookies ? { cookie: sessionCookies } : {}),
  });
  if (!out.ok || out.status !== 200) return null;
  return out.res.json().catch(() => null);
}

/* ── receipt readers (plain JSON reads, no app imports) ─────────────────── */

const lower = (v) => String(v ?? '').toLowerCase();

/** Every subject-shaped field of the query, flattened for inspection. */
function subjectSurface(query) {
  return [
    lower(query?.subjectCanonical),
    lower(query?.subjectLabel),
    ...(Array.isArray(query?.subjectLexemes) ? query.subjectLexemes.map(lower) : []),
  ].filter(Boolean);
}

function sanitizedReceipt(body) {
  const q = body?.query ?? {};
  const d = body?.diagnostics ?? {};
  return {
    kind: body?.kind ?? null,
    mediaType: q.mediaType ?? null,
    castIds: q.castIds ?? [],
    subjectCanonical: q.subjectCanonical ?? null,
    subjectStrict: q.subjectStrict ?? false,
    subjectLexemes: q.subjectLexemes ?? [],
    subjectKeywordIds: q.subjectKeywordIds ?? [],
    requestedCount: d.requestedCount ?? null,
    candidateCount: d.candidateCount ?? null,
    deterministicEligibleCount: d.deterministicEligibleCount ?? null,
    centralSubjectEligibleCount: d.centralSubjectEligibleCount ?? null,
    qualityEligibleCount: d.qualityEligibleCount ?? null,
    finalReturnedCount: d.finalReturnedCount ?? null,
    itemCount: Array.isArray(body?.items) ? body.items.length : 0,
    titles: Array.isArray(body?.items) ? body.items.map((i) => i.title) : [],
  };
}

/* ── world oracle: cast membership over FULL credits ────────────────────── */

/**
 * Tier 1 — TMDB full credits: the complete cast and crew, so it can both
 * prove and refute. Only reached when CI carries TMDB_API_KEY.
 */
async function tmdbFullCredits(item) {
  if (!TMDB_KEY) return null;
  const type = item.mediaType === 'tv' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${type}/${item.id}/credits?api_key=${TMDB_KEY}`;
  const out = await request(url, { method: 'GET', headers: {} });
  if (!out.ok || out.status !== 200) return null;
  const body = await out.res.json().catch(() => null);
  if (!body) return null;
  const cast = Array.isArray(body.cast) ? body.cast : [];
  const crew = Array.isArray(body.crew) ? body.crew : [];
  return { cast, crew };
}

/** Tier 2 — the deployment's own top billing. Prove-only, by design. */
async function topBilled(item) {
  const body = await getJson(`/api/person-search?q=${encodeURIComponent(`who played ${item.title}`)}`);
  const people = body?.people;
  return Array.isArray(people) && people.length > 0 ? people : null;
}

/**
 * One verdict per title: 'proven' | 'refuted' | 'unprovable', with why.
 * Refutation is only possible from full credits — top billing may never refute.
 */
async function personInCredits(item, personId, personName) {
  const full = await tmdbFullCredits(item);
  if (full) {
    const inCast = full.cast.find((c) => c.id === personId);
    if (inCast) return { verdict: 'proven', why: `"${item.title}" full cast — ${inCast.name} as ${inCast.character || '(uncredited role name)'}` };
    const inCrew = full.crew.find((c) => c.id === personId);
    if (inCrew) return { verdict: 'proven', why: `"${item.title}" full crew — ${inCrew.name} (${inCrew.job || 'crew'})` };
    return { verdict: 'refuted', why: `"${item.title}" full credits (${full.cast.length} cast, ${full.crew.length} crew) do not include ${personName}` };
  }
  const people = await topBilled(item);
  if (!people) return { verdict: 'unprovable', why: `no credit evidence available for "${item.title}"` };
  const hit = people.find((p) => p.id === personId);
  if (hit) return { verdict: 'proven', why: `"${item.title}" top billing — ${hit.name} (id ${hit.id})` };
  return {
    verdict: 'unprovable',
    why: `${personName} is not in the top-billed credits for "${item.title}" (${people.map((p) => p.name).join(', ')}). `
      + 'Top billing proves membership but cannot disprove it; set TMDB_API_KEY in CI for the full-credits tier.',
  };
}

/** The deployment's own person index, so id comparisons are never name-to-name. */
async function personIdFor(name) {
  const body = await getJson(`/api/person-search?q=${encodeURIComponent(name)}`);
  const people = body?.people;
  return Array.isArray(people) && people.length > 0 ? (people[0].id ?? null) : null;
}

/* ── main ───────────────────────────────────────────────────────────────── */

const STALLONE_ID = 16483;

async function main() {
  if (!BASE_URL) infra('BASE_URL is not set.');
  console.log(`Preview: ${BASE_URL}`);

  const protection = await diagnoseProtection(BASE_URL, BYPASS);
  console.log(`  protection: ${protection.verdict} — ${redact(explainProtection(protection, redact))}`);
  if (protection.verdict !== PROTECTION.PASSED) {
    infra(`/api/version did not answer: ${explainProtection(protection, redact)}`);
  }

  const version = protection.json ?? {};
  console.log(`  env=${version.env ?? version.vercelEnv ?? '?'} branch=${version.branch ?? '?'} sha=${version.sha ?? '?'}`);
  if (EXPECT_SHA && version.sha && !EXPECT_SHA.startsWith(version.sha) && !version.sha.startsWith(EXPECT_SHA)) {
    infra(`preview SHA ${version.sha} does not match expected ${EXPECT_SHA}. Testing the wrong build proves nothing.`);
  }

  if (!LOGIN_SECRET) infra('PREVIEW_TEST_LOGIN_SECRET is not set. /api/ask returns 401 without a real cookie session.');

  const login = await request(`${BASE_URL}/api/preview-test-login`, {
    method: 'POST',
    headers: headers({ 'x-preview-test-secret': LOGIN_SECRET }),
  });
  if (!login.ok) infra(`/api/preview-test-login did not reach the deployment: ${login.error?.detail ?? login.error?.kind ?? 'transport error'}.`);
  if (login.status !== 200) {
    infra(`/api/preview-test-login answered ${login.status}.`, 'Check PREVIEW_TEST_LOGIN_SECRET and the PREVIEW_TEST_* variables on the Vercel Preview environment.');
  }
  const setCookies = login.res.headers.getSetCookie?.() ?? [];
  sessionCookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  if (!sessionCookies) infra('Test login answered 200 but set no cookies — there is no session to test with.');
  console.log(`  authenticated with ${setCookies.length} session cookie(s) (values not logged)`);
  console.log(`  world oracle: ${TMDB_KEY ? 'FULL credits (TMDB tier active)' : 'top billing only — full-credits tier needs TMDB_API_KEY in CI'}`);

  // ── CASE 1: the #69 acceptance ask ───────────────────────────────────────
  console.log('\n── CASE 1: person resolved, not spent again as a subject ──');
  const ask1 = 'I watched 3 movies yesterday. Give me a Sylvester Stallone movie.';
  const body1 = await post('/api/ask', { text: ask1 });
  const r1 = sanitizedReceipt(body1);
  console.log(`   ▸ receipt: ${redact(JSON.stringify(r1))}`);

  check('c1', 'receipt', 'answered with a search', r1.kind === 'search', `kind=${r1.kind}`);
  check('c1', 'receipt', `Stallone is a RESOLVED cast constraint (id ${STALLONE_ID})`, r1.castIds.includes(STALLONE_ID), `castIds=${JSON.stringify(r1.castIds)}`);
  const surface1 = subjectSurface(body1?.query);
  const stalloneSubject = surface1.filter((s) => s.includes('stallone') || s.includes('stalone'));
  check('c1', 'receipt', 'no Stallone-derived subject survives', stalloneSubject.length === 0, stalloneSubject.length ? `subject surface carries ${JSON.stringify(stalloneSubject)}` : `subject surface clean (${surface1.length} entries)`);
  check('c1', 'world', 'retrieval is not starved — items returned', r1.itemCount >= 1, `items=${r1.itemCount} titles=${JSON.stringify(r1.titles)}`);
  console.log(`   ▸ observed, NOT asserted (known legacy count-scoping defect, PR #64's scope): requestedCount=${r1.requestedCount}, returned=${r1.itemCount}`);

  for (const item of (body1?.items ?? []).slice(0, 4)) {
    const fact = await personInCredits(item, STALLONE_ID, 'Sylvester Stallone');
    if (fact.verdict === 'proven') check('c1', 'world', `"${item.title}" really features Stallone`, true, fact.why);
    else if (fact.verdict === 'refuted') check('c1', 'world', `"${item.title}" really features Stallone`, false, fact.why);
    else gap('c1', `"${item.title}" really features Stallone`, fact.why);
  }

  // ── CASE 2: the control — person AND subject both survive ───────────────
  console.log('\n── CASE 2: control — a Tom Hanks courtroom movie ──────────');
  const body2 = await post('/api/ask', { text: 'a Tom Hanks courtroom movie' });
  const r2 = sanitizedReceipt(body2);
  console.log(`   ▸ receipt: ${redact(JSON.stringify(r2))}`);

  const hanksId = await personIdFor('Tom Hanks');
  if (hanksId == null) {
    gap('c2', 'Tom Hanks resolves in the deployment person index', 'the person index returned nobody — the cast id cannot be cross-checked by id');
  }
  check('c2', 'receipt', 'Hanks survives as a cast constraint', r2.castIds.length === 1 && (hanksId == null || r2.castIds[0] === hanksId), `castIds=${JSON.stringify(r2.castIds)}${hanksId != null ? ` (index says ${hanksId})` : ''}`);
  check('c2', 'receipt', 'courtroom survives as the strict subject', lower(body2?.query?.subjectCanonical) === 'courtroom', `subjectCanonical=${JSON.stringify(r2.subjectCanonical)}`);
  const surface2 = subjectSurface(body2?.query);
  const hanksSubject = surface2.filter((s) => s.includes('hanks'));
  check('c2', 'receipt', 'no hanks / hanks-courtroom subject', hanksSubject.length === 0, hanksSubject.length ? `subject surface carries ${JSON.stringify(hanksSubject)}` : 'subject surface clean');

  // ── verdict ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`${results.length - failed.length}/${results.length} assertions passed`);
  if (gaps.length) {
    console.log(`\nWORLD FACTS THIS GATE CANNOT PROVE (${gaps.length}) — recorded as GAPs, not verdicts:`);
    for (const g of gaps) console.log(`  ⚠ [${g.caseName}] ${g.label} — ${redact(g.why)}`);
  }
  if (failed.length) {
    console.log('\nSEMANTIC FAILURES (the product, not the infrastructure):');
    for (const f of failed) console.log(`  ✗ [${f.caseName}/${f.layer}] ${f.label}${f.detail ? ` — ${redact(f.detail)}` : ''}`);
    process.exit(EXIT.SEMANTIC);
  }
  process.exit(EXIT.OK);
}

main().catch((err) => {
  infra(`unhandled: ${err?.message ?? err}`);
});
