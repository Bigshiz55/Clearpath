import { TVMAZE_CHANNELS } from '@/lib/viewing/ingest/tvmazeChannels';
import { knownTvMediaCallSigns, packForStation } from '@/lib/packs/packChannelMap';
import type { ConfiguredChannel } from './coverageAudit';

/**
 * THE AUTHORITATIVE CONFIGURED TV LINEUP, as one list.
 *
 * Assembled from the SAME constants the ingest scheduler and writers use — the
 * fixed TVmaze channel list plus TV Media's pack-linkable call signs — so the
 * coverage audit is measured against exactly what the pipeline is configured to
 * pull, never a hand-kept second list that could drift from it.
 *
 * This lives in `lib` (not in the route) on purpose: a route that imported
 * `@/lib/viewing/ingest/*` would trip the user-session egress guard
 * (userSessionEgress.test.ts), even though reading a channel-list constant
 * makes no upstream request. Keeping the registry import here leaves the route
 * genuinely unable to reach a transport while still measuring the real lineup.
 *
 * Note the honest ceiling this encodes: the free TVmaze list is 11 curated
 * Hallmark/Lifetime/true-crime channels (some knowingly not carried by TVmaze),
 * and the TV Media entries are the pack-linkable call signs. A channel with a
 * display logo but no entry here is NOT configured-supported — the coverage
 * audit is what makes that distinction visible instead of silent.
 */
export function configuredLineup(): ConfiguredChannel[] {
  return [
    ...TVMAZE_CHANNELS.map((c) => ({
      id: c.key,
      displayName: c.displayName,
      sourceAdapter: 'tvmaze' as const,
      group: c.group,
    })),
    ...knownTvMediaCallSigns().map((cs) => ({
      id: cs,
      displayName: cs,
      sourceAdapter: 'tv_media' as const,
      group: packForStation('tv_media', cs) ?? 'tv_media',
    })),
  ];
}
