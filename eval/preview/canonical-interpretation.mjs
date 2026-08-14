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

/** Nothing printed by this script may contain either secret. */
const redact = makeRedactor([LOGIN_SECRET, BYPASS]);

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
  const understood = (body) => JSON.stringify({ query: body.query ?? {}, interpretation: body.interpretation ?? [] }).toLowerCase();
  const titles = (body) => (body.items ?? []).map((i) => `${i.title ?? ''} ${i.name ?? ''}`.trim()).filter(Boolean);

  /*
   * AND A CONSTRAINT THE PRODUCT SATISFIED IN ITS OWN VOCABULARY IS SATISFIED.
   *
   * The string readers above are the right tool for prose and the wrong one for
   * a constraint the route encodes as a number. `Give me a thriller` came back
   * as `genreIds:[53]` — correct, and 53 IS thriller (src/lib/finderGenres.ts:24)
   * — yet a `/thriller/` regex over the serialised query saw no such word and
   * reported a SEMANTIC failure the product did not commit. That is the same
   * defect as the one this file's previous fix removed, in a new disguise: the
   * gate reading for a shape the route never emits.
   *
   * The tell was already in the file. The Stallone assertion one case above has
   * always accepted `\b16483\b` alongside the name, because whoever wrote it
   * knew a resolved person arrives as an id. The genre assertion simply never
   * got the same treatment.
   *
   * These read the FIELD rather than the serialised blob, so `53` can only
   * count when it is genuinely a requested genre — never when some unrelated
   * runtime or id happens to contain those digits. That makes these strictly
   * TIGHTER than the string match they supplement, not looser.
   */
  const genreIds = (body) => (Array.isArray(body.query?.genreIds) ? body.query.genreIds : []);
  const castIds = (body) => (Array.isArray(body.query?.castIds) ? body.query.castIds : []);
  /** TMDB canonical ids, as the app itself maps them. */
  const TMDB_THRILLER = 53;
  const TMDB_STALLONE = 16483;

  console.log('\n── CASE 1: burrito invariance ─────────────────────────────');
  const plain = await ask('Give me a boxing movie');
  const noisy = await ask('Had a burrito for dinner. Anyway, give me a boxing movie');
  const plainR = understood(plain.body);
  const noisyR = understood(noisy.body);

  check('burrito', 'receipt', 'plain request understood as boxing', /boxing/.test(plainR), plainR.slice(0, 120));
  check('burrito', 'receipt', 'noisy request understood as boxing', /boxing/.test(noisyR), noisyR.slice(0, 120));
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

  console.log('\n── CASE 2: count scoping ──────────────────────────────────');
  const count = await ask('I watched 3 movies yesterday. Give me a Stallone movie.');
  const countTitles = titles(count.body);
  /*
   * THIS PAIR EXISTS TO SEPARATE TWO FAILURES THAT LOOK IDENTICAL FROM OUTSIDE.
   *
   * The world layer below reported 0 titles. That is a real product signal, but
   * on its own it does not say WHICH product is broken: a route that never
   * resolved "Stallone" and searched for nothing returns 0, and so does a route
   * that resolved him perfectly and then failed to retrieve. The single string
   * assertion that used to stand here passed in BOTH worlds — `understood()`
   * includes the prose `interpretation`, so the bare word "Stallone" satisfies
   * it even when nothing reached the query.
   *
   * So the name-anywhere check keeps its place as the weak floor it always was,
   * and a second assertion demands the id in the executable query — the only
   * evidence that the person survived as a CONSTRAINT rather than as a remark.
   * Both now print what they saw, because a silent pass is what let the
   * ambiguity stand through two runs.
   */
  check(
    'count',
    'receipt',
    'Stallone is named anywhere in the receipt',
    /stallone|\b16483\b/.test(understood(count.body)),
    understood(count.body).slice(0, 100),
  );
  check(
    'count',
    'receipt',
    'Stallone reached the executable query as a cast constraint',
    castIds(count.body).includes(TMDB_STALLONE),
    `castIds=${JSON.stringify(castIds(count.body))}`,
  );
  check('count', 'world', 'returned exactly one title', countTitles.length === 1, `got ${countTitles.length}`);
  check('count', 'world', 'the anecdote did not set the count', countTitles.length !== 3, `got ${countTitles.length}`);

  console.log('\n── CASE 3: reference vs current request ───────────────────');
  const ref = await ask('I watched Rocky three weeks ago, but tonight I want a baseball movie.');
  const refR = executable(ref.body);
  check('reference', 'receipt', 'baseball is the executable subject', /baseball/.test(refR), refR.slice(0, 120));
  check('reference', 'receipt', 'Rocky is not a similarity requirement', !/similar|like/.test(refR) || /baseball/.test(refR));
  check('reference', 'world', 'returned candidates', titles(ref.body).length > 0);
  check('reference', 'world', 'Rocky itself is not the answer', !titles(ref.body).some((t) => /^rocky\b/i.test(t)));

  console.log('\n── CASE 4: negation ───────────────────────────────────────');
  const neg = await ask('Give me a thriller but no supernatural stuff.');
  const negR = understood(neg.body);
  check(
    'negation',
    'receipt',
    'thriller is requested',
    /thriller/.test(negR) || genreIds(neg.body).includes(TMDB_THRILLER),
    `genreIds=${JSON.stringify(genreIds(neg.body))} ${negR.slice(0, 100)}`,
  );
  check('negation', 'receipt', 'supernatural is not a positive constraint', !/"(?:genres?|subjects?|keywords?)"[^}]*supernatural/.test(executable(neg.body)));
  check('negation', 'world', 'returned candidates', titles(neg.body).length > 0);

  console.log('\n── CASE 5: the Critic comparative path still owns comparisons ─');
  const critic = await ask('Better than Furious or Widows Bay');
  // The Critic answers a comparative ask with a decision or a clarification —
  // both are legitimate. What must NOT happen is a generic feed.
  const kind = critic.body.kind ?? 'items';
  check('critic', 'receipt', 'answered as a comparison or a clarification', ['clarify', 'ruling', 'verdict', 'items'].includes(kind), `kind=${kind}`);
  check('critic', 'world', 'did not answer with an empty generic response', kind === 'clarify' || titles(critic.body).length > 0);

  // ── VERDICT ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} assertions passed`);
  if (failed.length > 0) {
    console.log('\nSEMANTIC FAILURES (the product, not the infrastructure):');
    for (const f of failed) console.log(`  ✗ [${f.caseName}/${f.layer}] ${f.label}${f.detail ? ` — ${redact(f.detail)}` : ''}`);
    process.exit(EXIT.SEMANTIC);
  }
  console.log('All canonical interpretation cases hold against the real preview.');
  process.exit(EXIT.OK);
}

main().catch((e) => infra(`unexpected: ${e.stack ?? e.message}`));
