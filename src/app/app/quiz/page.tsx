import { redirect } from 'next/navigation';

/**
 * The title quiz IS the Taste Quiz now, so this URL forwards instead of holding
 * a second copy of it. Many places link here — the DNA page, the dials empty
 * state, the booster packs, founder sessions — and all of them keep working,
 * including `?session=` for an isolated founder calibration.
 */
export const dynamic = 'force-dynamic';

export default function LegacyQuizRoute({ searchParams }: { searchParams?: { session?: string } }) {
  // No `mode` any more — the Taste Quiz is the title grid, full stop. The
  // founder session is the one parameter that still has to survive the hop.
  const params = new URLSearchParams();
  if (searchParams?.session) params.set('session', searchParams.session);
  const qs = params.toString();
  redirect(qs ? `/app/taste-quiz?${qs}` : '/app/taste-quiz');
}
