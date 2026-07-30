/**
 * PERFORMANCE HARNESS for the recommendation funnel.
 *
 * Runs the real funnel over deterministic synthetic catalogs at 5,000 / 10,000
 * / 50,000 titles and reports min / p50 / p95 / max per stage plus peak heap.
 *
 * Catalog generation is measured separately and EXCLUDED from the funnel
 * timings: in production the catalog is a database, not something built
 * per-request. Including it would flatter nothing and mislead everything.
 *
 * Usage:  npx tsx scripts/reco/perf.ts [iterations]
 */

import { generateCatalog, catalogSummary } from '@/lib/reco/synthCatalog';
import { runFunnel } from '@/lib/reco/funnel';
import { FixtureEmbeddingProvider } from '@/lib/reco/embedding';
import type { MemberProfile } from '@/lib/reco/rank';

const SIZES = [5_000, 10_000, 50_000];
const ITERATIONS = Number(process.argv[2] ?? 30);

/** A mix of broad and narrow requests, so p95 is not measured on one easy case. */
const REQUESTS = [
  'A gritty science-fiction movie with a strong female lead, under two hours, on Netflix.',
  'Something like Alien, but with more dialogue and less gore.',
  'A funny mystery that is not childish, under two hours, and available on Netflix.',
  'Something my wife and I will both like, but not another superhero movie.',
  'A dark thriller, but nothing depressing, slow, dubbed, or overly violent.',
  'We want something neither of us has seen, with a satisfying ending.',
  'Give us something unusual, but not so obscure that it feels low-budget.',
  'anything good',
];

const emb = new FixtureEmbeddingProvider('perf-members');
const members: MemberProfile[] = [
  { id: 'a', name: 'Scott', vector: emb.vectorFor('scott').values, confidence: 0.8, watchedIds: new Set(), exclusions: [], isHost: true },
  { id: 'b', name: 'Heather', vector: emb.vectorFor('heather').values, confidence: 0.7, watchedIds: new Set(), exclusions: ['horror'], isHost: false },
  { id: 'c', name: 'Amy', vector: null, confidence: 0.2, watchedIds: new Set(), exclusions: [], isHost: false },
];

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function stat(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return {
    min: +(s[0] ?? 0).toFixed(1),
    p50: +pct(s, 50).toFixed(1),
    p95: +pct(s, 95).toFixed(1),
    max: +(s[s.length - 1] ?? 0).toFixed(1),
  };
}

const heapMb = () => Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;

async function main() {
  console.log(`# Funnel performance — ${ITERATIONS} iterations per size\n`);
  console.log('Catalog generation is measured separately and NOT counted in funnel timings.\n');

  for (const size of SIZES) {
    if (global.gc) global.gc();
    const heapBefore = heapMb();

    const g0 = performance.now();
    const catalog = generateCatalog({ count: size });
    const genMs = performance.now() - g0;
    const heapAfterCatalog = heapMb();

    const perStage = new Map<string, number[]>();
    const totals: number[] = [];
    const counts: Record<string, number[]> = {};
    let peakHeap = heapAfterCatalog;

    for (let i = 0; i < ITERATIONS; i++) {
      const request = REQUESTS[i % REQUESTS.length]!;
      const t0 = performance.now();
      const r = runFunnel(catalog, { rawRequest: request, members, courtSize: 'standard' });
      totals.push(performance.now() - t0);
      for (const s of r.stages) {
        const list = perStage.get(s.stage) ?? [];
        list.push(s.ms);
        perStage.set(s.stage, list);
      }
      for (const [k, v] of Object.entries(r.totals)) {
        (counts[k] ??= []).push(v);
      }
      peakHeap = Math.max(peakHeap, heapMb());
    }

    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
    console.log(`## ${size.toLocaleString()} titles`);
    console.log(`catalog build ${genMs.toFixed(0)}ms · heap ${heapBefore}→${heapAfterCatalog}MB · peak ${peakHeap}MB`);
    console.log(`mix: ${JSON.stringify(catalogSummary(catalog))}`);
    console.log('| stage | min | p50 | p95 | max |');
    console.log('|---|---|---|---|---|');
    for (const [stage, values] of perStage) {
      const s = stat(values);
      console.log(`| ${stage} | ${s.min} | ${s.p50} | ${s.p95} | ${s.max} |`);
    }
    const t = stat(totals);
    console.log(`| **TOTAL** | ${t.min} | ${t.p50} | **${t.p95}** | ${t.max} |`);
    console.log(`counts (avg): ${Object.entries(counts).map(([k, v]) => `${k} ${avg(v)}`).join(' · ')}`);

    // Goals from the brief.
    const goal = size === 5_000 ? 3_000 : size === 10_000 ? 5_000 : 10_000;
    console.log(`goal p95 < ${goal}ms → ${t.p95 < goal ? 'MET' : 'MISSED'} (${t.p95}ms)\n`);
  }
}

void main();
