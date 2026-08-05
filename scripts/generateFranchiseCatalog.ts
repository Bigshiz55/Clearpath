/**
 * Resolve every franchise seed against the real catalog and write the result
 * to src/lib/packs/generated/franchiseCatalog.json.
 *
 * WHY A BUILD ARTIFACT AND NOT A REQUEST-TIME LOOKUP
 * Rendering a Pack used to fan out one catalog search per franchise — seven
 * for Hallmark alone, and every one of them on the critical path of a cold
 * customer GET. Franchise membership changes when a studio releases a film,
 * i.e. on the order of weeks. Resolving it at build time makes a Pack render
 * do ZERO upstream calls, which is both faster than caching and impossible
 * to accidentally regress: there is no code path left that could call out.
 *
 * SOURCES, in order of preference:
 *   1. TMDB_API_KEY in the environment — the real thing, used by CI/builds.
 *   2. --source=<origin> — a deployed WatchVerd1ct whose /api/search is
 *      already TMDB-backed. Same data, one hop further away; used when
 *      regenerating from an environment that holds no key of its own.
 *
 * Usage:
 *   npx tsx scripts/generateFranchiseCatalog.ts
 *   npx tsx scripts/generateFranchiseCatalog.ts --source=https://example.com
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  FRANCHISE_SEEDS, isFranchiseMember, orderMembers,
  type CatalogCandidate, type FranchiseSeed,
} from '../src/lib/packs/franchiseSeeds';

const OUT = join(process.cwd(), 'src/lib/packs/generated/franchiseCatalog.json');

const sourceArg = process.argv.find((a) => a.startsWith('--source='));
const sourceOrigin = sourceArg ? sourceArg.slice('--source='.length).replace(/\/$/, '') : null;
const tmdbKey = process.env.TMDB_API_KEY;

if (!tmdbKey && !sourceOrigin) {
  console.error('Need TMDB_API_KEY in the environment, or --source=<deployed origin>.');
  process.exit(1);
}

async function searchViaTmdb(query: string): Promise<CatalogCandidate[]> {
  const url = new URL('https://api.themoviedb.org/3/search/multi');
  url.searchParams.set('api_key', tmdbKey!);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${query}`);
  const body = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (body.results ?? [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => {
      const date = (r.release_date ?? r.first_air_date ?? '') as string;
      return {
        id: r.id as number,
        mediaType: r.media_type as 'movie' | 'tv',
        title: (r.title ?? r.name ?? '') as string,
        year: date ? Number(date.slice(0, 4)) : null,
        posterPath: (r.poster_path as string | null) ?? null,
      };
    });
}

async function searchViaDeployment(query: string): Promise<CatalogCandidate[]> {
  const url = `${sourceOrigin}/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${sourceOrigin} ${res.status} for ${query}`);
  const body = (await res.json()) as {
    results?: Array<{ id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterPath: string | null }>;
  };
  return (body.results ?? []).map((r) => ({
    id: r.id, mediaType: r.mediaType, title: r.title, year: r.year, posterPath: r.posterPath ?? null,
  }));
}

const search = tmdbKey ? searchViaTmdb : searchViaDeployment;

async function resolveSeed(seed: FranchiseSeed) {
  const seen = new Map<string, CatalogCandidate>();
  for (const q of seed.queries) {
    let results: CatalogCandidate[] = [];
    try {
      results = await search(q);
    } catch (e) {
      console.warn(`  ! query "${q}" failed: ${(e as Error).message}`);
      continue;
    }
    for (const r of results) seen.set(`${r.mediaType}:${r.id}`, r);
  }
  const members = [...seen.values()].filter((c) => isFranchiseMember(seed, c));
  const ordered = orderMembers(seed, members);

  // An editorial seed that cannot find one of its verified ids is a real
  // problem (a delisted title, or a typo) and must be visible, not silent.
  if (seed.membership === 'editorial') {
    const found = new Set(ordered.map((m) => m.id));
    const missing = (seed.includeIds ?? []).filter((id) => !found.has(id));
    if (missing.length > 0) console.warn(`  ! ${seed.name}: curated ids absent from catalog: ${missing.join(', ')}`);
  }

  return {
    pack: seed.pack,
    name: seed.name,
    kind: seed.kind,
    membership: seed.membership,
    // Order always comes from release dates, never from the seed.
    orderSource: 'release' as const,
    entries: ordered.map((m) => ({
      tmdbId: m.id, mediaType: m.mediaType, title: m.title, year: m.year, posterPath: m.posterPath,
    })),
  };
}

async function main() {
  console.log(`Resolving ${FRANCHISE_SEEDS.length} franchise seeds via ${tmdbKey ? 'TMDB' : sourceOrigin}…`);
  const groups = [];
  for (const seed of FRANCHISE_SEEDS) {
    const group = await resolveSeed(seed);
    console.log(`  ${group.pack.padEnd(18)} ${group.name.padEnd(42)} ${String(group.entries.length).padStart(2)} entries`);
    groups.push(group);
  }

  const empty = groups.filter((g) => g.entries.length === 0);
  if (empty.length > 0) {
    // Writing an artifact where a franchise silently vanished would ship a
    // regression that looks like an editorial decision.
    console.error(`\nRefusing to write: ${empty.length} franchise(s) resolved to nothing — ${empty.map((g) => g.name).join(', ')}`);
    process.exit(1);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ generatedFrom: tmdbKey ? 'tmdb' : sourceOrigin, groups }, null, 2)}\n`);
  console.log(`\nWrote ${OUT} — ${groups.length} groups, ${groups.reduce((n, g) => n + g.entries.length, 0)} entries.`);
}

void main();
