#!/usr/bin/env node
/**
 * TASTE DNA PROOF — AGAINST A REAL DEPLOYMENT, AS A REAL SIGNED-IN USER.
 *
 * Phase 1 made Ask order its answers by the reader's Taste DNA instead of by a
 * user-independent quality score. Every in-process test for that mocks the
 * Supabase reads, so none of them can say whether a DEPLOYED build, holding a
 * REAL account's stored DNA, actually returns a different order. That is the
 * only question this script asks.
 *
 * It imports no application module. The evidence is whatever `/api/ask`
 * returns over HTTP.
 *
 * ── WHY NO DIAGNOSTIC ENDPOINT WAS ADDED ─────────────────────────────────
 * `/api/ask` already spreads the whole `FinderItem`, so each result carries
 * `matchScore` — the objective score, which personalization never modifies —
 * next to `personal.rankScore`, which is what the list is now sorted by, and
 * `personal.evidence`, which names what moved it. Before and after arrive in
 * the SAME response. A new founder route would have added production surface
 * to read fields the product already returns.
 *
 * ── THE OBJECTIVE ORDER IS NOT INVENTED HERE ─────────────────────────────
 * Sorting by `matchScore` descending is not a comparator this script made up:
 * it is verbatim the comparator `finder.ts` used before Phase 1
 * (`b.matchScore - a.matchScore`). So "objective rank" is what this exact
 * deployment would have returned with the feature absent.
 *
 * ── SECRETS ──────────────────────────────────────────────────────────────
 * The login secret and the session cookies are held in memory, never printed,
 * never interpolated into a logged URL. Only cookie COUNTS are logged.
 */

import { PROTECTION, bypassHeaders, explainProtection, makeRedactor, request } from './protection.mjs';

const BASE_URL = process.env.BASE_URL;
const EXPECT_SHA = process.env.EXPECT_SHA ?? '';
const LOGIN_SECRET = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';

const redact = makeRedactor([LOGIN_SECRET, BYPASS]);
const headers = (extra = {}) => bypassHeaders(BYPASS, { 'content-type': 'application/json', ...extra });

/** Infrastructure failure — NOT a product verdict. Exit 2, always distinct. */
function infra(msg, hint) {
  console.error(`::error::INFRASTRUCTURE — ${redact(msg)}`);
  if (hint) console.error(`  ${redact(hint)}`);
  process.exit(2);
}
function fail(msg) {
  console.error(`::error::PROOF FAILED — ${redact(msg)}`);
  process.exitCode = 1;
}

/** The three queries the closure asked for. */
const QUERIES = [
  { id: 'Q1', text: 'Looking for a good thriller', kind: 'broad taste-sensitive' },
  { id: 'Q2', text: 'movies about chess', kind: 'subject' },
  { id: 'Q3', text: 'three Sylvester Stallone movies', kind: 'hard constraint' },
];

const key = (i) => `${i.mediaType}:${i.id}`;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

function evidenceOf(item) {
  const p = item.personal;
  if (!p) return { participated: false, note: 'no personal field on the item' };
  const ev = p.evidence ?? {};
  const names = (list) => (list ?? []).map((r) => r.label ?? r.key ?? r.axis ?? JSON.stringify(r)).slice(0, 3);
  return {
    participated: Boolean(p.participated),
    personalScore: p.personalScore ?? null,
    rankScore: p.rankScore ?? null,
    dimensionMatch: ev.dimensionMatch ?? null,
    preferenceNudge: ev.preferenceNudge ?? 0,
    confidence: ev.confidence ?? 0,
    reasons: names(ev.reasons),
    concerns: names(ev.concerns),
  };
}

