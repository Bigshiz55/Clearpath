import { notFound } from 'next/navigation';
import { TonightMachine } from '@/components/tonight/TonightMachine';
import { TonightDevEvents } from '@/components/tonight/TonightDevEvents';

/** Dev harness — the real component, no auth. 404 in production. */
export const dynamic = 'force-dynamic';

export default function TonightHarness() {
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') notFound();
  return (
    <main className="min-h-screen bg-cinema-radial">
      {/* Captures the real event stream so a browser test can check the wiring,
          not just the builders. Dev-only: this page does not exist in prod. */}
      <TonightDevEvents />
      <TonightMachine />
    </main>
  );
}
