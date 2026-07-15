import Link from 'next/link';
import type { WatchProviders } from '@/lib/types';
import { tonightAvailability } from '@/lib/services';

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
  // Only meaningful once the user has picked services and we have provider data.
  if (myServices.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300">
        💡 Tell us your streaming services in{' '}
        <Link href="/app/settings" className="text-brand-300 underline">
          Settings
        </Link>{' '}
        and every verdict will flag what’s free on a plan you already have.
      </div>
    );
  }
  if (!providers || !providers.available) return null;

  const a = tonightAvailability(providers.options, myServices);
  switch (a.kind) {
    case 'included':
      return (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100">
          ✓ You can watch this tonight — included with your {a.services.join(' & ')}.
        </div>
      );
    case 'elsewhere':
      return (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
          Streaming on {a.services.join(', ')} — not on a plan you told us you have.
        </div>
      );
    case 'rent_buy':
      return (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300">
          Not on your services — rent or buy only right now.
        </div>
      );
    default:
      return null;
  }
}
