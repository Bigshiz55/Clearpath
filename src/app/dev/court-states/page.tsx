import { notFound } from 'next/navigation';
import { CourtStatesHarness } from './Harness';

/**
 * Live Court diagnostics + error-state gallery. Dev-only (RESPONSIVE_HARNESS=1) so it
 * never ships to normal production users. Renders the real CourtErrorCard for every
 * classified state plus the invite-URL + health diagnostics.
 */
export const dynamic = 'force-dynamic';

export default function DevCourtStates() {
  if (process.env.RESPONSIVE_HARNESS !== '1') notFound();
  return <CourtStatesHarness />;
}
