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

const COURT_URL = 'https://clearpath-pearl-chi.vercel.app/court/ABCD';

export default async function DevCourtInvite({ searchParams }: { searchParams: { mode?: string } }) {
  if (process.env.RESPONSIVE_HARNESS !== '1') notFound();
  const mode = searchParams.mode ?? 'share';
  // `missing` mode exercises the invalid-URL error path (URL not ready before tap).
  const url = mode === 'missing' ? '' : COURT_URL;
  const qr = url ? await qrForUrl(url) : null;
  return <CourtInviteHarness url={url} qr={qr} mode={mode} />;
}
