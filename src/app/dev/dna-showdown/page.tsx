import { notFound } from 'next/navigation';
import { Showdown } from '@/components/showdown/Showdown';

/** Dev harness — the real component, no auth, so a browser can play it. 404 in production. */
export const dynamic = 'force-dynamic';

export default function ShowdownHarnessPage() {
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') notFound();
  return <main className="min-h-screen bg-cinema-radial">{<Showdown />}</main>;
}
