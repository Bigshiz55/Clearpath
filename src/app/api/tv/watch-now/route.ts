import { NextResponse } from 'next/server';
import { queryWatchNow, type WatchKind } from '@/lib/tv/platform/query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * WHAT TO WATCH — the one internal read for the unified experience.
 *
 * Streaming offers and linear airings come back through a single shape, so a
 * surface never has to know which pipeline produced a row. Every item carries
 * its own provenance: source, support stage, coverage level, confidence and
 * freshness.
 *
 * IT MAKES NO UPSTREAM REQUEST. A user page load must never reach a provider,
 * so this reads generated fixtures or stored rows and nothing else. That is
 * enforced upstream by the egress guard rather than promised here.
 *
 * A misconfigured production deployment gets `configuration_error` with a
 * reason, never an empty list — "nothing is on tonight" and "nobody
 * configured this deployment" must not look the same to a caller.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const kind: WatchKind | 'all' =
    kindParam === 'streaming' || kindParam === 'linear' ? kindParam : 'all';

  const services = url.searchParams.get('services')?.split(',').map((s) => s.trim()).filter(Boolean);
  const limitRaw = Number(url.searchParams.get('limit') ?? '40');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 40;

  const result = queryWatchNow({
    kind,
    services: services?.length ? services : undefined,
    includedOnly: url.searchParams.get('included') === '1',
    limit,
  });

  return NextResponse.json(result, {
    status: result.status === 'configuration_error' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
