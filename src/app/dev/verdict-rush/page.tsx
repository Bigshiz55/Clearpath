import { notFound } from 'next/navigation';
import { VerdictRush } from '@/components/dnagame/VerdictRush';

/** Dev harness — the real component, no auth, so a browser can play it. 404 in production. */
export const dynamic = 'force-dynamic';

export default function VerdictRushHarnessPage() {
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') notFound();
  return <main className="min-h-screen bg-cinema-radial">{<VerdictRush />}</main>;
}
