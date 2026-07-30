#!/usr/bin/env node
/**
 * SEED TITLE FACTS — the ONLY component that talks to TMDB for public pages.
 *
 * Writes src/lib/discovery/data/titleFacts.json, which the movie/show
 * templates read at build time. Public page requests therefore never make a
 * live third-party call, as the platform spec requires.
 *
 * Usage:  TMDB_API_KEY=... node scripts/seed-title-facts.mjs [--limit 150]
 *
 * Editorial fields (verdictSummary / whoItIsFor / whoShouldSkip) are NOT
 * generated here. A title without them fails the quality gate and stays a
 * draft — which is the correct outcome, because auto-generated boilerplate is
 * exactly what this platform refuses to publish. Write them in the CMS.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = join(process.cwd(), 'src/lib/discovery/data/titleFacts.json');
const KEY = process.env.TMDB_API_KEY;
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 150;
const REGION = process.env.TMDB_REGION || 'US';

if (!KEY) {
  console.error('TMDB_API_KEY is not set. No live calls made; the existing cache is unchanged.');
  console.error('Without it, zero movie/show pages can publish — the quality gate requires');
  console.error('verified availability and rating evidence, which cannot be invented.');
  process.exit(1);
}

const slugify = (s, year) =>
  `${s}`.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + (year ? `-${year}` : '');

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json();
}

async function factsFor(mediaType, id) {
  const detail = await tmdb(`/${mediaType}/${id}`, { append_to_response: 'watch/providers' });
  const provRegion = detail['watch/providers']?.results?.[REGION];
  const providers = [
    ...(provRegion?.flatrate ?? []),
    ...(provRegion?.free ?? []),
  ].map((p) => p.provider_name);
  const ratings = [];
  if (typeof detail.vote_average === 'number' && detail.vote_count > 50) {
    ratings.push({ source: 'TMDB audience', value: `${Math.round(detail.vote_average * 10)}%` });
  }
  const isTv = mediaType === 'tv';
  return {
    tmdbId: id,
    mediaType,
    title: isTv ? detail.name : detail.title,
    year: Number(String(isTv ? detail.first_air_date : detail.release_date).slice(0, 4)) || null,
    runtimeMinutes: isTv ? (detail.episode_run_time?.[0] ?? null) : (detail.runtime ?? null),
    genres: (detail.genres ?? []).map((g) => g.name),
    posterUrl: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
    providers: [...new Set(providers)],
    ratings,
    seasons: isTv ? (detail.number_of_seasons ?? null) : undefined,
    episodes: isTv ? (detail.number_of_episodes ?? null) : undefined,
    seriesStatus: isTv ? (detail.status ?? null) : undefined,
    overview: detail.overview ?? '',
  };
}

async function main() {
  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const byKey = new Map(existing.map((t) => [`${t.mediaType}-${t.tmdbId}`, t]));

  const pool = [];
  for (const [mediaType, path] of [['movie', '/movie/popular'], ['tv', '/tv/popular']]) {
    for (let page = 1; page <= Math.ceil(LIMIT / 40); page++) {
      const data = await tmdb(path, { page, region: REGION });
      for (const r of data.results ?? []) pool.push({ mediaType, id: r.id });
    }
  }

  let added = 0;
  for (const c of pool.slice(0, LIMIT)) {
    const key = `${c.mediaType}-${c.id}`;
    try {
      const f = await factsFor(c.mediaType, c.id);
      if (!f.title) continue;
      const prev = byKey.get(key);
      byKey.set(key, {
        ...f,
        slug: prev?.slug ?? slugify(f.title, f.year),
        cachedAt: new Date().toISOString().slice(0, 10),
        // Editorial fields are preserved across re-seeds and never invented.
        verdictSummary: prev?.verdictSummary ?? '',
        whoItIsFor: prev?.whoItIsFor ?? '',
        whoShouldSkip: prev?.whoShouldSkip ?? '',
        characteristics: prev?.characteristics ?? [],
        contentNotes: prev?.contentNotes ?? [],
        similar: prev?.similar ?? [],
      });
      added++;
    } catch (e) {
      console.warn(`skipped ${key}: ${e.message}`);
    }
  }

  const out = [...byKey.values()];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  const ready = out.filter((t) => t.verdictSummary && t.providers.length && t.ratings.length).length;
  console.log(`Cached ${out.length} titles (${added} refreshed).`);
  console.log(`${ready} have everything the quality gate needs; the rest stay DRAFT until editorial is written.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
