import { redirect } from 'next/navigation';

/**
 * The title quiz is now a LANE of the Taste Quiz rather than a separate
 * feature, so this URL forwards instead of holding a second copy of it. Many
 * places link here — the DNA page, the dials empty state, the booster packs,
 * founder sessions — and all of them keep working, including `?session=` for an
 * isolated founder calibration.
 */
export const dynamic = 'force-dynamic';

export default function LegacyQuizRoute({ searchParams }: { searchParams?: { session?: string } }) {
  const params = new URLSearchParams({ mode: 'titles' });
  if (searchParams?.session) params.set('session', searchParams.session);
  redirect(`/app/taste-quiz?${params.toString()}`);
}
