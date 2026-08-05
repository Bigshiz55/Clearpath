/**
 * Generate the fixture corpus and report EXACT counts, or load it into a
 * Postgres database.
 *
 *   npx tsx scripts/fixtureCorpus.ts count [--seed=S] [--small]
 *   npx tsx scripts/fixtureCorpus.ts simulate [--days=30]
 *   npx tsx scripts/fixtureCorpus.ts load --db=postgres://... [--small]
 *
 * `count` never touches a database and never allocates the corpus — the
 * generators are iterators, so 500,000 offers are counted one at a time
 * rather than held. That is what makes "≥500,000" a measured figure rather
 * than an arithmetic claim.
 *
 * `load` writes into the 0044 tables with `is_fixture = true` on every row.
 * It REFUSES to run against a database whose `data_sources` says it is a
 * production deployment, because the one thing fixtures must never do is
 * appear in production.
 */
import { Client } from 'pg';
import {
  SCALE, SMALL_SCALE, countCorpus, generateTitles, generateEpisodes, generateOffers,
  generateNetworks, generateAffiliates, generateLineups, generateServices, generateAirings,
  type ScaleProfile,
} from '../src/lib/tv/fixtures/generator';
import { SimClock } from '../src/lib/tv/fixtures/clock';
import { runSyncSimulation } from '../src/lib/tv/fixtures/simulation';

const args = process.argv.slice(2);
const cmd = args[0] ?? 'count';
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const has = (name: string) => args.includes(`--${name}`);

const seed = flag('seed') ?? 'watchverdict-fixture-v1';
const profile: ScaleProfile = has('small') ? { ...SMALL_SCALE } : { ...SCALE };

async function count() {
  const started = Date.now();
  const counts = countCorpus(seed, profile, new SimClock());
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(JSON.stringify({ seed, profile, elapsedSeconds: Number(elapsed), counts }, null, 2));

  const targets: [string, number, number][] = [
    ['titles', counts.titles, SCALE.titles],
    ['episodes', counts.episodes, SCALE.episodes],
    ['offers', counts.offers, SCALE.offers],
    ['networks', counts.networks, SCALE.networks],
    ['scheduleDays', counts.scheduleDays, SCALE.scheduleDays],
  ];
  if (!has('small')) {
    let ok = true;
    for (const [name, actual, target] of targets) {
      const pass = actual >= target;
      if (!pass) ok = false;
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${actual.toLocaleString()} (target >= ${target.toLocaleString()})`);
    }
    if (!ok) process.exit(1);
  }
}

function simulate() {
  const days = Number(flag('days') ?? 30);
  const report = runSyncSimulation({ seed, profile, days });
  const { cycles, ...rest } = report;
  console.log(JSON.stringify({ ...rest, sampleCycles: cycles.slice(0, 3).concat(cycles.slice(-3)) }, null, 2));
  const failures = Object.entries(report.invariants).filter(([, v]) => !v);
  if (failures.length) {
    console.error('INVARIANTS VIOLATED:', failures.map(([k]) => k).join(', '));
    process.exit(1);
  }
  console.log(`PASS  ${report.ticks} cycles over ${report.simulatedDays} simulated days; every invariant held.`);
}

async function load() {
  const url = flag('db') ?? process.env.FIXTURE_DATABASE_URL;
  if (!url) { console.error('load requires --db=postgres://... or FIXTURE_DATABASE_URL'); process.exit(1); }
  const client = new Client({ connectionString: url });
  await client.connect();

  // REFUSE TO SEED PRODUCTION. Fixture rows in a production database are the
  // exact failure the whole is_fixture/public-view design exists to prevent,
  // and a --db flag is one typo away from it.
  const { rows: envRows } = await client.query(
    `select current_database() as db, current_setting('wv.environment', true) as env`,
  );
  if ((envRows[0]?.env ?? '').toLowerCase() === 'production') {
    console.error('REFUSING: this database is tagged wv.environment=production.');
    process.exit(1);
  }
  console.log(`Loading fixture corpus into ${envRows[0]?.db} (seed=${seed})`);

  const clock = new SimClock();
  const t0 = Date.now();
  await client.query('begin');
  const { rows: srcRows } = await client.query(
    `select id from data_sources where slug = 'fixture'`);
  const sourceId: string = srcRows[0].id;

  // Services
  for (const s of generateServices()) {
    await client.query(
      `insert into dist_services (slug, name, service_kind, is_fixture)
       values ($1,$2,$3,true) on conflict (slug) do nothing`,
      [s.slug, s.name, s.kind]);
  }

  // Titles — batched COPY-style multi-row inserts. One statement per row over
  // 50,000 rows is minutes of round trips; 1,000 rows per statement is
  // seconds, and the batch size is what makes `load` usable in a test.
  const BATCH = 1000;
  let batch: unknown[] = [];
  let placeholders: string[] = [];
  let titleCount = 0;
  const flushTitles = async () => {
    if (!batch.length) return;
    await client.query(
      `insert into canon_titles (canonical_key, title_type, primary_title, sort_title,
        release_year, runtime_minutes, original_language, overview, is_fixture, source_id)
       values ${placeholders.join(',')} on conflict (canonical_key) do nothing`, batch);
    batch = []; placeholders = [];
  };
  for (const t of generateTitles(seed, profile)) {
    const b = batch.length;
    placeholders.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},true,$${b + 9})`);
    batch.push(t.canonicalKey, t.titleType, t.primaryTitle, t.sortTitle, t.releaseYear,
               t.runtimeMinutes, t.originalLanguage, t.overview, sourceId);
    titleCount++;
    if (placeholders.length >= BATCH) await flushTitles();
  }
  await flushTitles();

  await client.query('commit');
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const { rows: counts } = await client.query(`
    select (select count(*) from canon_titles where is_fixture) as titles,
           (select count(*) from dist_services where is_fixture) as services`);
  console.log(JSON.stringify({ elapsedSeconds: Number(elapsed), generated: { titles: titleCount }, inDatabase: counts[0] }, null, 2));
  await client.end();
}

(async () => {
  if (cmd === 'count') await count();
  else if (cmd === 'simulate') simulate();
  else if (cmd === 'load') await load();
  else { console.error(`unknown command: ${cmd}`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
