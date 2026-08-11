import { notFound } from 'next/navigation';
import { TonightMachine } from '@/components/tonight/TonightMachine';

/** Dev harness — the real component, no auth. 404 in production. */
export const dynamic = 'force-dynamic';

export default function TonightHarness() {
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') notFound();
  return <main className="min-h-screen bg-cinema-radial">{<TonightMachine />}</main>;
}
