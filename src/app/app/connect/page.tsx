import type { Metadata } from 'next';
import { ConnectPhone } from '@/components/ConnectPhone';

export const metadata: Metadata = { title: 'Connect your phone · WatchVerdict' };

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">📱 Add from your phone</h1>
      <p className="mt-2 text-sm text-slate-400">
        Say it to Siri or share a screenshot — and it lands on your watchlist. Set it up once below.
      </p>
      <div className="mt-5">
        <ConnectPhone />
      </div>
    </div>
  );
}