async function main() {
  if (!BASE_URL) infra('BASE_URL is not set.');
  console.log(`Taste DNA proof against ${BASE_URL}`);

  const version = await request(`${BASE_URL}/api/version`, { headers: headers() });
  if (!version.ok) {
    infra(`/api/version unreachable: ${explainProtection({ verdict: PROTECTION.TRANSPORT, bypassSent: Boolean(BYPASS), transport: version.error }, redact)}`);
  }
  const v = await version.res.json().catch(() => ({}));
  console.log(`  deployment sha=${v.sha ?? 'unknown'} env=${v.vercelEnv ?? 'unknown'} branch=${v.branch ?? 'unknown'}`);
  if (EXPECT_SHA && v.sha && !EXPECT_SHA.startsWith(v.sha) && !v.sha.startsWith(EXPECT_SHA)) {
    infra(`deployment sha ${v.sha} does not match the expected head ${EXPECT_SHA}. Testing the wrong build proves nothing.`);
  }

  if (!LOGIN_SECRET) infra('PREVIEW_TEST_LOGIN_SECRET is not set — /api/ask is 401 without a real cookie session.');
  const login = await request(`${BASE_URL}/api/preview-test-login`, {
    method: 'POST',
    headers: headers({ 'x-preview-test-secret': LOGIN_SECRET }),
  });
  if (!login.ok) infra('preview login did not complete.');
  if (login.status === 404) {
    infra(
      'preview login answered 404.',
      'That route is inert on production by design (VERCEL_ENV), and 404s when its test identity is unconfigured. A production run of this proof needs a founder/admin session instead.',
    );
  }
  if (login.status < 200 || login.status >= 300) infra(`preview login failed with ${login.status}.`);
  const rawCookies = login.res.headers.getSetCookie?.() ?? [];
  const cookie = rawCookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) infra('preview login set no cookies.');
  console.log(`  authenticated with ${rawCookies.length} session cookie(s) (values not logged)`);

  const ask = async (text) => {
    const started = Date.now();
    const res = await request(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers: headers({ cookie }),
      body: JSON.stringify({ text }),
      timeoutMs: 90_000,
    });
    const ms = Date.now() - started;
    if (!res.ok) infra(`/api/ask did not complete for "${text}".`);
    if (res.status === 401) infra('/api/ask returned 401 — the session did not reach the route.');
    if (res.status >= 500) infra(`/api/ask returned ${res.status}.`);
    const body = await res.res.json().catch(() => ({}));
    return { ms, body };
  };

  const report = { sha: v.sha ?? null, env: v.vercelEnv ?? null, at: new Date().toISOString(), queries: [] };
  let anyParticipation = false;

  for (const q of QUERIES) {
    console.log(`\n──────── ${q.id} (${q.kind}): "${q.text}"`);
    const { ms, body } = await ask(q.text);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      console.log(`  no items returned (kind=${body.kind ?? '?'}) — nothing to order.`);
      report.queries.push({ ...q, items: 0, latencyMs: ms, kind: body.kind ?? null });
      continue;
    }

    // PERSONALIZED order is the order the route returned.
    const personalized = items.map(key);
    // OBJECTIVE order is the pre-Phase-1 comparator, applied to the same set.
    const objective = [...items].sort((a, b) => b.matchScore - a.matchScore).map(key);

    const objRank = new Map(objective.map((k, i) => [k, i + 1]));
    const rows = items.map((it, i) => {
      const k = key(it);
      const ev = evidenceOf(it);
      if (ev.participated) anyParticipation = true;
      return {
        title: it.title,
        id: k,
        objectiveRank: objRank.get(k),
        objectiveScore: it.matchScore,
        personalizedRank: i + 1,
        personalizedScore: ev.rankScore,
        movement: (objRank.get(k) ?? 0) - (i + 1),
        scoreDelta: ev.rankScore == null ? null : ev.rankScore - it.matchScore,
        evidence: ev,
      };
    });

    console.log(`  ${items.length} items · ${ms}ms · kind=${body.kind ?? '?'}`);
    console.log(`  ${'title'.padEnd(34)} ${'obj#'.padStart(4)} ${'objSc'.padStart(6)} ${'per#'.padStart(4)} ${'perSc'.padStart(6)} ${'move'.padStart(5)}  evidence`);
    for (const r of rows) {
      const e = r.evidence;
      const ev = e.participated
        ? `dim=${e.dimensionMatch ?? '-'} pref=${e.preferenceNudge} conf=${e.confidence}${e.reasons.length ? ' [' + e.reasons.join('; ') + ']' : ''}${e.concerns.length ? ' !' + e.concerns.join('; ') : ''}`
        : 'none (participated=false)';
      console.log(
        `  ${String(r.title).slice(0, 33).padEnd(34)} ${String(r.objectiveRank).padStart(4)} ${String(r.objectiveScore).padStart(6)} ` +
        `${String(r.personalizedRank).padStart(4)} ${String(r.personalizedScore ?? '-').padStart(6)} ${String(r.movement > 0 ? '+' + r.movement : r.movement).padStart(5)}  ${ev}`,
      );
    }

    // ── SET EQUALITY: ordering may change, membership may not ──────────────
    const sameSet =
      objective.length === personalized.length && new Set(objective).size === new Set(personalized).size &&
      objective.every((k) => personalized.includes(k));
    console.log(`  SET EQUALITY (eligible before vs after Taste): ${sameSet ? 'PASS' : 'FAIL'}`);
    if (!sameSet) fail(`${q.id}: personalization changed the membership of the answer.`);

    // ── CEILING: no movement may exceed the documented bound ───────────────
    const over = rows.filter((r) => r.scoreDelta != null && Math.abs(r.scoreDelta) > 18);
    console.log(`  CEILING (|delta| <= 18): ${over.length === 0 ? 'PASS' : 'FAIL'}`);
    if (over.length > 0) fail(`${q.id}: ${over.length} title(s) moved more than the +/-18 ceiling.`);

    const moved = rows.filter((r) => r.movement !== 0);
    console.log(`  MOVEMENTS: ${moved.length} of ${rows.length} title(s) changed position`);

    // ── NO-DNA CONTROL, when this account turns out to have no DNA ─────────
    const participation = rows.filter((r) => r.evidence.participated).length;
    if (participation === 0) {
      const identical = objective.every((k, i) => k === personalized[i]);
      console.log(`  NO-DNA CONTROL: participated=false on all ${rows.length}; order identical to objective: ${identical ? 'PASS' : 'FAIL'}`);
      if (!identical) fail(`${q.id}: no DNA participated, yet the order differs from the objective sort.`);
    }

    report.queries.push({ ...q, items: items.length, latencyMs: ms, kind: body.kind ?? null, rows, sameSet, movements: moved.length, participation });
  }

  // ── LATENCY: repeat each query so a single sample cannot mislead ─────────
  console.log('\n──────── LATENCY (5 runs per query)');
  console.log(`  ${'query'.padEnd(34)} ${'min'.padStart(6)} ${'med'.padStart(6)} ${'p95'.padStart(6)} ${'max'.padStart(6)}`);
  for (const q of QUERIES) {
    const samples = [];
    for (let i = 0; i < 5; i += 1) samples.push((await ask(q.text)).ms);
    console.log(
      `  ${q.text.slice(0, 33).padEnd(34)} ${String(Math.min(...samples)).padStart(6)} ${String(median(samples)).padStart(6)} ` +
      `${String(pct(samples, 95)).padStart(6)} ${String(Math.max(...samples)).padStart(6)}`,
    );
    const entry = report.queries.find((r) => r.id === q.id);
    if (entry) entry.latency = { samples, min: Math.min(...samples), median: median(samples), p95: pct(samples, 95), max: Math.max(...samples) };
  }

  console.log(`\nANY DNA PARTICIPATION ON THIS ACCOUNT: ${anyParticipation ? 'YES' : 'NO'}`);
  if (!anyParticipation) {
    console.log('  → This account is a legitimate NO-DNA CONTROL, and the objective order was preserved.');
    console.log('  → It does NOT demonstrate reordering. That needs an account with stored Taste DNA.');
  }
  console.log(`\n::group::machine-readable\n${JSON.stringify(report)}\n::endgroup::`);
}

main().catch((e) => infra(`unexpected: ${e?.message ?? e}`));
