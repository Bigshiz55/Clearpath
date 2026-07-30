#!/usr/bin/env node
/**
 * SCORE DISTRIBUTION AUDIT — read-only, one-off.
 *
 * Scores every row currently in `catalog_titles` with the REAL deterministic
 * engine (`computeGeneralScore` from src/lib/scoring/general.ts — imported,
 * never reimplemented) and reports the distribution: count, min, max, mean,
 * median, deciles; the same breakdown by media type; the 20 highest and 20
 * lowest scoring titles; and a runtime-executed proof of cold-start behavior
 * using the real blend (`blendedScore` from src/lib/verdict/rank.ts).
 *
 * Touches nothing: no writes, no schema changes, no stored score is modified.
 * The scoring engine is imported as-is and never edited.
 *
 * Usage:  node scripts/scoring/audit-distribution.mjs
 * Needs:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * WHY `catalog_titles`, AND THE CAVEAT THAT MATTERS MOST:
 * It's the only table in this schema built to hold "every title" alongside
 * the fields the scoring engine actually reads (critic_score, audience_score,
 * vote_count, popularity, runtime, media_type). But scripts/reco/seed-catalog.sql
 * and src/lib/reco/synthCatalog.ts both say plainly, in their own comments,
 * that this table is currently populated with SYNTHETIC benchmark rows for
 * testing the recommendation engine's query plans — "THIS IS NOT REAL CATALOG
 * DATA." If that is still true when this runs, the distribution below
 * describes fixture data, not real content, and this script says so rather
 * than presenting it as a real content audit. It has no way to tell the
 * difference from inside the table itself — that judgment is on the reader.
 *
 * NO "network" FIELD: `catalog_titles` doesn't have one — it's TMDB-shaped
 * metadata, not tied to a broadcast network. The only table in this schema
 * with a real `network` column is `tv_grid` (live TV schedule listings), and
 * it carries no rating/score inputs at all, so the deterministic engine has
 * nothing to score there without a per-title TMDB lookup outside this script.
 * Rather than fabricate a join between two unrelated tables to force a
 * network breakdown into existence, this script reports that segmentation as
 * unavailable and says exactly why.
 */

import { register } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '../..');
const SRC = path.join(ROOT, 'src');
const DEADLINE_MS = Date.now() + 480_000;

function timeLeftMs() {
  return DEADLINE_MS - Date.now();
}

// ---------------------------------------------------------------------------
// A tiny, self-contained TS loader hook — just enough to import the real
// scoring/verdict modules without a bundler. Strips types with the
// `typescript` package (already a devDependency; nothing new installed),
// resolves the `@/` -> src/ alias this codebase uses, and resolves
// extensionless relative specifiers the same way Next's bundler does.
// Registered as a `data:` URL so the whole loader stays in this one file.
// ---------------------------------------------------------------------------
const HOOKS_SRC = `
import ts from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'node_modules/typescript/lib/typescript.js')).href)};
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = ${JSON.stringify(pathToFileURL(SRC + '/').href)};

function tryResolveTs(base) {
  for (const cand of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (existsSync(cand)) return pathToFileURL(cand).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const asPath = fileURLToPath(new URL(specifier.slice(2), SRC));
    const hit = existsSync(asPath) ? pathToFileURL(asPath).href : tryResolveTs(asPath);
    if (hit) return { url: hit, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.endsWith('.ts')) {
    const asPath = fileURLToPath(new URL(specifier, context.parentURL));
    const hit = existsSync(asPath) ? pathToFileURL(asPath).href : tryResolveTs(asPath);
    if (hit) return { url: hit, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const source = readFileSync(fileURLToPath(url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: fileURLToPath(url),
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOKS_SRC)}`, import.meta.url);

