#!/usr/bin/env node
/**
 * One-off fixture generator for the true crime Case matching pipeline.
 * Pulls real episode data from the public TVmaze API — never invents
 * episodes. Run manually (`node scripts/fetch-true-crime-fixtures.mjs`) to
 * regenerate `src/lib/cases/fixtures/trueCrimeEpisodes.json`. Not part of the
 * app runtime and not run in CI.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'src', 'lib', 'cases', 'fixtures', 'trueCrimeEpisodes.json');

// TVmaze show ids for real true-crime series, spanning distinct networks.
const SHOWS = [
  { id: 5390, series: 'Dateline NBC' },
  { id: 4408, series: '48 Hours' },
  { id: 1401, series: '20/20' },
  { id: 974, series: 'Snapped' },
  { id: 1381, series: 'The First 48' },
  { id: 25479, series: 'Cold Case Files' },
];

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const episodes = [];
  for (const show of SHOWS) {
    const meta = await fetchJson(`https://api.tvmaze.com/shows/${show.id}`);
    const network = meta.network?.name ?? meta.webChannel?.name ?? 'Unknown';
    const eps = await fetchJson(`https://api.tvmaze.com/shows/${show.id}/episodes`);
    for (const ep of eps) {
      const summary = stripHtml(ep.summary);
      if (!summary || summary.length < 40) continue; // no fabricated synopses — skip if TVmaze has none
      episodes.push({
        tvmazeEpisodeId: ep.id,
        series: show.series,
        network,
        title: ep.name,
        season: ep.season,
        episode: ep.number,
        airdate: ep.airdate,
        synopsis: summary,
      });
    }
    console.error(`${show.series} (${network}): ${eps.length} episodes, ${episodes.filter((e) => e.series === show.series).length} with usable synopses`);
  }

  console.error(`Total usable episodes: ${episodes.length}`);
  console.error(`Distinct networks: ${[...new Set(episodes.map((e) => e.network))].join(', ')}`);

  writeFileSync(OUT_PATH, JSON.stringify(episodes, null, 2) + '\n');
  console.error(`Wrote ${episodes.length} episodes to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error('FAILED — TVmaze unreachable or errored:', e.message);
  process.exit(1);
});
