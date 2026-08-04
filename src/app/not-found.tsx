'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

export default function NotFound() {
  const pathname = usePathname();

  useEffect(() => {
    // Pathname only, never the query string — a search box's own query can
    // land in the URL, and that's exactly the "entertainment preference"
    // text item 9 says never to collect.
    reportReliabilityEvent('not_found', { path: (pathname ?? '').slice(0, 80) });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="mt-4 text-3xl font-bold text-white">Not found</h1>
      <p className="max-w-sm text-sm text-slate-400">
        We couldn’t find that page or title. It may have been removed, or the link may be incorrect.
      </p>
      <Link href="/" className="btn-primary mt-2">
        Go home
      </Link>
    </div>
  );
}
