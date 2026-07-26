import { NextResponse } from 'next/server';
import { hasFullGridProvider, activeProviderId } from '@/lib/viewing/liveTv';
import {
  lineupsDueNow, enabledLineups, blockedLineups, localDayKey,
  COVERAGE_HOURS, INGEST_LOCAL_HOUR,
} from '@/lib/viewing/ingest/lineups';
import { estimateRunCost, evaluateBudget } from '@/lib/viewing/ingest/budget';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * DAILY TV INGESTION.
 *
 * Fires HOURLY and runs each lineup only when it is 2 AM in that lineup's own
 * market. Vercel Cron schedules in UTC, so a single fixed UTC time would drift
 * an hour across DST — 2 AM local becoming 1 AM or 3 AM. Checking local time
 * per lineup keeps every market on its own 2 AM, including Arizona, which never
 * shifts, without a separate cron entry per zone.
 *
 * The browser never reaches the provider: this is the only path that does.
 */

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: Request) {
  // Vercel Cron sends this header; a bare public hit must not spend calls.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) return unauthorized();
  }

  const nowMs = Date.now();
  const monthlyLimit = Number(process.env.TV_LISTINGS_MONTHLY_CALL_LIMIT ?? 0);
  const safetyPercent = Number(process.env.TV_LISTINGS_CALL_SAFETY_PERCENT ?? 90) / 100;

  // No credentials → report honestly and spend nothing. Never pretend a run
  // happened, and never write fixture data into the live schedule tables.
  if (!hasFullGridProvider()) {
    return NextResponse.json({
      ran: false,
      reason: 'No TV Media credentials configured.',
      activeProvider: activeProviderId(),
      enabledLineups: enabledLineups().map((l) => l.key),
      awaitingPlanAccess: blockedLineups().map((l) => l.key),
      nextStep: 'Configure the listings provider in Vercel and redeploy — see docs/SCHEDULE_PROVIDERS.md.',
    }, { status: 200 });
  }

  const due = lineupsDueNow(nowMs);
  if (due.length === 0) {
    return NextResponse.json({
      ran: false,
      reason: `No lineup is at its ${INGEST_LOCAL_HOUR}:00 local ingestion hour right now.`,
      checked: enabledLineups().map((l) => ({
        key: l.key, timezone: l.market.timezone, localDay: localDayKey(l, nowMs),
      })),
    });
  }

  const now = new Date(nowMs);
  const budgetState = {
    monthlyLimit, safetyPercent,
    used: 0, // replaced by the stored ledger count once migration 0032 is applied
    dayOfMonth: now.getUTCDate(),
    daysInMonth: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate(),
  };

  const planned = due.map((l) => {
    // Conservative shape until the provider's real pagination limits are known;
    // the estimate is deliberately pessimistic so a run stops early rather than
    // discovering an overspend afterwards.
    const cost = estimateRunCost({
      channelCount: 200, channelsPerPage: 100,
      channelsPerScheduleCall: 25, days: COVERAGE_HOURS.preferred / 24,
    });
    const verdict = evaluateBudget(budgetState, cost.total);
    return { lineup: l.key, timezone: l.market.timezone, estimate: cost, verdict };
  });

  const affordable = planned.filter((p) => p.verdict.allowed);

  // The ingestion writer lands with migration 0032 applied; until then this
  // route reports exactly what it WOULD do rather than half-writing a schedule.
  return NextResponse.json({
    ran: false,
    reason: 'Ingestion writer awaits migration 0032 being applied to the database.',
    wouldRun: affordable.map((p) => p.lineup),
    blockedByBudget: planned.filter((p) => !p.verdict.allowed)
      .map((p) => ({ lineup: p.lineup, reason: p.verdict.reason })),
    plan: planned.map((p) => ({
      lineup: p.lineup,
      timezone: p.timezone,
      // A paginated run is MANY provider calls. Reporting it as one would be a lie.
      estimatedProviderCalls: p.estimate.total,
      breakdown: {
        channelListCalls: p.estimate.channelCalls,
        scheduleCalls: p.estimate.scheduleCalls,
        metadataCalls: p.estimate.metadataCalls,
      },
      assumptions: p.estimate.assumptions,
      coverageHours: COVERAGE_HOURS.preferred,
    })),
    budget: {
      monthlyLimit,
      safetyThresholdPercent: safetyPercent * 100,
      projectedMonthly: planned[0]?.verdict.projectedMonthly ?? 0,
    },
  });
}
