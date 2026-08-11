/**
 * THE 24-HOUR COVERAGE AUDIT — how much of a day we can actually account for.
 *
 * `coverageAudit.ts` answers "did this channel ingest at all". That is not the
 * question a television guide has to pass. A channel can be HEALTHY there with
 * four airings in a day — four first-run episodes and twenty hours of unknown —
 * and the guide will look populated while being mostly blank.
 *
 * So this measures MINUTES. For each mandatory channel: of the 1,440 minutes in
 * the next day, how many are covered by a listing, where are the gaps, and what
 * KIND of programming did we get? The programme mix is the part that exposes an
 * episode database pretending to be an EPG: a real linear channel's day is
 * mostly movies, reruns and paid programming, so a channel whose only entries
 * are first-run episodes has not been covered — it has been sampled.
 *
 * MANDATORY CHANNELS ARE NEVER SILENTLY OMITTED. A channel the provider did not
 * return is a row with `included: false` and a FAIL, because the failure mode
 * this audit exists to prevent is Hallmark quietly vanishing from the report and
 * the report then reading as green.
 *
 * Read-only and pure: it takes stored rows and returns a verdict. It makes no
 * provider call of any kind, so it is safe to run before activation — which is
 * the point, because the before/after comparison is the proof that activation
 * changed anything.
 */

export const DAY_MINUTES = 1440;

/** The channels a Hallmark/Lifetime-shaped product cannot claim to serve without. */
export const MANDATORY_CHANNELS = [
  'Hallmark Channel',
  'Hallmark Mystery',
  'Hallmark Family',
  'Lifetime',
  'Lifetime Movie Network',
] as const;

export type ProgrammeKind = 'movie' | 'rerun' | 'special' | 'paid_programming' | 'first_run' | 'unknown';

/** One stored listing, reduced to what minute-coverage needs. */
export interface AuditListing {
  channelName: string;
  startMs: number;
  endMs: number;
  kind: ProgrammeKind;
  providerId: string;
}

export interface DayGap {
  startMs: number;
  endMs: number;
  minutes: number;
}

export interface ChannelDayCoverage {
  channel: string;
  /** Is the channel in the configured lineup at all? */
  inLineup: boolean;
  /** Did any listing actually arrive for it? */
  included: boolean;
  providerId: string | null;
  spanStartMs: number;
  spanEndMs: number;
  coveredMinutes: number;
  coveragePct: number;
  gaps: DayGap[];
  largestGapMinutes: number;
  movies: number;
  reruns: number;
  specials: number;
  paidProgramming: number;
  firstRun: number;
  /** ms since this channel's provider last succeeded; null when never. */
  freshnessMs: number | null;
  pass: boolean;
  /** One sentence. Always populated — a pass says why it passed. */
  reason: string;
}

export interface DayAuditInput {
  nowMs: number;
  /** Channel names the configured lineup claims to carry. */
  lineup: readonly string[];
  listings: readonly AuditListing[];
  /** Last successful ingest per provider, for freshness. */
  lastSuccessByProvider: Readonly<Record<string, number | null>>;
  /** Channels that must appear. Defaults to MANDATORY_CHANNELS. */
  mandatory?: readonly string[];
  /** Minimum covered percentage to pass. A real grid is ~100%. */
  passThresholdPct?: number;
  freshnessMs?: number;
}

export interface DayAudit {
  generatedAtMs: number;
  windowStartMs: number;
  windowEndMs: number;
  rows: ChannelDayCoverage[];
  passed: number;
  failed: number;
  /** True only when every mandatory channel passed. */
  allMandatoryPass: boolean;
}

/** Merge overlapping/adjacent intervals, clipped to the window. */
function mergeClipped(intervals: readonly { s: number; e: number }[], from: number, to: number) {
  const clipped = intervals
    .map((i) => ({ s: Math.max(i.s, from), e: Math.min(i.e, to) }))
    .filter((i) => i.e > i.s)
    .sort((a, b) => a.s - b.s);
  const out: { s: number; e: number }[] = [];
  for (const iv of clipped) {
    const last = out[out.length - 1];
    if (last && iv.s <= last.e) last.e = Math.max(last.e, iv.e);
    else out.push({ ...iv });
  }
  return out;
}

