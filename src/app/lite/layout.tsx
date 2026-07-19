import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WatchVrdIQt — Simple' };

/**
 * The "second copy": a deliberately minimal shell with no app chrome. Guests get
 * an anonymous session via middleware (/lite is a protected prefix), so the link
 * drops anyone straight onto the simple launcher with nothing in the way.
 */
export default function LiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh pb-12">{children}</div>;
}
