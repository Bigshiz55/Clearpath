import type { WatchProviders, WatchProvider } from '@/lib/types';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb/client';

const TYPE_LABELS: Record<WatchProvider['type'], string> = {
  flatrate: 'Stream',
  free: 'Free',
  ads: 'Free with ads',
  rent: 'Rent',
  buy: 'Buy',
};

const TYPE_ORDER: WatchProvider['type'][] = ['flatrate', 'free', 'ads', 'rent', 'buy'];

function ProviderLogo({ p }: { p: WatchProvider }) {
  const src = p.logoPath ? `${TMDB_IMAGE_BASE}/w92${p.logoPath}` : null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-6 w-6 rounded" loading="lazy" />
      ) : (
        <div className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px] font-bold text-slate-300">
          {p.providerName.slice(0, 2)}
        </div>
      )}
      <span className="text-xs font-medium text-slate-200">{p.providerName}</span>
    </div>
  );
}

export function ProviderRow({ providers }: { providers: WatchProviders | null }) {
  if (!providers) {
    return (
      <p className="text-sm text-slate-400">
        Streaming availability was not requested for this region.
      </p>
    );
  }
  if (!providers.available || providers.options.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No legal streaming, rental, or purchase options were found for{' '}
        <span className="font-medium text-slate-200">{providers.region}</span> right now. Availability
        changes often — check again later.
      </p>
    );
  }

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: providers.options.filter((o) => o.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      {grouped.map((g) => (
        <div key={g.type}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {TYPE_LABELS[g.type]}
          </div>
          <div className="flex flex-wrap gap-2">
            {g.items.map((p) => (
              <ProviderLogo key={`${g.type}-${p.providerId}`} p={p} />
            ))}
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-slate-500">
        Availability for {providers.region} provided by TMDB / JustWatch. Data may change and is not
        guaranteed to be current.
        {providers.link ? (
          <>
            {' '}
            <a href={providers.link} target="_blank" rel="noopener noreferrer" className="text-brand-300 underline">
              View on JustWatch
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}
