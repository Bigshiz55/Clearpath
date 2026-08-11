/**
 * 24-HOUR COVERAGE AUDIT — runnable, read-only, zero paid calls.
 *
 *   npx tsx scripts/tv/dayCoverageAudit.ts            # stored data
 *   npx tsx scripts/tv/dayCoverageAudit.ts --fixture  # a licensed-grid fixture
 *   npx tsx scripts/tv/dayCoverageAudit.ts --json
 *
 * Run it BEFORE and AFTER any TV Media activation. The before-run is the
 * baseline that makes the after-run mean something; without it "the guide looks
 * better" is an opinion.
 *
 * It never calls a provider. With no database configured it audits nothing and
 * says so, which is still a truthful answer — an empty audit that reports zero
 * coverage is correct, where an audit that skipped the channels would be a lie.
 */
import {
  buildDayCoverageAudit,
  formatDayAudit,
  MANDATORY_CHANNELS,
  type AuditListing,
} from '../../src/lib/tv/dayCoverageAudit';

const JSON_OUT = process.argv.includes('--json');
const FIXTURE = process.argv.includes('--fixture');
const HOUR = 3_600_000;

/**
 * A LICENSED-GRID FIXTURE — what a passing audit looks like.
 *
 * This is the shape a real EPG returns: a continuous day per channel, mostly
 * movies and reruns with paid programming overnight. It exists so the audit's
 * PASS path is exercised and demonstrable before we hold any such data, and so
 * a reviewer can see the intended end state rather than only today's failure.
 * It is explicitly labelled a fixture and is never mistaken for stored data.
 */
function fixtureListings(nowMs: number): AuditListing[] {
  const kinds: AuditListing['kind'][] = ['paid_programming', 'movie', 'movie', 'rerun', 'movie', 'special'];
  return MANDATORY_CHANNELS.flatMap((channel) =>
    Array.from({ length: 12 }, (_, i) => ({
      channelName: channel,
      startMs: nowMs + i * 2 * HOUR,
      endMs: nowMs + (i + 1) * 2 * HOUR,
      kind: kinds[i % kinds.length]!,
      providerId: 'tv_media',
    })),
  );
}

async function storedListings(): Promise<{ listings: AuditListing[]; lineup: string[]; lastSuccess: Record<string, number | null>; note: string }> {
  // The audit is deliberately decoupled from the database client: reading
  // stored rows requires service-role credentials this script must not assume.
  // When they are absent it reports an empty, honest audit rather than
  // pretending, and `--fixture` demonstrates the passing shape.
  const hasDb = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!hasDb) {
    return {
      listings: [],
      lineup: [...MANDATORY_CHANNELS],
      lastSuccess: {},
      note: 'No database credentials in this environment — audited against zero stored listings. Every mandatory channel therefore FAILS, which is the correct answer for "we cannot see any of them from here", not a script error.',
    };
  }
  const [{ getIngestedGuideAirings }, { createAdminClient }] = await Promise.all([
    import('../../src/lib/tv/ingestedGuide'),
    import('../../src/lib/supabase/admin'),
  ]);
  const airings = await getIngestedGuideAirings(createAdminClient(), Date.now(), 24 * HOUR);
  const listings: AuditListing[] = airings.map((a) => ({
    channelName: a.network,
    startMs: Date.parse(a.airstamp),
    // Stored airings carry no duration; 30 min is the conservative floor and
    // is deliberately NOT flattering — a real EPG supplies real end times.
    endMs: Date.parse(a.airstamp) + 30 * 60_000,
    // Stored rows carry a programme type; anything else is honestly 'unknown'
    // rather than guessed into a category that would flatter the coverage mix.
    kind: 'unknown',
    providerId: 'tvmaze',
  }));
  return { listings, lineup: [...MANDATORY_CHANNELS], lastSuccess: {}, note: 'Audited against stored rows.' };
}

async function main() {
  const nowMs = Date.now();
  const src = FIXTURE
    ? { listings: fixtureListings(nowMs), lineup: [...MANDATORY_CHANNELS], lastSuccess: { tv_media: nowMs - HOUR }, note: 'FIXTURE — a synthetic licensed grid, not stored data.' }
    : await storedListings();

  const audit = buildDayCoverageAudit({
    nowMs,
    lineup: src.lineup,
    listings: src.listings,
    lastSuccessByProvider: src.lastSuccess,
  });

  if (JSON_OUT) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ note: src.note, ...audit }, null, 2));
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`${formatDayAudit(audit)}\n${src.note}`);
  if (!audit.allMandatoryPass) {
    // eslint-disable-next-line no-console
    console.log('\nRESULT: FAIL — the mandatory Hallmark/Lifetime lineup is not covered.');
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
