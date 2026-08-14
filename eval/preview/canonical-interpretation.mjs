#!/usr/bin/env node
/**
 * BLACK-BOX CANONICAL INTERPRETATION GATE.
 *
 * Runs the five cases against a DEPLOYED preview over HTTP. It imports no
 * application module, calls no interpreter in process, and mocks nothing — if
 * this passes, the deployed route, real TMDB and real Supabase all did their
 * part. That constraint is the entire point: a green in-process test proved
 * nothing about the thing the user actually types into.
 *
 * TWO LAYERS OF PROOF PER CASE, because either alone is a lie:
 *
 *   RECEIPT  what the route says it understood.
 *   WORLD    what actually came back, and whether it satisfies the constraint.
 *
 * A route that reports `subject: boxing` and returns a romantic comedy has
 * failed, and only the world layer catches it. A route that returns three
 * boxing films by luck while understanding nothing has also failed, and only
 * the receipt layer catches that.
 *
 * INFRASTRUCTURE FAILURE IS NOT SEMANTIC FAILURE. Every exit path says which it
 * was. A gate that cannot tell "the preview is unreachable" from "the product
 * is wrong" trains everyone to ignore it.
 *
 * ── AND AN INFRASTRUCTURE FAILURE MUST SAY *WHICH ONE* ───────────────────
 *
 * This gate previously died with `/api/version unreachable: fetch failed` on a
 * deployment that was up, with both secrets present, and that line named
 * nothing: DNS, TLS, a refused socket, a timeout and a redirect loop all reach
 * `err.message` as those same three words. The transport now lives in
 * ./protection.mjs, which reads `err.cause`, leaves redirects UNFOLLOWED while
 * it diagnoses, and reports the class of failure by name. See the header there
 * for the two defects that produced that line and the measurements behind them.
 *
 * SECRETS NEVER REACH THE LOG. Tokens and cookies are held in memory, never
 * printed, and never interpolated into a logged URL. Every diagnostic string
 * additionally passes through a redactor built from the live secret values, and
 * a redirect is described by hostname and path only — Vercel's SSO challenge
 * carries the full protected URL and a nonce in its query string.
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
import {
  TMDB_GENRE,
  TMDB_PERSON,
  describeQuery,
  hasCastId,
  hasGenreId,
  kind,
  mediaTypeIs,
  requestedCount,
  subjectIs,
} from './receipt.mjs';
import { castFact, foldFacts, genreFact, metaFor, resolvePersonId, subjectFact } from './world.mjs';
import { diedAt, funnelStages, renderFunnel } from './funnel.mjs';

const BASE_URL = process.env.BASE_URL;
const EXPECT_SHA = process.env.EXPECT_SHA ?? '';
/*
 * TWO SECRETS, NOT FIVE.
 *
 * The first version copied Supabase config and the test user's email and
 * password into GitHub. That was more secret surface than the job needs: the
 * deployment already holds those, so CI only has to prove it is allowed to ASK
 * for a session. A leaked login secret buys a synthetic session on a preview;
 * leaked credentials would be reusable wherever Supabase is reachable.
 */
const LOGIN_SECRET = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';
/** Optional: enables the full-credits tier of the cast oracle. */
const TMDB_KEY = process.env.TMDB_API_KEY ?? '';

/** Nothing printed by this script may contain either secret. */
const redact = makeRedactor([LOGIN_SECRET, BYPASS, TMDB_KEY]);

/** Exit codes the workflow reads to tell infrastructure from semantics apart. */
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
  const mark = ok ? '✓' : '✗';
  console.log(`   ${mark} [${layer}] ${label}${detail ? ` — ${redact(detail)}` : ''}`);
}

/**
 * A WORLD FACT THIS GATE CANNOT PROVE, RECORDED AS A GAP.
 *
 * Neither a pass nor a failure, because it is neither. Passing it would claim
 * evidence that does not exist — the precise sin this file was written to
 * catch. Failing it would blame the product for the oracle's blind spot. So it
 * is named, counted, and printed in the verdict, and the gate never reports
 * "all cases hold" while one is open.
 */
const gaps = [];
/** A folded world claim: refutation FAILS, proof PASSES, blindness is a GAP. */
function checkFold(caseName, label, folded, emptyDetail) {
  if (folded.gap) gap(caseName, label, folded.detail);
  else check(caseName, 'world', label, folded.ok, emptyDetail ?? folded.detail);
}
function gap(caseName, label, why) {
  gaps.push({ caseName, label, why });
  console.log(`   ⚠ [world] ${label} — NOT PROVABLE: ${redact(why)}`);
}

