/**
 * LAYER A — the LIVE production API.
 *
 * Every request in this file goes to https://clearpath-pearl-chi.vercel.app,
 * to the application's own endpoints. Nothing here calls TMDB, Watchmode or
 * any provider directly: the app owns its keys, its cache and its rate limits,
 * and going around it would measure a different system than the one users use.
 *
 * The routing verdict lives here rather than in Layer B because the shipped
 * decision needs real results: `resolveSearchDestination` lets an exact title
 * match win outright, and falls through to the Judge when nothing came back.
 * That function is IMPORTED, not reimplemented — where this says a user lands,
 * that is where the shipped code sends them.
 *
 * Bounded concurrency, one request per DISTINCT query, every response frozen
 * to a cassette so Layer C can replay live evidence without re-spending it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolveSearchDestination, MAX_QUERY, type CatalogResult } from '@/lib/search/searchIntent';
import type { FrozenTest } from './corpus';
import { judge, judgeRouting, type Judgement, type Observation, type ResultItem } from './oracle';

const BASE = process.env.AUDIT_BASE_URL ?? 'https://clearpath-pearl-chi.vercel.app';
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY ?? '6');
const TIMEOUT_MS = 30_000;

const corpus = JSON.parse(readFileSync('artifacts/search-audit/search-corpus-1000.json', 'utf8')) as { tests: FrozenTest[] };

interface Capture {
  endpoint: string;
  query: string;
  status: number | null;
  latency_ms: number;
  body: string;
  error: string | null;
}

/** One HTTP call, bounded and never allowed to hang the run. */
async function call(endpoint: string, query: string): Promise<Capture> {
  const url = `${BASE}${endpoint}?q=${encodeURIComponent(query.slice(0, MAX_QUERY))}`;
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const body = await res.text();
    return { endpoint, query, status: res.status, latency_ms: Date.now() - started, body: body.slice(0, 200_000), error: null };
  } catch (e) {
    return { endpoint, query, status: null, latency_ms: Date.now() - started, body: '', error: String(e instanceof Error ? e.message : e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks with a fixed number in flight. Order of results matches input. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

function parseCatalog(body: string): CatalogResult[] {
  try {
    const j = JSON.parse(body) as { results?: unknown };
    if (!Array.isArray(j.results)) return [];
    return (j.results as Record<string, unknown>[])
      .filter((r) => typeof r.id === 'number' && (r.mediaType === 'movie' || r.mediaType === 'tv'))
      .map((r) => ({ id: r.id as number, mediaType: r.mediaType as 'movie' | 'tv', title: String(r.title ?? ''), year: (r.year as number | null) ?? null }));
  } catch { return []; }
}

function parsePeople(body: string): ResultItem[] {
  try {
    const j = JSON.parse(body) as { people?: unknown };
    if (!Array.isArray(j.people)) return [];
    return (j.people as Record<string, unknown>[]).map((p) => ({ id: p.id as number, name: String(p.name ?? ''), media_type: 'person' as const }));
  } catch { return []; }
}

/**
 * Which rule applies at this layer.
 *
 * A conversational request cannot be scored on catalog results — the endpoint
 * that would answer it is behind auth. Scoring it anyway would have produced
 * 379 "no results" P0s against an endpoint that was never meant to answer, and
 * buried the nine real routing defects underneath them. So a recommendation is
 * judged on WHERE IT LANDS, and the quality of the Judge's answer is recorded
 * as not verified.
 */
function judgeFor(t: FrozenTest, o: Observation): Judgement {
  if (t.intended_intent === 'recommendation') return judgeRouting(t, o);
  if (t.intended_intent === 'availability') {
    // "Is Rocky Balboa on Peacock?" is a QUESTION, not a title. Scoring it on
    // whether the catalog matched the whole sentence measured the wrong thing:
    // the catalog returning nothing is exactly what sends the user to the
    // surface that can answer. So it is judged on where it lands, and the
    // availability CLAIM itself — which needs the signed-in Watch Now view —
    // is recorded as not verified in not-verified.json.
    return judgeRouting(t, o);
  }
  return judge(t, o);
}

export interface LayerARow {
  test_id: number;
  category: string;
  intended_intent: string;
  query: string;
  endpoint: string;
  http_status: number | null;
  latency_ms: number;
  result_count: number;
  top_result: string | null;
  destination: string | null;
  destination_reason: string | null;
  judgement: Judgement;
}

export async function runLayerA(tests: FrozenTest[]): Promise<{ rows: LayerARow[]; captures: Capture[] }> {
  // Multi-turn conversation and every conversational engine route
  // (/api/ask, /api/finder, /api/recommendations) require a signed-in session.
  // Those are recorded as NOT VERIFIED rather than approximated — a single
  // catalog lookup is not a conversation and must not be reported as one.
  const runnable = tests.filter((t) => !t.multi_turn);

  const jobs = runnable.map((t) => ({
    test: t,
    endpoint: t.intended_intent === 'person' ? '/api/person-search' : '/api/search',
    query: t.query_or_turns[0] ?? '',
  }));

  // One live request per DISTINCT (endpoint, query). 963 distinct query bodies
  // across 1,000 tests, so this is the cache the brief asked for rather than a
  // thousand redundant calls.
  const uniq = new Map<string, { endpoint: string; query: string }>();
  for (const j of jobs) uniq.set(`${j.endpoint} ${j.query}`, { endpoint: j.endpoint, query: j.query });
  const keys = [...uniq.keys()];

  // REPLAY re-judges the responses already captured from live production
  // rather than spending another 889 requests to reach the same bytes. Used
  // when only the SCORING changed; a fresh pass always re-fetches.
  const replay = process.env.AUDIT_REPLAY === '1';
  let captured: Capture[];
  if (replay) {
    const prior = JSON.parse(readFileSync('artifacts/search-audit/live-responses.json', 'utf8')) as Capture[];
    const priorByKey = new Map(prior.map((c) => [`${c.endpoint} ${c.query}`, c]));
    const missing = keys.filter((k) => !priorByKey.has(k));
    if (missing.length) throw new Error(`replay is missing ${missing.length}/${keys.length} captured responses (prior=${priorByKey.size}); first missing ${JSON.stringify(missing[0])}; re-run live`);
    process.stderr.write(`Layer A: REPLAY of ${keys.length} frozen live responses (no new requests)\n`);
    captured = keys.map((k) => priorByKey.get(k)!);
  } else {
    process.stderr.write(`Layer A: ${jobs.length} tests over ${keys.length} distinct live requests, concurrency ${CONCURRENCY}\n`);
    let done = 0;
    captured = await pool(keys, CONCURRENCY, async (k) => {
      const { endpoint, query } = uniq.get(k)!;
      const c = await call(endpoint, query);
      if (++done % 100 === 0) process.stderr.write(`  ${done}/${keys.length}\n`);
      return c;
    });
  }
  const byKey = new Map(keys.map((k, i) => [k, captured[i]!]));

  const rows: LayerARow[] = [];
  for (const j of jobs) {
    const cap = byKey.get(`${j.endpoint} ${j.query}`)!;
    const isPerson = j.endpoint === '/api/person-search';
    const catalog = isPerson ? [] : parseCatalog(cap.body);
    const results: ResultItem[] = isPerson
      ? parsePeople(cap.body)
      : catalog.map((r) => ({ id: r.id, title: r.title, media_type: r.mediaType, year: r.year ?? null }));

    // The shipped router, run on the real results.
    const dest = isPerson ? null : resolveSearchDestination(j.query, catalog);

    const obs: Observation = {
      layer: 'A_live_api',
      test_id: j.test.id,
      ok: cap.error === null,
      http_status: cap.status,
      latency_ms: cap.latency_ms,
      error: cap.error,
      results,
      destination: dest?.href ?? null,
      intent: dest?.reason ?? null,
      // The catalog endpoint neither asks questions nor states assumptions;
      // recorded as absent so the ambiguity rules judge what is really there.
      clarifying_question: null,
      disclosed_interpretation: null,
      retained_constraints: null,
      raw_text: cap.body,
    };

    rows.push({
      test_id: j.test.id,
      category: j.test.category,
      intended_intent: j.test.intended_intent,
      query: j.query,
      endpoint: j.endpoint,
      http_status: cap.status,
      latency_ms: cap.latency_ms,
      result_count: results.length,
      top_result: results[0] ? String(results[0].title ?? results[0].name ?? '') : null,
      destination: dest?.href ?? null,
      destination_reason: dest?.reason ?? null,
      judgement: judgeFor(j.test, obs),
    });
  }

  // Multi-turn, recorded as unverifiable at this layer with the reason.
  for (const t of tests.filter((x) => x.multi_turn)) {
    rows.push({
      test_id: t.id, category: t.category, intended_intent: t.intended_intent,
      query: t.query_or_turns.join(' | '), endpoint: '(conversational engine)',
      http_status: null, latency_ms: 0, result_count: 0, top_result: null,
      destination: null, destination_reason: null,
      judgement: {
        test_id: t.id, layer: 'A_live_api', rule: 'not_verified', pass: false, severity: null,
        reason: 'multi-turn conversation requires /api/ask, which returns "Not signed in." — no test account available',
        not_verified: true,
      },
    });
  }
  rows.sort((a, b) => a.test_id - b.test_id);
  return { rows, captures: captured };
}

if (process.argv[1]?.includes('layerA')) {
  const pass = Number(process.env.AUDIT_PASS ?? '1');
  runLayerA(corpus.tests).then(({ rows, captures }) => {
    mkdirSync('artifacts/search-audit', { recursive: true });
    writeFileSync(`artifacts/search-audit/layerA-pass${pass}.json`, JSON.stringify(rows, null, 1));
    if (pass === 1 && process.env.AUDIT_REPLAY !== '1') {
      writeFileSync('artifacts/search-audit/live-responses.json', JSON.stringify(captures, null, 1));
    }
    const judged = rows.filter((r) => !r.judgement.not_verified);
    const passed = judged.filter((r) => r.judgement.pass).length;
    const bySev: Record<string, number> = {};
    for (const r of judged) if (!r.judgement.pass && r.judgement.severity) bySev[r.judgement.severity] = (bySev[r.judgement.severity] ?? 0) + 1;
    const lat = rows.filter((r) => r.latency_ms > 0).map((r) => r.latency_ms).sort((a, b) => a - b);
    console.log(`LAYER A pass ${pass} — live production API at ${BASE}`);
    console.log(`  judged                 ${judged.length}/${rows.length}  (not verified: ${rows.length - judged.length})`);
    console.log(`  passed                 ${passed}/${judged.length} (${((passed / judged.length) * 100).toFixed(1)}%)`);
    console.log(`  severity               ${JSON.stringify(bySev)}`);
    console.log(`  live requests          ${captures.length}`);
    console.log(`  latency p50/p95        ${lat[Math.floor(lat.length * 0.5)]}ms / ${lat[Math.floor(lat.length * 0.95)]}ms`);
    console.log(`  transport errors       ${captures.filter((c) => c.error).length}`);
  });
}
