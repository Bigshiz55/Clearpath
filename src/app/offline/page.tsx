import { Logo } from '@/components/Logo';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="mt-4 text-2xl font-bold text-white">You’re offline</h1>
      <p className="max-w-sm text-sm text-slate-400">
        WatchVrdikt needs a connection to fetch verdicts and title data. Reconnect and try again —
        your watchlist is safe.
      </p>
    </div>
  );
}