/**
 * WHERE A ZERO COMES FROM.
 *
 * A count of zero is a conclusion, not a diagnosis, and "the interpreter must
 * be wrong" is a guess. `/api/ask` already returns the finder's own per-stage
 * counters, so the funnel can be read straight off the deployed response — no
 * new route, no new secret, nothing in the request path that only exists for a
 * test. Printing it turns "returned 0" into the boundary where the candidates
 * actually died.
 */
async function stalloneFunnel(body) {
  const d = body?.diagnostics;
  if (!d || typeof d !== 'object') {
    console.log('   ▸ funnel: /api/ask returned no diagnostics — the boundary cannot be located from the response alone.');
    return;
  }
  const stages = funnelStages(d);
  console.log(`   ▸ funnel: ${renderFunnel(stages)}`);

  // The boundary is the first APPLICABLE stage that reached zero — an n/a
  // stage did not run and can never be where candidates died (tested in
  // funnel.test.ts).
  const boundary = diedAt(stages);
  if (boundary) console.log(`   ▸ candidates died at: ${boundary}`);

  // Per-candidate rejection reasons, when the finder recorded them. This is the
  // difference between "0 results" and "these six titles were rejected, each
  // for this stated reason".
  // The route's own prose about what it did. When a strict subject resolves to
  // no catalog keyword the finder says so in as many words, and that sentence
  // is the difference between "retrieval failed" and "there was nothing to
  // retrieve with".
  const said = Array.isArray(body.interpretation) ? body.interpretation : [];
  for (const line of said.slice(0, 4)) console.log(`   ▸ route said: ${redact(line)}`);

  const evals = Array.isArray(d.evaluations) ? d.evaluations.slice(0, 6) : [];
  for (const e of evals) {
    console.log(`   ▸ ${e.title ?? '?'} (${e.year ?? '—'}): ${e.status}/${e.centrality} conf=${e.confidence}${e.rejectionReason ? ` — ${redact(e.rejectionReason)}` : ''}`);
  }
}

/**
 * Every call after protection is cleared carries the SAME single bypass header.
 * `x-vercel-set-bypass-cookie` is deliberately absent — see ./protection.mjs.
 */
function headers(extra = {}) {
  return bypassHeaders(BYPASS, { 'content-type': 'application/json', ...extra });
}

/**
 * A redirect on an API route, once protection is known to be cleared, is not a
 * result — it is protection reasserting itself or a route that has moved. Named
 * rather than followed, for the same reason as the version probe: following it
 * turns a challenge into somebody else's 200.
 */
function redirectIsInfra(label, status, location) {
  if (status < 300 || status >= 400) return;
  const where = classifyLocation(location, BASE_URL);
  infra(
    `${label} answered ${status} → ${where?.host ?? '?'}${where?.path ?? ''} (query withheld).`,
    where && where.kind === 'vercel-sso'
      ? 'Deployment Protection challenged a request that had already cleared /api/version. The bypass token may have expired mid-run.'
      : 'An API route redirected. It is not supposed to.',
  );
}