// ---------------------------------------------------------------------------
// Load the real engine — imported, not reimplemented.
// ---------------------------------------------------------------------------
const { computeGeneralScore } = await import(pathToFileURL(path.join(SRC, 'lib/scoring/general.ts')).href);
const { blendedScore } = await import(pathToFileURL(path.join(SRC, 'lib/verdict/rank.ts')).href);
const { DNA_PERSONAL_MIN } = await import(pathToFileURL(path.join(SRC, 'lib/verdict/confidence.ts')).href);

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------
function stats(scores) {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const pct = (p) => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const deciles = {};
  for (let d = 1; d <= 9; d++) deciles[`D${d}`] = Math.round(pct(d * 10) * 100) / 100;
  return {
    count: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: Math.round(mean * 100) / 100,
    median: Math.round(pct(50) * 100) / 100,
    deciles,
  };
}

function printStats(label, s) {
  console.log(`\n--- ${label} ---`);
  if (!s) {
    console.log('  (no rows)');
    return;
  }
  console.log(`  count:  ${s.count}`);
  console.log(`  min:    ${s.min}`);
  console.log(`  max:    ${s.max}`);
  console.log(`  mean:   ${s.mean}`);
  console.log(`  median: ${s.median}`);
  console.log(`  deciles (D1..D9, i.e. the 10th..90th percentile cut points):`);
  console.log(
    '   ' +
      Object.entries(s.deciles)
        .map(([k, v]) => `${k}=${v}`)
        .join('  '),
  );
  console.log(`  interdecile range (D9 - D1): ${Math.round((s.deciles.D9 - s.deciles.D1) * 100) / 100}`);
}

// ---------------------------------------------------------------------------
// Cold-start proof — runs the REAL blend, doesn't just describe it.
// ---------------------------------------------------------------------------
function coldStartReport() {
  console.log('\n=== 4. COLD-START BEHAVIOR (executed against the real blend) ===\n');
  console.log(`DNA_PERSONAL_MIN (src/lib/verdict/confidence.ts): ${DNA_PERSONAL_MIN} ratings.`);
  console.log('Below that, the UI itself never claims personalization — ScoreBadge renders');
  console.log('"<score> fit" (baseline) rather than "Your <score>" (src/components/tv/ScoreBadge.tsx).\n');

  const base = { key: 't', title: 'Sample Title', watchability: 74, matchConfidence: 0, runtimeMinutes: 100, availableOn: ['Netflix'] };

  const zeroRatings = { ...base, personalMatch: null };
  const confidentMatch = { ...base, personalMatch: 92, matchConfidence: 1 };
  const thinMatch = { ...base, personalMatch: 92, matchConfidence: 0.2 };

  const zScore = blendedScore(zeroRatings);
  const cScore = blendedScore(confidentMatch);
  const tScore = blendedScore(thinMatch);

  console.log(`Same title, watchability=${base.watchability}:`);
  console.log(`  0 ratings (personalMatch=null):            blendedScore = ${zScore}  (== watchability, unchanged)`);
  console.log(`  thin match (matchConfidence=0.2, DNA=92):  blendedScore = ${tScore}  (nudged slightly)`);
  console.log(`  confident match (matchConfidence=1, DNA=92): blendedScore = ${cScore}  (pulled hard toward the DNA match)`);
  console.log(
    `\nFINDING: at zero ratings the engine has no personalMatch to blend, so blendedScore() returns the`,
  );
  console.log(
    'plain deterministic Watchability score untouched — the SAME number every other zero-rating user would',
  );
  console.log(
    'see for that title. It is a community/general fallback, and the UI is explicit about that (labeled',
  );
  console.log(
    '"fit", not "Your"). It is not personalization presented as personalization — it is presented as what',
  );
  console.log('it is: a baseline that has not learned this user yet.');
}

// ---------------------------------------------------------------------------
// Supabase — read-only
// ---------------------------------------------------------------------------
async function fetchAllCatalogTitles() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set.');
    console.error('No live calls made; nothing was scored or fabricated. Set both and re-run to audit a real');
    console.error('(or real-seeded) catalog_titles table.');
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const rows = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    if (timeLeftMs() < 20_000) {
      console.error(`\nApproaching the 480s cap with ${rows.length} rows fetched — stopping the fetch here.`);
      break;
    }
    const { data, error } = await admin
      .from('catalog_titles')
      .select(
        'id, media_type, title, release_year, runtime_minutes, status, genres, synopsis, critic_score, audience_score, popularity, vote_count, active',
      )
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error(`Supabase error while paging catalog_titles at offset ${offset}: ${error.message}`);
      return rows.length ? rows : null;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Minimal, honest mapping — every field left null is a field catalog_titles
 * simply does not carry per-source (no separate IMDb/RT/Metacritic columns,
 * only one collapsed audience_score and one collapsed critic_score). Nothing
 * here is invented: audience_score is stored 0..10 (confirmed against
 * scripts/reco/seed-catalog.sql, which generates it on that scale) and maps
 * directly to voteAverage, the one field the engine's standardReadings()
 * actually reads from this row. critic_score has no matching TitleMetadata
 * field on this scale and is deliberately left unmapped rather than guessed
 * into rottenTomatoes/metascore (both 0..100, a different scale). */
