import { OnTvDashboard } from '@/components/ontv/OnTvDashboard';

/**
 * /app/on-tv — the On TV For You dashboard. Wide layout (uses the viewport, never a
 * narrow centered column). Personalized, no mandatory quiz, no Judge Verity, no
 * sports. Phase-1 renders labelled development mock data; the production
 * ScheduleProvider is the documented drop-in.
 */
export const dynamic = 'force-dynamic';

export default function OnTvPage({ searchParams }: { searchParams: { q?: string } }) {
  // Timezone resolution: production reads the user's saved locale/region; the
  // default keeps schedule times in a single, clearly-converted zone.
  const tz = 'America/New_York';
  return <OnTvDashboard now={Date.now()} tz={tz} query={searchParams.q} active="for-you" />;
}
