import { notFound } from 'next/navigation';
import { CourtRoom } from '@/components/court/CourtRoom';

/**
 * COURT harness (gated by MOBILE_HARNESS=1) — renders the REAL CourtRoom
 * component so the Playwright suite can drive every stage (join → tonight →
 * shortlist → react → Verd1ct → appeal → chat) with the Supabase RPC calls
 * intercepted. A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

export default function CourtHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return <CourtRoom code="HARNESS1" />;
}
