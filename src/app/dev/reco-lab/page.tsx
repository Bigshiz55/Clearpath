import { notFound } from 'next/navigation';
import { RecoLabClient } from '@/components/reco/RecoLabClient';

/**
 * RECOMMENDATION LAB harness (MOBILE_HARNESS=1 only). Renders the REAL lab
 * component driven by the REAL funnel, running in the browser, so the whole
 * diagnostic can be tested without a Supabase session.
 *
 * A 404 in any normal build — the same gate every other /dev route uses.
 */
export const dynamic = 'force-dynamic';

export default function RecoLabHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return <RecoLabClient />;
}
