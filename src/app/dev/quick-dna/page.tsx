import { notFound } from 'next/navigation';
import { QuickDna } from '@/components/voice/quickdna/QuickDna';

/**
 * Dev harness for Quick DNA.
 *
 * `/voice-dna` needs a Supabase session, which a locally-booted test server has
 * not got. This renders the SAME component with no auth so a real browser can
 * drive the real thing — speech, barge-in, taps, reload — rather than a mock.
 * The save action fails without a session, which is deliberate: it also proves
 * a failed write still leaves the person holding their result.
 *
 * Never reachable in production: `VERCEL_ENV=production` is a hard 404.
 */
export const dynamic = 'force-dynamic';

export default function QuickDnaHarnessPage() {
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') notFound();
  return (
    <main className="min-h-screen bg-cinema-radial">
      <QuickDna />
    </main>
  );
}
