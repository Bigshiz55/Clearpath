import Link from 'next/link';
import type { WatchProviders } from '@/lib/types';
import { tonightAvailability } from '@/lib/services';
import { getServerI18n } from '@/i18n/server';

/**
 * A one-line, honest "can I watch this tonight on a plan I already have?" call,
 * shown only once the user has told us which services they subscribe to.
 */
export function TonightBanner({
  providers,
  myServices,
}: {
  providers: WatchProviders | null;
  myServices: number[];
}) {
  const { t } = getServerI18n();
  // Only meaningful once the user has picked services and we have provider data.
  if (myServices.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300">
        💡 {t('title.extras.tonightTellA')}
        <Link href="/app/settings" className="text-brand-300 underline">
          {t('title.extras.tonightSettings')}
        </Link>
        {t('title.extras.tonightTellB')}
      </div>
    );
  }
  if (!providers || !providers.available) return null;

  const a = tonightAvailability(providers.options, myServices);
  switch (a.kind) {
    case 'included':
      return (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100">
          ✓ {t('title.extras.tonightIncluded', { services: a.services.join(' & ') })}
        </div>
      );
    case 'elsewhere':
      return (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
          {t('title.extras.tonightElsewhere', { services: a.services.join(', ') })}
        </div>
      );
    case 'rent_buy':
      return (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300">
          {t('title.extras.tonightRentBuy')}
        </div>
      );
    default:
      return null;
  }
}
