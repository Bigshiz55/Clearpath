import { notFound } from 'next/navigation';
import { OnTvDashboard } from '@/components/ontv/OnTvDashboard';

/**
 * Deterministic On TV harness for responsive/visual tests. Fixed `now` so on-now /
 * starting-soon items always exist and screenshots are stable. No auth. Gated
 * behind RESPONSIVE_HARNESS=1 so it never ships in normal builds.
 */
export const dynamic = 'force-dynamic';

// A fixed reference instant (8:30pm ET) so the mock schedule is deterministic.
const FIXED_NOW = Date.parse('2026-03-16T20:30:00-04:00');

export default function DevOnTv({ searchParams }: { searchParams: { q?: string } }) {
  if (process.env.RESPONSIVE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <OnTvDashboard now={FIXED_NOW} tz="America/New_York" query={searchParams.q} active="for-you" />
    </div>
  );
}
