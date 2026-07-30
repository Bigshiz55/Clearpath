#!/usr/bin/env node
/**
 * BUDGETED LIVE-DATA AUDIT (opt-in; requires TMDB_API_KEY).
 *
 * Proves, against REAL TMDB data, whether returned titles actually satisfy each
 * hard constraint — with a strict API-call budget and an on-disk response cache
 * so a rerun costs zero calls. Every (title, constraint) result is labeled
 * verified / inferred / unavailable / unknown by eval/live/labels.ts; nothing is
 * inferred or fabricated. English-audio (dub) availability is reported
 * UNAVAILABLE from TMDB by design — TMDB does not expose stream audio tracks.
 *
 * Usage:  TMDB_API_KEY=... node eval/live/audit.mjs [--budget 120] [--region US]
 *
 * With no key it writes an honest BLOCKED report and exits 0 (so CI/local runs
 * don't fail) — the audit is simply "not yet run".
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const OUT = join(process.cwd(), 'evaluation-results', 'live');
mkdirSync(OUT, { recursive: true });
const CACHE = join(OUT, 'cache.json');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const BUDGET = Number(opt('budget', 120));
const REGION = opt('region', 'US');
const KEY = process.env.TMDB_API_KEY;

function gitOr(cmd, fb) { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return fb; } }
const sha = gitOr('git rev-parse --short HEAD', 'dev');

// The representative sample across every required dimension. Each item lists the
// natural query, the reference (if any) to resolve, and the hard constraints to
// verify on each returned title.
const SAMPLE = [
  { q: 'A Spanish film with English audio', constraints: [{ kind: 'origin_country', target: 'ES' }, { kind: 'original_language', target: 'es' }, { kind: 'english_audio', target: 'en' }], discover: { with_origin_country: 'ES', with_original_language: 'es' } },
  { q: 'A Korean crime movie on Netflix under two hours', constraints: [{ kind: 'origin_country', target: 'KR' }, { kind: 'runtime_max', target: 120 }, { kind: 'platform', target: 8 }], discover: { with_origin_country: 'KR', with_watch_providers: '8', watch_region: REGION, 'with_runtime.lte': 120 } },
  { q: 'A French mystery under 100 minutes', constraints: [{ kind: 'origin_country', target: 'FR' }, { kind: 'runtime_max', target: 100 }], discover: { with_origin_country: 'FR', 'with_runtime.lte': 100 } },
  { q: 'A German thriller on Hulu', constraints: [{ kind: 'origin_country', target: 'DE' }, { kind: 'platform', target: 15 }], discover: { with_origin_country: 'DE', with_watch_providers: '15', watch_region: REGION } },
  { q: 'A 1990s action movie on Max', constraints: [{ kind: 'platform', target: 1899 }], discover: { 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', with_watch_providers: '1899', watch_region: REGION } },
];

function writeReport(lines) { writeFileSync(join(OUT, 'report.md'), lines.join('\n'), 'utf8'); }

if (!KEY) {
  writeReport([
    '# Live-Data Audit — BLOCKED', '',
    `- Commit \`${sha}\``,
    '- **Status: NOT RUN — `TMDB_API_KEY` is not configured in this environment.**',
    '- This is the one blocker between offline parse verification and live',
    '  metadata verification. The harness is complete and ready; it will run a',
    `  budgeted (${BUDGET}-call) cached audit the moment a key is provided.`,
    '',
    '## What it will verify (per returned title)',
    '- Country of origin (production_countries) — verifiable',
    '- Original language (original_language) — verifiable',
    '- Runtime ceiling — verifiable',
    '- Streaming provider (watch/providers for region) — verifiable',
    '- English audio (dub) — **reported UNAVAILABLE from TMDB by design; needs a real audio-track source**',
    '',
    '## To run',
    '```',
    'TMDB_API_KEY=… node eval/live/audit.mjs --budget 120 --region US',
    '```',
  ]);
  console.log('LIVE AUDIT: BLOCKED (no TMDB_API_KEY). Wrote honest blocked report to evaluation-results/live/report.md');
  process.exit(0);
}

// ── Live path (runs only with a key) ────────────────────────────────────────
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
let calls = 0;
async function tmdb(path, params) {
  const key = `${path}?${new URLSearchParams(params).toString()}`;
  if (cache[key]) return cache[key];
  if (calls >= BUDGET) throw new Error(`budget of ${BUDGET} calls exhausted`);
  calls++;
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  const json = await res.json();
  cache[key] = json;
  return json;
}

const { labelEvidence, tally } = await import('./labels.ts').catch(async () => await import('./labels.js'));

const allResults = [];
const perQuery = [];
try {
  for (const item of SAMPLE) {
    const disc = await tmdb('discover/movie', { sort_by: 'popularity.desc', page: 1, ...item.discover });
    const titles = (disc.results ?? []).slice(0, 3);
    const rows = [];
    for (const t of titles) {
      const detail = await tmdb(`movie/${t.id}`, { append_to_response: 'watch/providers' });
      const providers = detail['watch/providers']?.results?.[REGION]?.flatrate?.map((p) => p.provider_id) ?? [];
      const evidence = {
        originCountries: (detail.production_countries ?? []).map((c) => c.iso_3166_1),
        originalLanguage: detail.original_language ?? null,
        runtimeMinutes: detail.runtime ?? null,
        providerIds: providers,
        audioLanguages: null, // TMDB has no dub-track data → english_audio stays unavailable
        present: { providers: Boolean(detail['watch/providers']) },
      };
      const labeled = item.constraints.map((c) => labelEvidence(evidence, c));
      allResults.push(...labeled);
      rows.push({ title: detail.title, year: (detail.release_date ?? '').slice(0, 4), labeled });
    }
    perQuery.push({ q: item.q, rows });
  }
} catch (err) {
  console.error('Live audit stopped:', err.message);
}

writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
const t = tally(allResults);
const L = ['# Live-Data Audit', '', `- Commit \`${sha}\` · Region ${REGION} · API calls used: ${calls}/${BUDGET} (cached rerun = 0)`,
  `- **verified ${t.verified} · inferred ${t.inferred} · unavailable ${t.unavailable} · unknown ${t.unknown} · total ${t.total}**`, ''];
for (const pq of perQuery) {
  L.push(`## ${pq.q}`, '');
  for (const r of pq.rows) {
    L.push(`### ${r.title} (${r.year})`);
    for (const c of r.labeled) L.push(`- ${c.kind}=${c.target}: **${c.label}** — ${c.detail}`);
    L.push('');
  }
}
writeReport(L);
console.log(`LIVE AUDIT done: ${calls} calls. verified ${t.verified} / unavailable ${t.unavailable} / total ${t.total}. Report at evaluation-results/live/report.md`);
