/**
 * Growth OS — pure core logic. No I/O. Deterministic and unit-tested.
 *
 * This is the honest math behind the Founder Growth Command Center: what stage
 * we're in, progress to the next milestone, funnel conversion, and — critically
 * — how to LABEL small samples so we never present 12 users as a trend.
 */

export type GrowthStage = 'stage1' | 'stage2' | 'stage3' | 'scale';

export interface StageInfo {
  stage: GrowthStage;
  label: string;
  range: string;
  focus: string;
}

const STAGES: Record<GrowthStage, StageInfo> = {
  stage1: { stage: 'stage1', label: 'Stage 1 · Founder-led', range: '0–100 users', focus: 'Founder-led outreach, friends & family, early testers, communities, activation.' },
  stage2: { stage: 'stage2', label: 'Stage 2 · Repeatable', range: '100–1,000 users', focus: 'Referrals, shareable results, micro-influencers, onboarding & retention.' },
  stage3: { stage: 'stage3', label: 'Stage 3 · Scalable', range: '1,000–10,000 users', focus: 'Content systems, SEO, partnerships, creator/affiliate, paid experiments, lifecycle.' },
  scale: { stage: 'scale', label: 'Scale', range: '10,000+ users', focus: 'Channel economics, cohort retention, durable growth loops.' },
};

/** Infer the stage from the real user count. The founder can override this. */
export function stageForUsers(users: number): StageInfo {
  if (users < 100) return STAGES.stage1;
  if (users < 1000) return STAGES.stage2;
  if (users < 10000) return STAGES.stage3;
  return STAGES.scale;
}

export function stageInfo(stage: GrowthStage): StageInfo {
  return STAGES[stage];
}

// ── Milestones ───────────────────────────────────────────────────────────────

export const MILESTONE_TARGETS = [10, 25, 50, 100, 250, 500, 1000, 5000, 10000] as const;

export interface Milestone {
  target: number;
  reached: boolean;
  current: number;
  /** users still needed (0 if reached). */
  remaining: number;
  /** fraction toward this target from the previous milestone, 0..1. */
  progress: number;
}

/** The next unreached milestone (or the last one if all reached). */
export function nextMilestone(users: number): Milestone {
  let prev = 0;
  for (const target of MILESTONE_TARGETS) {
    if (users < target) {
      const span = target - prev;
      return {
        target,
        reached: false,
        current: users,
        remaining: target - users,
        progress: span > 0 ? clamp01((users - prev) / span) : 1,
      };
    }
    prev = target;
  }
  const last = MILESTONE_TARGETS[MILESTONE_TARGETS.length - 1]!;
  return { target: last, reached: true, current: users, remaining: 0, progress: 1 };
}

export function allMilestones(users: number): Milestone[] {
  let prev = 0;
  return MILESTONE_TARGETS.map((target) => {
    const span = target - prev;
    const m: Milestone = {
      target,
      reached: users >= target,
      current: users,
      remaining: Math.max(0, target - users),
      progress: users >= target ? 1 : span > 0 ? clamp01((users - prev) / span) : 0,
    };
    prev = target;
    return m;
  });
}

/**
 * Weekly new users required to hit `target` by `dueBy`, given `current` now.
 * Returns null when there's no time left or already reached.
 */
export function requiredWeeklyGrowth(current: number, target: number, now: number, dueBy: number): number | null {
  if (current >= target) return 0;
  const weeks = (dueBy - now) / (7 * 86_400_000);
  if (weeks <= 0) return null;
  return Math.ceil((target - current) / weeks);
}

// ── Funnel ───────────────────────────────────────────────────────────────────

export const FUNNEL_STEPS = [
  'visitors',
  'signups',
  'onboarding_started',
  'dna_completed',
  'first_search',
  'first_verdict',
  'first_watchlist',
  'first_invite',
  'first_share',
  'return_visit',
  'subscription',
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_LABELS: Record<FunnelStep, string> = {
  visitors: 'Visitors',
  signups: 'Signups',
  onboarding_started: 'Onboarding started',
  dna_completed: 'Watch DNA completed',
  first_search: 'First search',
  first_verdict: 'First verdict',
  first_watchlist: 'First watchlist action',
  first_invite: 'First invitation',
  first_share: 'First shared result',
  return_visit: 'Return visit',
  subscription: 'Subscription',
};

export type FunnelCounts = Partial<Record<FunnelStep, number>>;

export interface FunnelRow {
  step: FunnelStep;
  label: string;
  count: number;
  /** conversion from the previous non-null step, 0..1; null for the first. */
  rate: number | null;
  /** absolute users lost from the previous step. */
  dropoff: number;
  /** true when the count is missing/not-yet-tracked (labeled, never faked). */
  untracked: boolean;
}

/**
 * Build funnel rows. A missing count is marked `untracked` (shown as "—",
 * never as 0 pretending to be real). Rates only computed between tracked steps.
 */
export function buildFunnel(counts: FunnelCounts): FunnelRow[] {
  const rows: FunnelRow[] = [];
  let prevCount: number | null = null;
  for (const step of FUNNEL_STEPS) {
    const raw = counts[step];
    const untracked = raw == null;
    const count = raw ?? 0;
    const rate = !untracked && prevCount != null && prevCount > 0 ? count / prevCount : null;
    const dropoff = !untracked && prevCount != null ? Math.max(0, prevCount - count) : 0;
    rows.push({ step, label: FUNNEL_LABELS[step], count, rate, dropoff, untracked });
    if (!untracked) prevCount = count;
  }
  return rows;
}

/** The biggest absolute leak between tracked steps (highest-leverage fix). */
export function biggestLeak(rows: FunnelRow[]): FunnelRow | null {
  let worst: FunnelRow | null = null;
  for (const r of rows) {
    if (r.rate != null && (worst == null || r.dropoff > worst.dropoff)) worst = r;
  }
  return worst;
}

// ── Data honesty ─────────────────────────────────────────────────────────────

/**
 * A plain-language confidence label for a sample size, so the founder never
 * mistakes a handful of users for a conclusion.
 */
export function sampleConfidence(n: number): { level: 'none' | 'directional' | 'emerging' | 'meaningful'; note: string } {
  if (n <= 0) return { level: 'none', note: 'No data yet.' };
  if (n < 30) return { level: 'directional', note: `Only ${n} so far — directional, not conclusive.` };
  if (n < 100) return { level: 'emerging', note: `${n} data points — an emerging pattern, keep watching.` };
  return { level: 'meaningful', note: `${n} data points — a meaningful signal.` };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
