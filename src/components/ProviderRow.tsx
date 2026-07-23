import type { WatchProviders, WatchProvider } from '@/lib/types';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb/client';
import { isProviderMine } from '@/lib/services';
import { outHref, providerPayout } from '@/lib/affiliate';
import { getServerI18n } from '@/i18n/server';

/** WatchProvider type → catalog key under discover.provider.*. */
const TYPE_KEY: Record<WatchProvider['type'], string> = {
  flatrate: 'stream',
  free: 'free',
  ads: 'freeAds',
  rent: 'rent',
  buy: 'buy',
};

const TYPE_ORDER: WatchProvider['type'][] = ['flatrate', 'free', 'ads', 'rent', 'buy'];

type Translate = (key: string, params?: Record<string, string | number>) => string;

function ProviderLogo({ p, mine, t }: { p: WatchProvider; mine: boolean; t: Translate }) {
  const src = p.logoPath ? `${TMDB_IMAGE_BASE}/w92${p.logoPath}` : null;
  const inner = (
    <>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-6 w-6 rounded" loading="lazy" />
      ) : (
        <div className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px] font-bold text-slate-300">
          {p.providerName.slice(0, 2)}
        </div>
      )}
      <span className={`text-xs font-medium ${mine ? 'text-emerald-100' : 'text-slate-200'}`}>{p.providerName}</span>
      {mine && <span className="text-[10px] font-bold text-emerald-300">{t('discover.provider.yours')}</span>}
      {p.link && <span aria-hidden className="text-[11px] text-brand-300">↗</span>}
    </>
  );
  const cls = `flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${
    mine ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/10 bg-white/5'
  }`;

  // Watchmode gives us a deep link straight to the title on this service — make
  // the badge tappable ("open it on Netflix"). Routed through /api/out so the
  // click is attributable and gets our affiliate tag. Falls back to a static badge.
  if (p.link) {
    return (
      <a
        href={outHref({ u: p.link, p: p.providerName, t: p.type })}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`${cls} hover:border-brand-400/60 hover:bg-brand-500/15`}
        title={t('discover.provider.openProvider', { name: p.providerName })}
      >
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function ProviderRow({
  providers,
  myServices = [],
}: {
  providers: WatchProviders | null;
  myServices?: number[];
}) {
  const { t } = getServerI18n();
  if (!providers) {
    return (
      <p className="text-sm text-slate-400">
        {t('discover.provider.notRequested')}
      </p>
    );
  }
  if (!providers.available || providers.options.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {t('discover.provider.noneFoundA')}
        <span className="font-medium text-slate-200">{providers.region}</span>{t('discover.provider.noneFoundB')}
      </p>
    );
  }

  // Within each type group, surface the user's own services first (honest best
  // pick — they already pay for it), then order by our payout weight so the
  // best-monetizing option leads. Ordering only — every real option still shows.
  const isMineType = (t: WatchProvider['type']) => t === 'flatrate' || t === 'free' || t === 'ads';
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: providers.options
      .filter((o) => o.type === type)
      .map((o, i) => ({ o, i }))
      .sort((a, b) => {
        if (isMineType(type)) {
          const am = isProviderMine(a.o.providerId, myServices) ? 1 : 0;
          const bm = isProviderMine(b.o.providerId, myServices) ? 1 : 0;
          if (am !== bm) return bm - am;
        }
        const dp = providerPayout(b.o.providerName) - providerPayout(a.o.providerName);
        return dp !== 0 ? dp : a.i - b.i; // stable within equal payout
      })
      .map((x) => x.o),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      {grouped.map((g) => (
        <div key={g.type}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t(`discover.provider.${TYPE_KEY[g.type]}`)}
          </div>
          <div className="flex flex-wrap gap-2">
            {g.items.map((p) => (
              <ProviderLogo
                key={`${g.type}-${p.providerId}`}
                p={p}
                mine={(g.type === 'flatrate' || g.type === 'free' || g.type === 'ads') && isProviderMine(p.providerId, myServices)}
                t={t}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-slate-500">
        {t('discover.provider.footer', { region: providers.region })}
        {providers.link ? (
          <>
            {' '}
            <a href={providers.link} target="_blank" rel="noopener noreferrer" className="text-brand-300 underline">
              {t('discover.provider.viewJustWatch')}
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}
