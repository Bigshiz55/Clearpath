/**
 * GUIDE COVERAGE AUDIT — what the source can actually answer, right now.
 *
 * Run it before believing any claim about how "full" the Full Guide is:
 *
 *   npx tsx scripts/tv/guideCoverageAudit.ts            # next 6 hours
 *   npx tsx scripts/tv/guideCoverageAudit.ts --hours 24
 *
 * It asks TVmaze the SAME question the ingest asks (`/schedule?country=US`),
 * applies the SAME allowlist the ingest applies (imported, never re-typed, so
 * the audit cannot drift from the product), and then reports the gap between
 * what we allow and what the source can supply.
 *
 * WHY THIS EXISTS. "The guide only shows 12 channels" has at least six
 * candidate causes — no schedule record, an endpoint limitation, timezone
 * handling, episodic-only modelling, a naming mismatch, or an ingest bug — and
 * they are indistinguishable from the UI. This separates them with numbers, so
 * a coverage decision is made against measurement rather than intuition.
 *
 * It reads only public data and writes nothing.
 */
import { MAJOR_US_NETWORKS, isMajorUsNetwork } from '../../src/lib/viewing/ingest/nationalNetworks';

interface ScheduleEpisode {
  id: number;
  airstamp?: string | null;
  name?: string | null;
  show?: {
    name?: string | null;
    network?: { name?: string | null; country?: { code?: string | null } | null } | null;
    webChannel?: { name?: string | null } | null;
  } | null;
}

const HOURS = (() => {
  const i = process.argv.indexOf('--hours');
  return i >= 0 ? Number(process.argv[i + 1]) || 6 : 6;
})();

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchDay(date: string): Promise<ScheduleEpisode[]> {
  const r = await fetch(`https://api.tvmaze.com/schedule?country=US&date=${date}`);
  if (!r.ok) throw new Error(`TVmaze ${date} → HTTP ${r.status}`);
  return (await r.json()) as ScheduleEpisode[];
}

async function main() {
  const now = new Date();
  const until = new Date(now.getTime() + HOURS * 3600_000);

  // A window can cross midnight UTC *and* midnight in the schedule's own local
  // dating, so pull yesterday/today/tomorrow and filter by real timestamps
  // rather than trusting one day's bucket. Timezone handling is one of the
  // candidate causes this audit has to be able to rule out.
  const days = [-1, 0, 1].map((d) => ymd(new Date(now.getTime() + d * 86400_000)));
  const all: ScheduleEpisode[] = [];
  for (const d of days) all.push(...(await fetchDay(d)));

  const inWindow = all.filter((e) => {
    if (!e.airstamp) return false;
    const t = new Date(e.airstamp).getTime();
    return t >= now.getTime() && t < until.getTime();
  });

  // ---- Classify every row by what the SOURCE says it is ---------------------
  const linearNames = new Map<string, number>(); // rows carrying show.network
  const webOnlyNames = new Map<string, number>(); // rows carrying ONLY webChannel
  for (const e of inWindow) {
    const net = e.show?.network?.name?.trim();
    const web = e.show?.webChannel?.name?.trim();
    if (net) linearNames.set(net, (linearNames.get(net) ?? 0) + 1);
    else if (web) webOnlyNames.set(web, (webOnlyNames.get(web) ?? 0) + 1);
  }

  const admittedLinear = [...linearNames.keys()].filter(isMajorUsNetwork).sort();
  const rejectedLinear = [...linearNames.keys()].filter((n) => !isMajorUsNetwork(n)).sort();
  // The bug this audit was written to size: web-only rows that the CURRENT
  // matcher would admit as if they were linear networks.
  const webAdmittedToday = [...webOnlyNames.keys()].filter(isMajorUsNetwork).sort();
  const webRejectedToday = [...webOnlyNames.keys()].filter((n) => !isMajorUsNetwork(n)).sort();

  const coveredAllowlist = new Set<string>();
  for (const name of [...linearNames.keys()]) {
    const hit = MAJOR_US_NETWORKS.find((n) => isMajorUsNetwork(name) && name.toLowerCase().startsWith(n));
    if (hit) coveredAllowlist.add(hit);
  }
  const uncovered = MAJOR_US_NETWORKS.filter((n) => !coveredAllowlist.has(n));

  const out = {
    generatedAt: now.toISOString(),
    windowHours: HOURS,
    windowUtc: [now.toISOString(), until.toISOString()],
    daysFetched: days,
    totals: {
      allowlistedLinearChannels: MAJOR_US_NETWORKS.length,
      sourceRowsAllDays: all.length,
      sourceRowsInWindow: inWindow.length,
      distinctLinearNetworksInWindow: linearNames.size,
      distinctWebOnlyChannelsInWindow: webOnlyNames.size,
      allowlistedLinearWithCoverage: coveredAllowlist.size,
      allowlistedLinearWithZeroCoverage: uncovered.length,
    },
    admittedLinear,
    rejectedLinear,
    webOnlyChannels: {
      admittedByCurrentMatcher: webAdmittedToday,
      rejectedByCurrentMatcher: webRejectedToday,
    },
    allowlistedWithZeroCoverage: uncovered,
    perLinearNetworkRowCount: Object.fromEntries([...linearNames.entries()].sort((a, b) => b[1] - a[1])),
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