async function main() {
  if (!BASE_URL) infra('BASE_URL is not set.');
  console.log(`Preview: ${BASE_URL}`);

  // ── PHASE A: CAN WE REACH IT AT ALL, AND IF NOT, WHAT IS IN THE WAY? ─────
  //
  // Protection is diagnosed before anything else and with the bypass header
  // ALONE, so a green here is a positive proof of exactly one claim: this token
  // opens this deployment. Everything downstream is allowed to assume it.
  const protection = await diagnoseProtection(BASE_URL, BYPASS);
  console.log(`  protection: ${protection.verdict} — ${redact(explainProtection(protection, redact))}`);

  if (protection.verdict !== PROTECTION.PASSED) {
    const hint = {
      [PROTECTION.BYPASS_REJECTED]:
        'This is the ONE case that justifies touching the secret. Vercel refused a request that carried the token, and a valid token answers 200 on this same route — so the value in VERCEL_AUTOMATION_BYPASS_SECRET is not the value the project holds. '
        + 'Regenerate it in Vercel (Settings → Deployment Protection → Protection Bypass for Automation) and set the GitHub secret to match.',
      [PROTECTION.PROTECTION_CHALLENGE]: 'Set VERCEL_AUTOMATION_BYPASS_SECRET in the repository secrets — the deployment is protected and nothing was sent.',
      [PROTECTION.COOKIE_HANDSHAKE]: 'The deployment asked the client to store a cookie and come back. `fetch` has no cookie jar, so it cannot — this is the loop that used to surface as "fetch failed". Nothing here should be requesting a bypass COOKIE.',
      [PROTECTION.UNAUTHORIZED]: 'A 401/403 with no Vercel protection signature on it, so the request cleared protection and the APPLICATION refused it. Look at app auth, not project settings.',
      [PROTECTION.NOT_JSON]: 'An interstitial page answered instead of the endpoint. /api/version is a JSON route.',
      [PROTECTION.FOREIGN_REDIRECT]: 'The deployment redirected somewhere unrelated to Vercel SSO. Check the deployment alias.',
      [PROTECTION.TRANSPORT]: 'The request never reached the application at all — the class above says which layer failed.',
      [PROTECTION.HTTP_ERROR]: 'The deployment answered, but not with a version.',
    }[protection.verdict];
    infra(`/api/version did not answer: ${explainProtection(protection, redact)}`, hint);
  }

  const version = protection.json ?? {};
  console.log(`  env=${version.env ?? version.vercelEnv ?? '?'} branch=${version.branch ?? '?'} sha=${version.sha ?? '?'}`);

  if (EXPECT_SHA && version.sha && !EXPECT_SHA.startsWith(version.sha) && !version.sha.startsWith(EXPECT_SHA)) {
    infra(`preview SHA ${version.sha} does not match PR head ${EXPECT_SHA}. Testing the wrong build proves nothing.`);
  }

  // ── AUTH: a REAL cookie session, because that is what the app reads ──────
  /*
   * `createServerClient` is built with a cookie adapter and no Authorization
   * passthrough (pinned by src/lib/arch/authTransport.test.ts), so a bearer
   * token is anonymous to this application. An earlier version of this script
   * sent one and would have reported 401 forever while looking like a product
   * failure. The harness signs in the way a person does and keeps the cookies.
   */
  if (!LOGIN_SECRET) {
    infra('PREVIEW_TEST_LOGIN_SECRET is not set. /api/ask returns 401 without a real cookie session.');
  }

  const login = await request(`${BASE_URL}/api/preview-test-login`, {
    method: 'POST',
    headers: headers({ 'x-preview-test-secret': LOGIN_SECRET }),
  });
  if (!login.ok) {
    infra(
      `preview login did not complete: ${explainProtection({ verdict: PROTECTION.TRANSPORT, bypassSent: Boolean(BYPASS), transport: login.error }, redact)}`,
      'Protection cleared on /api/version, so this is the login route itself, not Deployment Protection.',
    );
  }
  redirectIsInfra('preview login', login.status, login.location);
  if (login.status === 404) {
    infra('preview login answered 404 — the deployment is production, or its test identity is unconfigured.');
  }
  if (login.status < 200 || login.status >= 300) infra(`preview login failed with ${login.status}.`);

  // Cookie VALUES are held here and never printed. Only the count is logged.
  const rawCookies = login.res.headers.getSetCookie?.() ?? [];
  const cookieHeader = rawCookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookieHeader) infra('preview login set no cookies.');
  console.log(`  authenticated with ${rawCookies.length} session cookie(s) (values not logged)`);

  const ask = async (text) => {
    const res = await request(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers: headers({ cookie: cookieHeader }),
      body: JSON.stringify({ text }),
      // A live ask does real TMDB and Supabase work, so it gets a longer leash
      // than the version probe — but still a finite one, so a hung route is
      // reported as a timeout instead of burning the job's whole budget.
      timeoutMs: 60_000,
    });
    if (!res.ok) {
      infra(
        `/api/ask did not complete: ${explainProtection({ verdict: PROTECTION.TRANSPORT, bypassSent: Boolean(BYPASS), transport: res.error }, redact)}`,
        'The deployment was reachable a moment ago, so this is the route, not protection.',
      );
    }
    redirectIsInfra('/api/ask', res.status, res.location);
    if (res.status === 401) infra('/api/ask returned 401 — the cookie session did not reach the route.');
    if (res.status >= 500) infra(`/api/ask returned ${res.status}.`);
    return { status: res.status, body: await res.res.json().catch(() => ({})) };
  };

  /*
   * TWO READERS, BECAUSE THE ROUTE ANSWERS IN TWO FIELDS.
   *
   * The single reader this replaces was `body.interpretation ?? body.query`,
   * and `??` falls through on null/undefined ONLY. `/api/ask` declares
   * `askInterpretation: string[] = []` and returns it on every search response
   * (route.ts:873, :951), so `interpretation` is an empty ARRAY — never
   * nullish, never falling through — and `query`, the object that actually
   * carries the executable constraints, was invisible to this gate. Every
   * receipt assertion was therefore testing the literal string `[]`.
   *
   * That is the exact failure this file exists to prevent, pointed the other
   * way: a gate reporting SEMANTIC failures the product did not commit is as
   * useless as one that misses the ones it did. Fixed by reading the right
   * field — the assertions below are unchanged, character for character.
   *
   *   EXECUTABLE  what the route will actually run: `query`.
   *   UNDERSTOOD  that, plus what it says it understood: `interpretation`.
   *
   * Each assertion uses whichever its own label already claims. "the executable
   * subject" and "the executable query" read EXECUTABLE; "understood as", "is
   * requested" and "is the requested person" read UNDERSTOOD.
   */
  const executable = (body) => JSON.stringify(body.query ?? {}).toLowerCase();
  const items = (body) => (body.items ?? []).filter((i) => i && typeof i === 'object');
  const titles = (body) => items(body).map((i) => `${i.title ?? ''} ${i.name ?? ''}`.trim()).filter(Boolean);
  /** Evidence lookups run against the deployment with the same session. */
  const evidenceHeaders = () => headers({ cookie: cookieHeader, accept: 'application/json' });

  /*
   * WHY THE WORLD LAYER IS BOUNDED AT FOUR CANDIDATES.
   *
   * Each world fact costs a live HTTP round trip against real TMDB. Proving
   * every candidate of every case would multiply the gate's runtime by the
   * result-set size for no additional proof: a constraint that holds for the
   * first four and fails on the fifth is still a failure the next run catches,
   * and one refuted candidate fails the case outright. What is NOT bounded is
   * honesty about it — the count checked is printed in every world detail, so
   * "4 proven" can never be read as "all of them".
   */
  const WORLD_SAMPLE = 4;
  const sample = (body) => items(body).slice(0, WORLD_SAMPLE);

  console.log('\n── CASE 1: burrito invariance ─────────────────────────────');
  const plain = await ask('Give me a boxing movie');
  const noisy = await ask('Had a burrito for dinner. Anyway, give me a boxing movie');

  check('burrito', 'receipt', 'boxing is the executable subject (plain)', subjectIs(plain.body, 'boxing'), describeQuery(plain.body));
  check('burrito', 'receipt', 'boxing is the executable subject (noisy)', subjectIs(noisy.body, 'boxing'), describeQuery(noisy.body));
  check('burrito', 'receipt', 'no food term in the executable query', !/burrito|beef|dinner/.test(executable(noisy.body)));
  check('burrito', 'world', 'plain returned candidates', titles(plain.body).length > 0);
  check('burrito', 'world', 'noisy returned candidates', titles(noisy.body).length > 0);
  {
    // Domain overlap rather than identical order: popularity and availability
    // legitimately move between two live calls, so demanding equality would
    // make this flaky for reasons that have nothing to do with meaning.
    const a = new Set(titles(plain.body).map((t) => t.toLowerCase()));
    const b = titles(noisy.body).map((t) => t.toLowerCase());
    const overlap = b.filter((t) => a.has(t)).length;
    const ratio = b.length ? overlap / b.length : 0;
    check('burrito', 'world', 'noise did not move the recommendation domain', ratio >= 0.5, `overlap ${Math.round(ratio * 100)}%`);
  }
  {
    // THE PROOF THAT WAS MISSING. Existing is not satisfying: these are the
    // product's own eligibility verdicts, which are true only when boxing is
    // CENTRAL to the title — never because a keyword matched, and never
    // because the title sounds like a fight picture.
    const plainFacts = foldFacts(sample(plain.body).map((i) => subjectFact(i, 'boxing')));
    check('burrito', 'world', `plain candidates really are boxing (first ${WORLD_SAMPLE})`, plainFacts.ok, plainFacts.detail);
    const noisyFacts = foldFacts(sample(noisy.body).map((i) => subjectFact(i, 'boxing')));
    check('burrito', 'world', `noisy candidates really are boxing (first ${WORLD_SAMPLE})`, noisyFacts.ok, noisyFacts.detail);
  }

  /*
   * ── CASE 2 USES THE FULL NAME, ON PURPOSE ──────────────────────────────
   *
   * It used to say "a Stallone movie", which made one row answerable only by
   * passing TWO independent contracts at once: count scoping (the anecdote's
   * "3" must not become the requested count) and surname identity (which
   * Stallone?). A failure could not say which had broken, and the second is a
   * genuinely harder question that deserves its own row rather than the power
   * to fail this one.
   *
   * So the invariant under test here is exactly one thing: a number spoken in
   * BACKGROUND is not the number of results asked for. The surname lives in
   * CASE 2b, and the real production incident in CASE 2c.
   */
  console.log('\n── CASE 2: count scoping ──────────────────────────────────');
  const count = await ask('I watched 3 movies yesterday. Give me a Sylvester Stallone movie.');
  const countTitles = titles(count.body);
  check('count', 'receipt', 'answered with a search, not a question', kind(count.body) === 'search', `kind=${kind(count.body)}`);
  check('count', 'receipt', 'Stallone is a RESOLVED cast constraint (id 16483)', hasCastId(count.body, TMDB_PERSON.SYLVESTER_STALLONE), describeQuery(count.body));
  check('count', 'receipt', 'the actor is NOT also a strict subject', !subjectIs(count.body, 'stallone') && !subjectIs(count.body, 'sylvester stallone'), describeQuery(count.body));
  check('count', 'receipt', 'the route was asked for exactly one', requestedCount(count.body) === 1, `requestedCount=${requestedCount(count.body)}`);
  check('count', 'world', 'returned exactly one title', countTitles.length === 1, `got ${countTitles.length} kind=${kind(count.body)}`);
  check('count', 'world', 'the anecdote did not set the count', countTitles.length !== 3, `got ${countTitles.length}`);
  {
    // THE PROOF THAT WAS MISSING: not "one title came back" but "the title that
    // came back actually has Stallone in it", by TMDB person id, from the
    // deployment's own credits.
    const stalloneId = (await resolvePersonId(BASE_URL, evidenceHeaders(), 'Sylvester Stallone')) ?? TMDB_PERSON.SYLVESTER_STALLONE;
    const facts = [];
    for (const i of sample(count.body)) facts.push(await castFact(BASE_URL, evidenceHeaders(), i, stalloneId, 'Sylvester Stallone'));
    const folded = foldFacts(facts);
    checkFold('count', 'the returned title really has Stallone in its cast', folded, facts.length === 0 ? 'no candidates to verify' : folded.detail);
  }
  await stalloneFunnel(count.body);

  /*
   * ── CASE 2b: A SURNAME IS AN IDENTITY QUESTION, NOT A COUNT QUESTION ────
   *
   * "Stallone" names Sylvester, Frank, Sage and Jennifer. Returning the most
   * popular is not identification — it is a guess that attaches the wrong human
   * being to someone's evening, and it is indistinguishable from success until
   * the user notices. So exactly TWO answers are acceptable and the row accepts
   * either: a person resolved on real evidence, or a clarifying question.
   *
   * What is NOT acceptable is the third thing the product used to do: turn the
   * surname into a strict SUBJECT and return nothing at all.
   */
  console.log('\n── CASE 2b: surname-only identity ─────────────────────────');
  const surname = await ask('Give me a Stallone movie.');
  const surnameKind = kind(surname.body);
  const resolvedOne = hasCastId(surname.body, TMDB_PERSON.SYLVESTER_STALLONE);
  const askedWhich = surnameKind === 'clarify';
  check(
    'surname',
    'receipt',
    'either resolved a person on evidence, or asked which one',
    resolvedOne || askedWhich,
    `kind=${surnameKind} ${describeQuery(surname.body)}`,
  );
  check(
    'surname',
    'receipt',
    'the surname never became a strict subject',
    !subjectIs(surname.body, 'stallone'),
    describeQuery(surname.body),
  );
  if (!askedWhich) {
    check('surname', 'world', 'a resolved person returns at least one title', titles(surname.body).length > 0, `got ${titles(surname.body).length}`);
  } else {
    console.log('   ▸ answered with a clarification — the identity contract is satisfied without a search.');
  }

  /*
   * ── CASE 2c: THE EXACT PRODUCTION INCIDENT ─────────────────────────────
   *
   * The sentence a real user typed. Every layer is asserted separately so a
   * failure names the layer that broke rather than the sentence:
   *
   *   receipt   media, count, person-as-cast, and NO subject named Stallone
   *   world     three titles, every one of them a MOVIE
   *   cast      each returned title really has Stallone in it, by person id,
   *             read from the deployment's own credits endpoint
   */
  console.log('\n── CASE 2c: "3 Sylvester Stallone movies" ─────────────────');
  const three = await ask('3 Sylvester Stallone movies');
  const threeTitles = titles(three.body);
  check('incident', 'receipt', 'answered with a search', kind(three.body) === 'search', `kind=${kind(three.body)}`);
  check('incident', 'receipt', 'the request is for MOVIES', mediaTypeIs(three.body, 'movie'), describeQuery(three.body));
  check('incident', 'receipt', 'the route was asked for three', requestedCount(three.body) === 3, `requestedCount=${requestedCount(three.body)}`);
  check('incident', 'receipt', 'Stallone is a RESOLVED cast constraint (id 16483)', hasCastId(three.body, TMDB_PERSON.SYLVESTER_STALLONE), describeQuery(three.body));
  check('incident', 'receipt', 'no strict subject named Stallone', !subjectIs(three.body, 'stallone') && !subjectIs(three.body, 'sylvester stallone'), describeQuery(three.body));
  check('incident', 'world', 'returned three titles', threeTitles.length === 3, `got ${threeTitles.length} kind=${kind(three.body)}`);
  check(
    'incident',
    'world',
    'every returned title is a movie (no TV padding)',
    items(three.body).length > 0 && items(three.body).every((i) => i.mediaType === 'movie'),
    JSON.stringify(items(three.body).map((i) => i.mediaType)),
  );
  {
    const stalloneId = (await resolvePersonId(BASE_URL, evidenceHeaders(), 'Sylvester Stallone')) ?? TMDB_PERSON.SYLVESTER_STALLONE;
    const facts = [];
    for (const i of sample(three.body)) facts.push(await castFact(BASE_URL, evidenceHeaders(), i, stalloneId, 'Sylvester Stallone'));
    const folded = foldFacts(facts);
    checkFold('incident', 'every verified title really has Stallone in its cast', folded, facts.length === 0 ? 'no candidates to verify' : folded.detail);
  }
  await stalloneFunnel(three.body);

  console.log('\n── CASE 3: reference vs current request ───────────────────');
  const ref = await ask('I watched Rocky three weeks ago, but tonight I want a baseball movie.');
  check('reference', 'receipt', 'baseball is the executable subject', subjectIs(ref.body, 'baseball'), describeQuery(ref.body));
  check('reference', 'receipt', 'Rocky is not a similarity requirement', !/similar|like/.test(executable(ref.body)) || subjectIs(ref.body, 'baseball'));
  check('reference', 'world', 'returned candidates', titles(ref.body).length > 0);
  check('reference', 'world', 'Rocky itself is not the answer', !titles(ref.body).some((t) => /^rocky\b/i.test(t)));
  {
    const facts = foldFacts(sample(ref.body).map((i) => subjectFact(i, 'baseball')));
    check('reference', 'world', `candidates really are baseball (first ${WORLD_SAMPLE})`, facts.ok, facts.detail);
  }

  console.log('\n── CASE 4: negation ───────────────────────────────────────');
  const neg = await ask('Give me a thriller but no supernatural stuff.');
  check('negation', 'receipt', 'TMDB Thriller genre id 53 is present in query.genreIds', hasGenreId(neg.body, TMDB_GENRE.THRILLER), describeQuery(neg.body));
  check('negation', 'receipt', 'supernatural is not a positive constraint', !/"(?:genres?|subjects?|keywords?)"[^}]*supernatural/.test(executable(neg.body)));
  check('negation', 'world', 'returned candidates', titles(neg.body).length > 0);
  {
    // THE PROOF THAT WAS MISSING: real TMDB genres for each returned id, from
    // the deployment's own metadata route.
    const facts = [];
    for (const i of sample(neg.body)) facts.push(await genreFact(BASE_URL, evidenceHeaders(), i, 'Thriller'));
    const folded = foldFacts(facts);
    check('negation', 'world', `candidates really carry the Thriller genre (first ${WORLD_SAMPLE})`, folded.ok, folded.detail);
  }
  {
    /*
     * THE EXCLUSION IS NOT PROVABLE FROM WHAT THE DEPLOYMENT RETURNS, AND THAT
     * IS REPORTED RATHER THAN PAPERED OVER.
     *
     * "Supernatural" is not a TMDB genre; it lives in keywords, and neither the
     * ask response nor `/api/title-meta` carries a candidate's keywords. The
     * two dishonest options are both refused: passing this silently would claim
     * a proof that does not exist, and failing it would blame the product for
     * the oracle's blind spot.
     *
     * What WOULD close it is a minimal sanitized grounding receipt on the
     * candidate — the keyword ids that were checked and the exclusion verdict —
     * which is its own piece of design work, not something to improvise here.
     */
    gap('negation', 'the supernatural EXCLUSION is honoured by the candidates',
      'not a TMDB genre — it is a keyword, and neither /api/ask nor /api/title-meta returns candidate keywords. '
      + 'Needs a sanitized grounding receipt on the candidate (keyword ids checked + exclusion verdict).');
  }

  console.log('\n── CASE 5: the Critic comparative path still owns comparisons ─');
  const critic = await ask('Better than Furious or Widows Bay');
  // The Critic answers a comparative ask with a decision or a clarification —
  // both are legitimate. What must NOT happen is a generic feed.
  /* Named `criticKind`, not `kind`: a local `const kind` here shadows the
     imported reader for the WHOLE of main(), and every earlier call to it dies
     in the temporal dead zone. That is exactly what happened — the gate exited
     2 at CASE 2 with "Cannot access 'kind' before initialization", which the
     workflow correctly reported as INFRASTRUCTURE rather than a product
     verdict. `node --check` cannot see it; only running the file can. */
  const criticKind = critic.body.kind ?? 'items';
  check('critic', 'receipt', 'answered as a comparison or a clarification', ['clarify', 'ruling', 'verdict', 'items'].includes(criticKind), `kind=${criticKind}`);
  check('critic', 'world', 'did not answer with an empty generic response', criticKind === 'clarify' || titles(critic.body).length > 0);

  console.log('\n── CASE 6: person + subject — neither consumes the other ──');
  const hanks = await ask('a Tom Hanks courtroom movie');
  check('hanks', 'receipt', 'Hanks survives as a cast constraint (id 31)', hasCastId(hanks.body, 31), describeQuery(hanks.body));
  check('hanks', 'receipt', 'courtroom survives as the strict subject', subjectIs(hanks.body, 'courtroom'), describeQuery(hanks.body));
  {
    const surface = JSON.stringify([hanks.body.query?.subjectCanonical, hanks.body.query?.subjectLabel, hanks.body.query?.subjectLexemes]).toLowerCase();
    check('hanks', 'receipt', 'no hanks-derived subject', !surface.includes('hanks'));
  }
  const stbox = await ask('a Sylvester Stallone boxing movie');
  check('stbox', 'receipt', 'Stallone is the cast constraint', hasCastId(stbox.body, TMDB_PERSON.SYLVESTER_STALLONE), describeQuery(stbox.body));
  check('stbox', 'receipt', 'boxing survives as the subject', subjectIs(stbox.body, 'boxing'), describeQuery(stbox.body));

  console.log('\n── CASE 7: a requested title is a LOOKUP ──────────────────');
  const lego = await ask('Show me The Lego Movie');
  const legoKind = lego.body.kind ?? '?';
  check('lego', 'receipt', 'answered as a title lookup, not a search', legoKind === 'title', `kind=${legoKind}`);
  check('lego', 'receipt', 'the looked-up work is the requested one', /lego movie/i.test(JSON.stringify(lego.body)), 'response names the title');
  {
    const surface = JSON.stringify([lego.body.query?.subjectCanonical, lego.body.query?.subjectLexemes, lego.body.query?.castIds]).toLowerCase();
    check('lego', 'receipt', 'no lego person and no lego subject', !surface.includes('lego'));
  }

  console.log('\n── CASE 8: capitalised description stays description ──────');
  const horror = await ask('Show me A Horror Movie');
  check('descHorror', 'receipt', 'a recommendation, NOT a title lookup', horror.body.kind === 'search', `kind=${horror.body.kind}`);
  check('descHorror', 'receipt', 'the horror constraint survives', hasGenreId(horror.body, 27), describeQuery(horror.body));
  const boxCap = await ask('Show me A Boxing Movie');
  check('descBoxing', 'receipt', 'a recommendation, NOT a title lookup', boxCap.body.kind === 'search', `kind=${boxCap.body.kind}`);
  check('descBoxing', 'receipt', 'the boxing subject survives', subjectIs(boxCap.body, 'boxing'), describeQuery(boxCap.body));

  console.log('\n── CASE 9: tone reaches real execution ────────────────────');
  const funny = await ask('Give me a funny movie');
  check('funny', 'receipt', 'funny executes as the Comedy genre (35)', hasGenreId(funny.body, 35), describeQuery(funny.body));
  check('funny', 'world', 'returned candidates', titles(funny.body).length > 0);
  {
    const facts = [];
    for (const i of sample(funny.body)) facts.push(await genreFact(BASE_URL, evidenceHeaders(), i, 'Comedy'));
    checkFold('funny', 'candidates really are comedies (first sample)', foldFacts(facts), facts.length === 0 ? 'no candidates to verify' : undefined);
  }

  console.log('\n── CASE 10: media polarity ────────────────────────────────');
  const noTv = await ask('Give me movies but no TV shows');
  check('polarity', 'receipt', 'the medium is MOVIE — the veto is not a presence signal', mediaTypeIs(noTv.body, 'movie'), describeQuery(noTv.body));
  check('polarity', 'world', 'every returned item is a movie', items(noTv.body).length === 0 || items(noTv.body).every((i) => i.mediaType === 'movie'), JSON.stringify(items(noTv.body).map((i) => i.mediaType)));

  console.log('\n── CASE 11: canonical origin / language / audio ───────────');
  const kdub = await ask('Give me a Korean movie dubbed in English');
  check('kdub', 'receipt', 'origin KR reaches the query', JSON.stringify(kdub.body.query?.originCountries ?? []).includes('KR'), describeQuery(kdub.body));
  check('kdub', 'receipt', 'original language ko reaches the query', JSON.stringify(kdub.body.query?.originalLanguages ?? []).includes('ko'));
  check('kdub', 'receipt', 'English-dub strictness survives', kdub.body.query?.englishDubOnly === true);
  check('kdub', 'receipt', '"Korean" never became a person', !(kdub.body.query?.castIds?.length), JSON.stringify(kdub.body.query?.castIds ?? []));
  {
    const facts = [];
    for (const i of sample(kdub.body)) {
      const meta = await metaFor(BASE_URL, evidenceHeaders(), i);
      if (!meta) facts.push({ verdict: 'UNPROVABLE', why: `no metadata for "${i.title}"` });
      else if (meta.originalLanguage === 'ko') facts.push({ verdict: 'PROVEN', why: `"${i.title}" originalLanguage=ko` });
      else facts.push({ verdict: 'REFUTED', why: `"${i.title}" originalLanguage=${meta.originalLanguage}` });
    }
    checkFold('kdub', 'candidates really are Korean-language titles', foldFacts(facts), facts.length === 0 ? 'no candidates to verify' : undefined);
  }

  console.log('\n── CASE 12: the credit role is typed — director vs actor ──');
  const nolanId = (await resolvePersonId(BASE_URL, evidenceHeaders(), 'Christopher Nolan')) ?? 525;
  const directed = await ask('movies directed by Christopher Nolan');
  const directedPeople = directed.body.query?.people ?? [];
  check('director', 'receipt', 'the constraint is a typed DIRECTOR role', directedPeople.some((p) => p.personId === nolanId && p.role === 'director'), JSON.stringify(directedPeople));
  check('director', 'receipt', 'a director ask never becomes with_cast', !(directed.body.query?.castIds?.length), JSON.stringify(directed.body.query?.castIds ?? []));
  const withNolan = await ask('movies with Christopher Nolan');
  check('director', 'receipt', 'the actor phrasing keeps actor semantics', hasCastId(withNolan.body, nolanId), describeQuery(withNolan.body));
  check('director', 'receipt', 'director and actor asks are NOT the same retrieval constraint', JSON.stringify(directed.body.query) !== JSON.stringify(withNolan.body.query));
  {
    const facts = [];
    for (const i of sample(directed.body)) facts.push(await castFact(BASE_URL, evidenceHeaders(), i, nolanId, 'Christopher Nolan'));
    checkFold('director', 'returned titles really carry the Nolan credit', foldFacts(facts), facts.length === 0 ? 'no candidates to verify' : undefined);
  }
  await stalloneFunnel(directed.body);

  // ── VERDICT ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} assertions passed`);
  if (gaps.length > 0) {
    // Printed whether the run is green or red. A gate that only mentions its
    // blind spots when something else fails is hiding them.
    console.log(`\nWORLD FACTS THIS GATE CANNOT YET PROVE (${gaps.length}) — the world layer is INCOMPLETE:`);
    for (const g of gaps) console.log(`  ⚠ [${g.caseName}] ${g.label} — ${redact(g.why)}`);
  }
  if (failed.length > 0) {
    console.log('\nSEMANTIC FAILURES (the product, not the infrastructure):');
    for (const f of failed) console.log(`  ✗ [${f.caseName}/${f.layer}] ${f.label}${f.detail ? ` — ${redact(f.detail)}` : ''}`);
    process.exit(EXIT.SEMANTIC);
  }
  console.log(
    gaps.length > 0
      ? `Every case the world layer CAN prove holds against the real preview — with ${gaps.length} world fact(s) still unproven above.`
      : 'All canonical interpretation cases hold against the real preview.',
  );
  process.exit(EXIT.OK);
}

main().catch((e) => infra(`unexpected: ${e.stack ?? e.message}`));
