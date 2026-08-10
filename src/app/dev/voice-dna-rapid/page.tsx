import { notFound } from 'next/navigation';
import { RapidCalibration } from '@/components/voice/calibration/RapidCalibration';

/**
 * Dev harness for the 60-second calibration.
 *
 * `/voice-dna` needs a Supabase session, which a locally-booted test server does
 * not have. This route renders the SAME component with no auth so a real browser
 * can drive the real thing — speech injection, barge-in, taps, reload resume —
 * instead of a mock of it. The server action it calls will fail without a
 * session, which is deliberate: it also exercises the path where saving fails
 * and the user still gets their result.
 *
 * Never reachable in production: `VERCEL_ENV=production` is a hard 404, matching
 * `/dev/reliability` and the rest of the `/dev` surface.
 */
export const dynamic = 'force-dynamic';

export default function VoiceDnaRapidHarnessPage() {
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') notFound();
  return (
    <main className="min-h-screen bg-cinema-radial">
      <RapidCalibration />
    </main>
  );
}
