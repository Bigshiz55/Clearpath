import { notFound } from 'next/navigation';
import { qrForUrl } from '@/lib/actions/qr';
import { CourtInviteHarness } from './Harness';

/**
 * Court "Send invite" harness (RESPONSIVE_HARNESS=1). Renders the real
 * CourtInviteBox with a deterministic fake navigator chosen by `?mode=` so
 * Playwright can drive share/cancel/error/unsupported/clipfail/hang branches, plus
 * the responsive QR layout. A real QR is generated server-side.
 */
export const dynamic = 'force-dynamic';

const COURT_URL = 'https://watchverdict.app/court/ABCD';

export default async function DevCourtInvite({ searchParams }: { searchParams: { mode?: string } }) {
  if (process.env.RESPONSIVE_HARNESS !== '1') notFound();
  const qr = await qrForUrl(COURT_URL);
  return <CourtInviteHarness url={COURT_URL} qr={qr} mode={searchParams.mode ?? 'share'} />;
}
