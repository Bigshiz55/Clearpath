import type { DiscoveryPage } from '@/lib/discovery/types';

/**
 * The poster + facts header for a movie or show page. Cinematic and premium,
 * matching the product's design system — and honest: anything the cache does
 * not hold is simply absent rather than filled with a placeholder value.
 */
export function TitleHero({ page }: { page: DiscoveryPage }) {
  const f = page.title_data;
  if (!f) return null;
  const facts: string[] = [];
  if (f.year) facts.push(String(f.year));
  facts.push(f.mediaType === 'tv' ? 'TV series' : 'Movie');
  if (f.mediaType === 'tv' && f.seasons) facts.push(`${f.seasons} season${f.seasons === 1 ? '' : 's'}`);
  if (f.mediaType === 'tv' && f.episodes) facts.push(`${f.episodes} episodes`);
  if (f.runtimeMinutes) facts.push(`${f.runtimeMinutes} min`);
  if (f.seriesStatus) facts.push(f.seriesStatus);

  return (
    <section className="container-page pt-8" data-testid="title-hero">
      <div className="flex flex-col gap-6 sm:flex-row">
        {f.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.posterUrl}
            alt={`Poster for ${page.heading}`}
            width={176}
            height={264}
            loading="eager"
            className="h-auto w-32 flex-none rounded-2xl border border-white/10 object-cover sm:w-44"
          />
        ) : (
          <div className="grid h-64 w-32 flex-none place-items-center rounded-2xl border border-white/10 bg-white/5 text-xs text-slate-500 sm:w-44">
            No artwork
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
            {facts.map((x) => <span key={x}>{x}</span>)}
          </div>
          {f.genres.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {f.genres.map((g) => (
                <li key={g} className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300">{g}</li>
              ))}
            </ul>
          )}
          {f.ratings.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2" data-testid="title-ratings">
              {f.ratings.map((r) => (
                <div key={r.source}>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{r.source}</dt>
                  <dd className="text-lg font-black tabular-nums text-white">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {f.providers.length > 0 ? (
            <p className="mt-4 text-sm text-slate-300" data-testid="title-availability">
              <span className="text-slate-400">Streaming on</span> {f.providers.join(', ')}
              <span className="ml-1 text-xs text-slate-500">· availability from our listings source</span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-amber-200" data-testid="title-availability">
              No verified streaming availability for your region right now.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
