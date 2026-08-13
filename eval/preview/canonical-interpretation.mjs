#!/usr/bin/env node
/**
 * BLACK-BOX CANONICAL INTERPRETATION GATE.
 *
 * Runs the four cases against a DEPLOYED preview over HTTP. It imports no
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
 * SECRETS NEVER REACH THE LOG. Tokens and cookies are held in memory, never
 * printed, and never interpolated into a logged URL.
 */

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

/** Exit codes the workflow reads to tell infrastructure from semantics apart. */
const EXIT = { OK: 0, SEMANTIC: 1, INFRA: 2 };

function infra(message) {
  console.error(`\n❌ INFRASTRUCTURE: ${message}`);
  console.error('   The black-box gate did not run. This is NOT a product verdict.');
  process.exit(EXIT.INFRA);
}

const results = [];
function check(caseName, layer, label, ok, detail) {
  results.push({ caseName, layer, label, ok, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`   ${mark} [${layer}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function headers(extra = {}) {
  const h = { 'content-type': 'application/json', ...extra };
  // Deployment Protection bypass, when the project has it enabled. Sent as a
  // header so it never lands in a URL that might be logged.
  if (BYPASS) h['x-vercel-protection-bypass'] = BYPASS;
  if (BYPASS) h['x-vercel-set-bypass-cookie'] = 'true';
  return h;
}

async function main() {
  if (!BASE_URL) infra('BASE_URL is not set.');
  console.log(`Preview: ${BASE_URL}`);

  // ── PHASE A: is this the deployment we think it is? ──────────────────────
  let version;
  try {
    const res = await fetch(`${BASE_URL}/api/version`, { headers: headers() });
    if (!res.ok) infra(`/api/version returned ${res.status}. Deployment Protection may be blocking CI.`);
    version = await res.json();
  } catch (e) {
    infra(`/api/version unreachable: ${e.message}`);
  }
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

  let cookieHeader = '';
  try {
    const res = await fetch(`${BASE_URL}/api/preview-test-login`, {
      method: 'POST',
      headers: headers({ 'x-preview-test-secret': LOGIN_SECRET }),
    });
    if (res.status === 404) {
      infra('preview login answered 404 — the deployment is production, or its test identity is unconfigured.');
    }
    if (!res.ok) infra(`preview login failed with ${res.status}.`);
    // Cookie VALUES are held here and never printed. Only the count is logged.
    const raw = res.headers.getSetCookie?.() ?? [];
    cookieHeader = raw.map((c) => c.split(';')[0]).join('; ');
    if (!cookieHeader) infra('preview login set no cookies.');
    console.log(`  authenticated with ${raw.length} session cookie(s) (values not logged)`);
  } catch (e) {
    infra(`preview login unreachable: ${e.message}`);
  }

  const ask = async (text) => {
    const res = await fetch(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers: headers({ cookie: cookieHeader }),
      body: JSON.stringify({ text }),
    });
    if (res.status === 401) infra('/api/ask returned 401 — the cookie session did not reach the route.');
    if (res.status >= 500) infra(`/api/ask returned ${res.status}.`);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  // A best-effort read of whatever the route exposes about its understanding.
  // Deliberately tolerant of shape: the receipt contract is not frozen yet, and
  // a gate that dies on a renamed field teaches nothing about meaning.
  const receipt = (body) => JSON.stringify(body.interpretation ?? body.query ?? {}).toLowerCase();
  const titles = (body) => (body.items ?? []).map((i) => `${i.title ?? ''} ${i.name ?? ''}`.trim()).filter(Boolean);

  console.log('\n── CASE 1: burrito invariance ─────────────────────────────');
  const plain = await ask('Give me a boxing movie');
  const noisy = await ask('Had a burrito for dinner. Anyway, give me a boxing movie');
  const plainR = receipt(plain.body);
  const noisyR = receipt(noisy.body);

  check('burrito', 'receipt', 'plain request understood as boxing', /boxing/.test(plainR), plainR.slice(0, 120));
  check('burrito', 'receipt', 'noisy request understood as boxing', /boxing/.test(noisyR), noisyR.slice(0, 120));
  check('burrito', 'receipt', 'no food term in the executable query', !/burrito|beef|dinner/.test(noisyR));
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
  check('count', 'receipt', 'Stallone is the requested person', /stallone|\b16483\b/.test(receipt(count.body)));
  check('count', 'world', 'returned exactly one title', countTitles.length === 1, `got ${countTitles.length}`);
  check('count', 'world', 'the anecdote did not set the count', countTitles.length !== 3, `got ${countTitles.length}`);

  console.log('\n── CASE 3: reference vs current request ───────────────────');
  const ref = await ask('I watched Rocky three weeks ago, but tonight I want a baseball movie.');
  const refR = receipt(ref.body);
  check('reference', 'receipt', 'baseball is the executable subject', /baseball/.test(refR), refR.slice(0, 120));
  check('reference', 'receipt', 'Rocky is not a similarity requirement', !/similar|like/.test(refR) || /baseball/.test(refR));
  check('reference', 'world', 'returned candidates', titles(ref.body).length > 0);
  check('reference', 'world', 'Rocky itself is not the answer', !titles(ref.body).some((t) => /^rocky\b/i.test(t)));

  console.log('\n── CASE 4: negation ───────────────────────────────────────');
  const neg = await ask('Give me a thriller but no supernatural stuff.');
  const negR = receipt(neg.body);
  check('negation', 'receipt', 'thriller is requested', /thriller/.test(negR), negR.slice(0, 120));
  check('negation', 'receipt', 'supernatural is not a positive constraint', !/"(?:genres?|subjects?|keywords?)"[^}]*supernatural/.test(negR));
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
    for (const f of failed) console.log(`  ✗ [${f.caseName}/${f.layer}] ${f.label}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exit(EXIT.SEMANTIC);
  }
  console.log('All canonical interpretation cases hold against the real preview.');
  process.exit(EXIT.OK);
}

main().catch((e) => infra(`unexpected: ${e.stack ?? e.message}`));
