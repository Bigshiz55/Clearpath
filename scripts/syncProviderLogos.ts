/**
 * PROPOSE VERIFIED PROVIDER LOGO PATHS FROM TMDB — FOR REVIEW, NOT FOR TRUST.
 *
 * `src/lib/providers/assets.ts` holds the brand marks WatchVerd1ct renders when
 * a surface knows only a canonical service. Every entry there was fetched and
 * LOOKED AT before it was written down, because a 200 from image.tmdb.org only
 * proves that some image exists — not that it is the right company's mark, and
 * a wrong logo is a false claim about who carries a title.
 *
 * That verification needs TMDB's own provider list, which needs the server key.
 * This script reads it and prints the candidate rows for the brands still
 * missing an asset. It deliberately does NOT write the file: a human (or an
 * agent that can render the image) confirms each mark first, then pastes it in.
 *
 * Run:  TMDB_API_KEY=… npx tsx scripts/syncProviderLogos.ts
 *
 * Output is a ready-to-paste block plus the image URL for each candidate, so
 * checking one is a click.
 */
import { STREAMING_SERVICES } from '../src/lib/services';
import { PROVIDER_ASSETS, assetForProvider } from '../src/lib/providers/assets';
import { officialProviderName } from '../src/lib/providers/brand';

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

async function fetchProviders(key: string): Promise<TmdbProvider[]> {
  const seen = new Map<number, TmdbProvider>();
  for (const kind of ['movie', 'tv']) {
    const url = `https://api.themoviedb.org/3/watch/providers/${kind}?api_key=${key}&watch_region=US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB ${kind} providers: ${res.status}`);
    const json = (await res.json()) as { results?: TmdbProvider[] };
    for (const p of json.results ?? []) if (!seen.has(p.provider_id)) seen.set(p.provider_id, p);
  }
  return [...seen.values()];
}

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error('TMDB_API_KEY is required. This script never writes assets.ts — it only proposes rows.');
    process.exit(2);
  }
  const providers = await fetchProviders(key);
  const byId = new Map(providers.map((p) => [p.provider_id, p]));

  const missing = STREAMING_SERVICES.filter((s) => assetForProvider(officialProviderName(s.name), s.id) == null);
  console.log(`${STREAMING_SERVICES.length - missing.length}/${STREAMING_SERVICES.length} catalogue services already have a verified asset.\n`);
  if (missing.length === 0) return;

  console.log('CANDIDATES — open each URL, confirm it is that brand, then paste the row into');
  console.log('src/lib/providers/assets.ts. Do not paste one you have not looked at.\n');
  for (const s of missing) {
    // Every id variant this service is known by, so a brand whose base id has
    // no logo can still be matched through one of its plan entries.
    const hit = s.ids.map((id) => byId.get(id)).find((p) => p?.logo_path);
    if (!hit?.logo_path) {
      console.log(`  ${s.name}: TMDB lists no logo for ids ${s.ids.join(', ')} — legitimate text fallback.`);
      continue;
    }
    console.log(`  ${s.name}`);
    console.log(`    https://image.tmdb.org/t/p/w154${hit.logo_path}`);
    console.log(`    { providerId: ${hit.provider_id}, name: '${officialProviderName(s.name)}', logoPath: '${hit.logo_path}' },`);
  }
  console.log(`\nCurrent table holds ${PROVIDER_ASSETS.length} verified assets.`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
