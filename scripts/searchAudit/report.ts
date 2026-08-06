/**
 * ASSEMBLE THE AUDIT ARTIFACTS.
 *
 * Reads only what the three layers recorded. Computes nothing it cannot show,
 * and marks unverified work as unverified rather than folding it into a rate —
 * a percentage that quietly counts unreachable tests as passes is the exact
 * dishonesty this audit exists to avoid.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { FrozenTest } from './corpus';
import { SEVERITY_DEFINITIONS, type Judgement } from './oracle';

const A = 'artifacts/search-audit';
const read = <T>(f: string): T => JSON.parse(readFileSync(`${A}/${f}`, 'utf8')) as T;

const corpus = read<{ seed: string; tests: FrozenTest[] }>('search-corpus-1000.json');
const byId = new Map(corpus.tests.map((t) => [t.id, t]));

interface ARow { test_id: number; category: string; intended_intent: string; query: string; endpoint: string; http_status: number | null; latency_ms: number; result_count: number; top_result: string | null; destination: string | null; destination_reason: string | null; judgement: Judgement }
interface BRow { test_id: number; category: string; query: string; mode: string; observed_intent: string; intended_intent: string; route: string; requested_title: string | null; reference: string | null; provider: string | null; captured: string[]; required: string[]; read_back: string; latency_ms: number; judgement: Judgement; interpretation: Judgement }
interface CRow { test_id: number; category: string; query: string; viewport: string; routed_to: string | null; request_chain: string[]; landed_url: string; rendered_results: number; console_errors: string[]; leaks: string[]; page_error: string | null; pass: boolean; reason: string }

const a1 = read<ARow[]>('layerA-pass1.json');
const a2 = read<ARow[]>('layerA-pass2.json');
const b1 = read<BRow[]>('layerB-pass1.json');
const b2 = read<BRow[]>('layerB-pass2.json');
const c1 = read<CRow[]>('layerC-pass1.json');
const c2 = existsSync(`${A}/layerC-pass2.json`) ? read<CRow[]>('layerC-pass2.json') : null;

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);
const aById = new Map(a1.map((r) => [r.test_id, r]));
const bById = new Map(b1.map((r) => [r.test_id, r]));

// ── 1. Severity-ranked failures ───────────────────────────────────────────
interface Finding { severity: string; layer: string; test_id: number; category: string; intended_intent: string; query: string; rule: string; reason: string; evidence: string }
const findings: Finding[] = [];
for (const r of a1) {
  if (r.judgement.pass || r.judgement.not_verified) continue;
  findings.push({
    severity: r.judgement.severity ?? 'P3', layer: 'A live API', test_id: r.test_id,
    category: r.category, intended_intent: r.intended_intent, query: r.query,
    rule: r.judgement.rule, reason: r.judgement.reason,
    evidence: `HTTP ${r.http_status}, ${r.result_count} results, top=${JSON.stringify(r.top_result)}, destination=${r.destination ?? 'n/a'} (${r.destination_reason ?? 'n/a'})`,
  });
}
for (const r of b1) {
  if (r.interpretation.pass || r.interpretation.not_verified) continue;
  findings.push({
    severity: r.interpretation.severity ?? 'P3', layer: 'B shipped modules', test_id: r.test_id,
    category: r.category, intended_intent: r.intended_intent, query: r.query,
    rule: r.interpretation.rule, reason: r.interpretation.reason,
    evidence: `mode=${r.mode}, captured=[${r.captured.join(' ')}], read-back=${JSON.stringify(r.read_back)}`,
  });
}
for (const r of c1) {
  if (r.pass) continue;
  findings.push({
    severity: 'P0', layer: 'C browser (local build, replayed live data)', test_id: r.test_id,
    category: r.category, intended_intent: byId.get(r.test_id)?.intended_intent ?? '?', query: r.query,
    rule: 'browser/fatal', reason: r.reason, evidence: r.request_chain.join(' -> '),
  });
}
const order = { P0: 0, P1: 1, P2: 2, P3: 3 } as Record<string, number>;
findings.sort((x, y) => (order[x.severity]! - order[y.severity]!) || x.test_id - y.test_id);
writeFileSync(`${A}/failures-by-severity.json`, JSON.stringify({ severity_definitions: SEVERITY_DEFINITIONS, count: findings.length, findings }, null, 1));

// ── 2. Per-category scorecard ─────────────────────────────────────────────
const cats = [...new Set(corpus.tests.map((t) => t.category))];
const scorecard = cats.map((cat) => {
  const tests = corpus.tests.filter((t) => t.category === cat);
  const av = tests.map((t) => aById.get(t.id)!).filter((r) => r && !r.judgement.not_verified);
  const bv = tests.map((t) => bById.get(t.id)!).filter((r) => r && !r.interpretation.not_verified);
  return {
    category: cat,
    tests: tests.length,
    layerA_judged: av.length,
    layerA_passed: av.filter((r) => r.judgement.pass).length,
    layerA_pass_rate: pct(av.filter((r) => r.judgement.pass).length, av.length),
    layerA_not_verified: tests.length - av.length,
    layerB_judged: bv.length,
    layerB_passed: bv.filter((r) => r.interpretation.pass).length,
    layerB_pass_rate: pct(bv.filter((r) => r.interpretation.pass).length, bv.length),
    P0: findings.filter((f) => f.category === cat && f.severity === 'P0').length,
    P1: findings.filter((f) => f.category === cat && f.severity === 'P1').length,
    P2: findings.filter((f) => f.category === cat && f.severity === 'P2').length,
  };
});
writeFileSync(`${A}/category-scorecard.json`, JSON.stringify(scorecard, null, 1));

// ── 3. Nondeterminism between the two passes ──────────────────────────────
function diffAB<T extends { test_id: number }>(p1: T[], p2: T[], key: (r: T) => string) {
  const m = new Map(p2.map((r) => [r.test_id, r]));
  const changed: { test_id: number; pass1: string; pass2: string }[] = [];
  for (const r of p1) {
    const o = m.get(r.test_id);
    if (!o) continue;
    if (key(r) !== key(o)) changed.push({ test_id: r.test_id, pass1: key(r), pass2: key(o) });
  }
  return changed;
}
const nondet = {
  layerA_verdict_changes: diffAB(a1, a2, (r) => `${r.judgement.pass}`),
  layerA_top_result_changes: diffAB(a1, a2, (r) => String(r.top_result)),
  layerA_result_count_changes: diffAB(a1, a2, (r) => String(r.result_count)),
  layerB_verdict_changes: diffAB(b1, b2, (r) => `${r.interpretation.pass}`),
  layerC_route_changes: c2 ? diffAB(c1.filter((r) => r.viewport.startsWith('desktop')), c2.filter((r) => r.viewport.startsWith('desktop')), (r) => String(r.routed_to)) : 'pass 2 not run',
};
writeFileSync(`${A}/nondeterminism.json`, JSON.stringify(nondet, null, 1));

// ── 4. The Rocky dossier ──────────────────────────────────────────────────
const rockyIds = corpus.tests.filter((t) => t.id >= 421 && t.id <= 437).map((t) => t.id);
const rocky = rockyIds.map((id) => {
  const t = byId.get(id)!;
  const ra = aById.get(id);
  const rb = bById.get(id);
  const rc = c1.find((r) => r.test_id === id && r.viewport.startsWith('desktop'));
  return {
    id, query: t.query_or_turns.join(' | '),
    expected: { intent: t.intended_intent, constraints: t.required_constraints, acceptable: t.acceptable_behavior, unacceptable: t.unacceptable_behavior, handling: t.expected_handling },
    layerA: ra && { results: ra.result_count, top: ra.top_result, destination: ra.destination, reason: ra.destination_reason, verdict: ra.judgement },
    layerB: rb && { mode: rb.mode, captured: rb.captured, required: rb.required, read_back: rb.read_back, verdict: rb.interpretation },
    layerC: rc && { routed_to: rc.routed_to, chain: rc.request_chain, rendered: rc.rendered_results },
  };
});
writeFileSync(`${A}/rocky-dossier.json`, JSON.stringify(rocky, null, 1));

// ── 5. What could not be verified, and why ────────────────────────────────
const unverified = {
  layerA: {
    count: a1.filter((r) => r.judgement.not_verified).length,
    reasons: [...new Set(a1.filter((r) => r.judgement.not_verified).map((r) => r.judgement.reason))],
  },
  layerB: {
    count: b1.filter((r) => r.interpretation.not_verified).length,
    reasons: [...new Set(b1.filter((r) => r.interpretation.not_verified).map((r) => r.interpretation.reason))],
  },
  blocked_surfaces: [
    { surface: '/api/ask', status: 'HTTP 200 {"error":"Not signed in."}', consequence: 'recommendation ANSWERS, clarification wording and multi-turn behaviour are unmeasured' },
    { surface: '/api/finder', status: 'requires a session', consequence: 'constraint enforcement against real candidates is unmeasured' },
    { surface: '/api/recommendations', status: 'requires a session', consequence: 'personalised ranking is unmeasured' },
    { surface: '/api/quicklook, /api/dev/search-qa', status: 'requires a session', consequence: 'availability labelling and QA views are unmeasured' },
    { surface: 'live browser against clearpath-pearl-chi.vercel.app', status: 'net::ERR_CONNECTION_RESET from this Chromium', consequence: 'Layer C runs a local production build of the same commit, replaying frozen live responses' },
  ],
};
writeFileSync(`${A}/not-verified.json`, JSON.stringify(unverified, null, 1));

// ── 6. Latency ────────────────────────────────────────────────────────────
const lat = a1.filter((r) => r.latency_ms > 0).map((r) => r.latency_ms).sort((x, y) => x - y);
const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]!;
const latency = { samples: lat.length, p50: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: lat[lat.length - 1], min: lat[0] };
writeFileSync(`${A}/latency.json`, JSON.stringify(latency, null, 1));

// ── 7. Headline metrics ───────────────────────────────────────────────────
const aJudged = a1.filter((r) => !r.judgement.not_verified);
const bJudged = b1.filter((r) => !r.interpretation.not_verified);
const recRows = a1.filter((r) => r.intended_intent === 'recommendation' && !r.judgement.not_verified);
const metrics = {
  corpus: { tests: corpus.tests.length, seed: corpus.seed, sha256: createHash('sha256').update(readFileSync(`${A}/search-corpus-1000.json`)).digest('hex') },
  layerA: {
    judged: aJudged.length, not_verified: a1.length - aJudged.length,
    passed: aJudged.filter((r) => r.judgement.pass).length,
    pass_rate: pct(aJudged.filter((r) => r.judgement.pass).length, aJudged.length),
    live_requests_per_pass: new Set(a1.filter((r) => r.endpoint.startsWith('/api/')).map((r) => `${r.endpoint} ${r.query}`)).size,
    transport_errors: a1.filter((r) => r.http_status === null && !r.judgement.not_verified).length,
  },
  layerB: {
    judged: bJudged.length, deferred_to_layerA: b1.length - bJudged.length,
    passed: bJudged.filter((r) => r.interpretation.pass).length,
    pass_rate: pct(bJudged.filter((r) => r.interpretation.pass).length, bJudged.length),
  },
  layerC: {
    desktop_cases: c1.filter((r) => r.viewport.startsWith('desktop')).length,
    mobile_cases: c1.filter((r) => r.viewport.startsWith('mobile')).length,
    categories_covered: new Set(c1.map((r) => r.category)).size,
    leaks: c1.filter((r) => r.leaks.length).length,
    uncaught_page_errors: c1.filter((r) => r.page_error).length,
    routed_to_judge: c1.filter((r) => r.viewport.startsWith('desktop') && r.routed_to?.startsWith('/app/ask')).length,
    routed_to_title_page: c1.filter((r) => r.viewport.startsWith('desktop') && /\/app\/title\//.test(r.routed_to ?? '')).length,
    no_navigation: c1.filter((r) => r.viewport.startsWith('desktop') && (r.routed_to === null || r.routed_to === '/app')).length,
  },
  routing: {
    recommendation_tests: recRows.length,
    landed_at_judge: recRows.filter((r) => r.destination_reason === 'ask' || r.destination_reason === 'no-results').length,
    opened_a_title_page: recRows.filter((r) => r.destination_reason === 'exact-title' || r.destination_reason === 'top-result').length,
  },
  severity: {
    P0: findings.filter((f) => f.severity === 'P0').length,
    P1: findings.filter((f) => f.severity === 'P1').length,
    P2: findings.filter((f) => f.severity === 'P2').length,
    P3: findings.filter((f) => f.severity === 'P3').length,
  },
  latency,
  determinism: {
    layerA_verdict_changes: (nondet.layerA_verdict_changes as unknown[]).length,
    layerA_top_result_changes: (nondet.layerA_top_result_changes as unknown[]).length,
    layerB_verdict_changes: (nondet.layerB_verdict_changes as unknown[]).length,
    layerC_route_changes: Array.isArray(nondet.layerC_route_changes) ? nondet.layerC_route_changes.length : nondet.layerC_route_changes,
  },
};
mkdirSync(A, { recursive: true });
writeFileSync(`${A}/metrics.json`, JSON.stringify(metrics, null, 1));

console.log(JSON.stringify(metrics, null, 1));