export function buildDayCoverageAudit(input: DayAuditInput): DayAudit {
  const from = input.nowMs;
  const to = from + DAY_MINUTES * 60_000;
  const mandatory = input.mandatory ?? MANDATORY_CHANNELS;
  const threshold = input.passThresholdPct ?? 90;
  const freshnessMs = input.freshnessMs ?? 26 * 3_600_000;

  const byChannel = new Map<string, AuditListing[]>();
  for (const l of input.listings) {
    const key = l.channelName.trim();
    if (!key) continue;
    const list = byChannel.get(key);
    if (list) list.push(l);
    else byChannel.set(key, [l]);
  }

  const lineup = new Set(input.lineup.map((c) => c.trim()));

  const rows: ChannelDayCoverage[] = mandatory.map((channel) => {
    const mine = byChannel.get(channel) ?? [];
    const inLineup = lineup.has(channel);
    const providerId = mine[0]?.providerId ?? null;
    const lastSuccess = providerId ? input.lastSuccessByProvider[providerId] ?? null : null;
    const freshness = lastSuccess == null ? null : Math.max(0, input.nowMs - lastSuccess);

    const merged = mergeClipped(mine.map((l) => ({ s: l.startMs, e: l.endMs })), from, to);
    const coveredMs = merged.reduce((acc, i) => acc + (i.e - i.s), 0);
    const coveredMinutes = Math.round(coveredMs / 60_000);
    const coveragePct = Math.round((coveredMinutes / DAY_MINUTES) * 100);

    const gaps: DayGap[] = [];
    let cursor = from;
    for (const iv of merged) {
      if (iv.s > cursor) gaps.push({ startMs: cursor, endMs: iv.s, minutes: Math.round((iv.s - cursor) / 60_000) });
      cursor = Math.max(cursor, iv.e);
    }
    if (cursor < to) gaps.push({ startMs: cursor, endMs: to, minutes: Math.round((to - cursor) / 60_000) });

    const count = (k: ProgrammeKind) => mine.filter((l) => l.kind === k).length;
    const largestGapMinutes = gaps.reduce((m, g) => Math.max(m, g.minutes), 0);

    /* THE ORDER OF THESE FAILURES IS THE DIAGNOSIS.
       "Not in the lineup" and "in the lineup but absent" are different
       problems with different owners, and collapsing them into "no data" is
       how a licensing gap gets mistaken for an ingest bug. */
    let pass = false;
    let reason: string;
    if (!inLineup) {
      reason = `FAIL — ${channel} is not in the configured lineup, so no provider was ever asked for it.`;
    } else if (mine.length === 0) {
      reason = `FAIL — ${channel} is in the lineup but the provider returned nothing for the next 24h.`;
    } else if (freshness != null && freshness > freshnessMs) {
      reason = `FAIL — ${channel} has listings but ${providerId} last succeeded ${Math.round(freshness / 3_600_000)}h ago.`;
    } else if (coveragePct < threshold) {
      reason =
        `FAIL — ${channel} covers ${coveredMinutes}/${DAY_MINUTES} min (${coveragePct}%), ` +
        `largest gap ${largestGapMinutes} min. A sampled schedule, not a grid.`;
    } else {
      pass = true;
      reason = `PASS — ${channel} covers ${coveredMinutes}/${DAY_MINUTES} min (${coveragePct}%) from ${providerId}.`;
    }

    return {
      channel,
      inLineup,
      included: mine.length > 0,
      providerId,
      spanStartMs: from,
      spanEndMs: to,
      coveredMinutes,
      coveragePct,
      gaps,
      largestGapMinutes,
      movies: count('movie'),
      reruns: count('rerun'),
      specials: count('special'),
      paidProgramming: count('paid_programming'),
      firstRun: count('first_run'),
      freshnessMs: freshness,
      pass,
      reason,
    };
  });

  const passed = rows.filter((r) => r.pass).length;
  return {
    generatedAtMs: input.nowMs,
    windowStartMs: from,
    windowEndMs: to,
    rows,
    passed,
    failed: rows.length - passed,
    allMandatoryPass: passed === rows.length,
  };
}

/** A fixed-width table an operator can read in a terminal or a PR comment. */
export function formatDayAudit(audit: DayAudit): string {
  const head = `24h COVERAGE AUDIT — ${new Date(audit.generatedAtMs).toISOString()}\n` +
    `${audit.passed} passed / ${audit.failed} failed of ${audit.rows.length} mandatory channels\n`;
  const lines = audit.rows.map((r) => {
    const cov = `${String(r.coveredMinutes).padStart(4)}/${DAY_MINUTES} (${String(r.coveragePct).padStart(3)}%)`;
    const mix = `mov ${r.movies} rer ${r.reruns} spc ${r.specials} paid ${r.paidProgramming} 1st ${r.firstRun}`;
    return `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.channel.padEnd(24)} ${cov}  gaps ${String(r.gaps.length).padStart(2)}  ${mix}\n        ${r.reason}`;
  });
  return `${head}${lines.join('\n')}\n`;
}