function toTitleMetadata(row) {
  return {
    id: 0,
    mediaType: row.media_type,
    title: row.title,
    year: row.release_year,
    overview: row.synopsis ?? '',
    genres: row.genres ?? [],
    keywords: [],
    posterPath: null,
    backdropPath: null,
    runtimeMinutes: row.runtime_minutes,
    episodeRuntimeMinutes: row.media_type === 'tv' ? row.runtime_minutes : null,
    status: row.status ?? null,
    contentRating: null,
    voteAverage: row.audience_score != null ? Number(row.audience_score) : null,
    voteCount: row.vote_count ?? 0,
    popularity: row.popularity != null ? Number(row.popularity) : null,
    trailerUrl: null,
    originalLanguage: null,
    spokenLanguages: [],
    originCountries: [],
    imdbId: null,
    imdbRating: null,
    rottenTomatoes: null,
    rtAudience: null,
    metascore: null,
    episodesAired: null,
    episodesTotal: null,
    nextEpisodeDate: null,
  };
}

function fmtRow(r) {
  return `${r.score.toFixed(1).padStart(6)}  ${r.mediaType.padEnd(4)}  ${r.year ?? '----'}  ${r.title}`;
}

async function main() {
  const rows = await fetchAllCatalogTitles();

  console.log('=== SCORE DISTRIBUTION AUDIT — catalog_titles ===');
  console.log(`Run at: ${new Date().toISOString()}`);

  if (rows === null) {
    console.log('\nNo data was fetched (see error above). Sections 1-3 below cannot be produced without a');
    console.log('live database connection — nothing is fabricated in their place.');
    coldStartReport();
    process.exitCode = 1;
    return;
  }

  const active = rows.filter((r) => r.active !== false);
  console.log(`\nFetched ${rows.length} catalog_titles rows (${active.length} active).`);

  const scored = active.map((row) => {
    const meta = toTitleMetadata(row);
    const result = computeGeneralScore(meta, null);
    return { id: row.id, title: row.title, year: row.release_year, mediaType: row.media_type, score: result.score };
  });

  console.log('\n=== 1. OVERALL DISTRIBUTION ===');
  printStats('All scored titles', stats(scored.map((s) => s.score)));

  console.log('\n=== 2. BY CONTENT TYPE ===');
  console.log('(catalog_titles has no per-episode rows — media_type is only movie/tv at the title level,');
  console.log(' not movie/episode. Reporting the axis this table actually has.)');
  for (const mt of ['movie', 'tv']) {
    printStats(`media_type = ${mt}`, stats(scored.filter((s) => s.mediaType === mt).map((s) => s.score)));
  }

  console.log('\n=== 2b. BY SOURCE NETWORK — NOT AVAILABLE ===');
  console.log('catalog_titles has no `network` column (see file header comment for why this is not faked');
  console.log('via a join to tv_grid, the one table that does have one).');

  const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
  console.log('\n=== 3. TOP 20 / BOTTOM 20 ===');
  console.log('\nHighest scoring:');
  sortedByScore.slice(0, 20).forEach((r) => console.log('  ' + fmtRow(r)));
  console.log('\nLowest scoring:');
  sortedByScore
    .slice(-20)
    .reverse()
    .forEach((r) => console.log('  ' + fmtRow(r)));

  coldStartReport();
}

main().catch((e) => {
  console.error('\nScript failed:', e?.stack ?? e);
  process.exitCode = 1;
});
