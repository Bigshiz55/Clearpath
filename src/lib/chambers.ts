// "Your Chambers" — the collectible, evolving profile, computed from REAL
// activity only. This module is pure (no I/O) and unit-tested, the same way
// scoring is: every rank, badge, title and unlock is a deterministic function
// of counts we actually have. Nothing here is fabricated — if the data isn't
// there, the honour isn't earned. The DB read layer lives in
// `chambersData.ts`; this file never touches Supabase.

/** Raw, real counts pulled from the user's own rows. */
export interface ChambersCounts {
  rated: number; // titles the user has scored (quiz + manual)
  verdicts: number; // verdicts requested
  onDocket: number; // watchlist items still to watch
  finished: number; // titles marked watched / finished
  reviews: number; // post-watch interviews / written notes
  streakWeeks: number; // consecutive weeks with any activity, ending this week
  decades: number; // distinct release decades among rated titles
  followers: number;
  following: number;
}

export const EMPTY_COUNTS: ChambersCounts = {
  rated: 0,
  verdicts: 0,
  onDocket: 0,
  finished: 0,
  reviews: 0,
  streakWeeks: 0,
  decades: 0,
  followers: 0,
  following: 0,
};

// ---------------------------------------------------------------------------
// Court Standing — the progression ("Watch IQ", but ours and honest).
// ---------------------------------------------------------------------------

export interface Standing {
  level: number; // 0-based index
  name: string;
  emoji: string;
  points: number; // the user's current points
  floor: number; // points at which this rank begins
  next: { name: string; at: number } | null; // null at the top
  toNext: number; // points remaining to next rank (0 at top)
  progress: number; // 0..1 within the current rank
}

const RANKS: { name: string; emoji: string; at: number }[] = [
  { name: 'Clerk', emoji: '📋', at: 0 },
  { name: 'Bailiff', emoji: '🎖️', at: 15 },
  { name: 'Juror', emoji: '🧑‍⚖️', at: 40 },
  { name: 'Counsel', emoji: '📜', at: 90 },
  { name: 'Magistrate', emoji: '⚖️', at: 175 },
  { name: 'Judge', emoji: '👨‍⚖️', at: 300 },
];

/** Engagement points. Interviews/reviews are worth more because they carry the
 *  most signal — the same reason they weigh heavily everywhere else. */
export function standingPoints(c: ChambersCounts): number {
  return c.rated * 1 + c.verdicts * 1 + c.finished * 1 + c.reviews * 3;
}

export function courtStanding(c: ChambersCounts): Standing {
  const points = standingPoints(c);
  let level = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (points >= RANKS[i]!.at) level = i;
  }
  const rank = RANKS[level]!;
  const next = level < RANKS.length - 1 ? RANKS[level + 1]! : null;
  const toNext = next ? Math.max(0, next.at - points) : 0;
  const span = next ? next.at - rank.at : 1;
  const progress = next ? Math.min(1, (points - rank.at) / span) : 1;
  return {
    level,
    name: rank.name,
    emoji: rank.emoji,
    points,
    floor: rank.at,
    next: next ? { name: next.name, at: next.at } : null,
    toNext,
    progress,
  };
}

// ---------------------------------------------------------------------------
// Badges — visible, collectible, each backed by a real threshold.
// ---------------------------------------------------------------------------

export interface BadgeSpec {
  key: string;
  label: string;
  emoji: string;
  description: string;
  /** Which count gates it, and how many are needed. */
  need: number;
  metric: (c: ChambersCounts) => number;
}

export interface Badge {
  key: string;
  label: string;
  emoji: string;
  description: string;
  have: number;
  need: number;
  earned: boolean;
}

const BADGE_SPECS: BadgeSpec[] = [
  { key: 'opening-statement', label: 'Opening Statement', emoji: '⚖️', description: 'Get your first verdict.', need: 1, metric: (c) => c.verdicts },
  { key: 'sworn-in', label: 'Sworn In', emoji: '🖐️', description: 'Rate your first 10 titles.', need: 10, metric: (c) => c.rated },
  { key: 'the-jury', label: 'The Jury', emoji: '🧑‍⚖️', description: 'Rate 50 titles.', need: 50, metric: (c) => c.rated },
  { key: 'full-docket', label: 'Full Docket', emoji: '📚', description: 'Rate 100 titles.', need: 100, metric: (c) => c.rated },
  { key: 'critics-pen', label: "Critic's Pen", emoji: '🖊️', description: 'Leave 10 post-watch reviews.', need: 10, metric: (c) => c.reviews },
  { key: 'the-finisher', label: 'The Finisher', emoji: '🏁', description: 'Finish 25 titles.', need: 25, metric: (c) => c.finished },
  { key: 'the-regular', label: 'The Regular', emoji: '🔥', description: 'Keep a 4-week streak.', need: 4, metric: (c) => c.streakWeeks },
  { key: 'time-traveler', label: 'Time Traveler', emoji: '🎞️', description: 'Rate titles from 4 different decades.', need: 4, metric: (c) => c.decades },
  { key: 'the-clerk', label: 'Court Clerk', emoji: '🗂️', description: 'Keep 15 titles on your docket.', need: 15, metric: (c) => c.onDocket },
  { key: 'in-good-company', label: 'In Good Company', emoji: '🤝', description: 'Follow your first person.', need: 1, metric: (c) => c.following },
];

export function computeBadges(c: ChambersCounts): Badge[] {
  return BADGE_SPECS.map((b) => {
    const have = Math.max(0, b.metric(c));
    return {
      key: b.key,
      label: b.label,
      emoji: b.emoji,
      description: b.description,
      have,
      need: b.need,
      earned: have >= b.need,
    };
  });
}

export function earnedBadgeCount(c: ChambersCounts): number {
  return computeBadges(c).filter((b) => b.earned).length;
}

// ---------------------------------------------------------------------------
// Viewing title — "The Crime Strategist" etc. Derived from the strongest REAL
// signal, and only once there's enough activity to mean anything.
// ---------------------------------------------------------------------------

export interface TitleSignals {
  rated: number;
  verdicts: number;
  finished: number;
  reviews: number;
  streakWeeks: number;
  decades: number;
  /** Verdict tier mix, already bucketed. */
  mix: { watch: number; maybe: number; skip: number };
  /** Their single strongest "loves" trait, already humanized, if any. */
  topLove?: string | null;
}

const TITLE_MIN_ACTIVITY = 8; // rated + verdicts before we'll title someone

/** Returns a viewing title, or null when there isn't enough to earn one. Pure
 *  and ordered: the first rule that clears its own bar wins, so the title
 *  always reflects a threshold the user actually crossed. */
export function deriveTitle(s: TitleSignals): string | null {
  if (s.rated + s.verdicts < TITLE_MIN_ACTIVITY) return null;

  const totalCalls = s.mix.watch + s.mix.maybe + s.mix.skip;
  const skipRate = totalCalls > 0 ? s.mix.skip / totalCalls : 0;
  const watchRate = totalCalls > 0 ? s.mix.watch / totalCalls : 0;

  if (s.reviews >= 15) return 'The Critic';
  if (s.streakWeeks >= 6) return 'The Regular';
  if (s.decades >= 5) return 'The Time Traveler';
  if (s.finished >= 25) return 'The Finisher';
  if (totalCalls >= 12 && skipRate >= 0.5) return 'The Tough Critic';
  if (totalCalls >= 12 && watchRate >= 0.6) return 'The Enthusiast';
  if (s.topLove) return `The ${s.topLove} Devotee`;
  return 'The Regular Viewer';
}

// ---------------------------------------------------------------------------
// Chambers decor — evidence items unlocked by real milestones. `style` lets the
// user dial the wall from clean → full.
// ---------------------------------------------------------------------------

export type DecorStyle = 'clean' | 'moderate' | 'full';

export interface DecorItem {
  key: string;
  emoji: string;
  label: string;
}

const DECOR_SPECS: { key: string; emoji: string; label: string; when: (c: ChambersCounts) => boolean }[] = [
  { key: 'gavel', emoji: '🔨', label: 'The Gavel', when: (c) => c.verdicts >= 1 },
  { key: 'evidence', emoji: '🧾', label: 'Evidence', when: (c) => c.rated >= 10 },
  { key: 'flame', emoji: '🔥', label: 'On a Streak', when: (c) => c.streakWeeks >= 4 },
  { key: 'reel', emoji: '🎞️', label: 'Across the Decades', when: (c) => c.decades >= 4 },
  { key: 'pen', emoji: '🖊️', label: "Critic's Pen", when: (c) => c.reviews >= 10 },
  { key: 'scales', emoji: '⚖️', label: 'The Scales', when: (c) => c.finished >= 25 },
  { key: 'stack', emoji: '📚', label: 'The Docket', when: (c) => c.onDocket >= 15 },
];

const DECOR_CAP: Record<DecorStyle, number> = { clean: 0, moderate: 4, full: 99 };

export function unlockedDecor(c: ChambersCounts, style: DecorStyle = 'moderate'): DecorItem[] {
  const all = DECOR_SPECS.filter((d) => d.when(c)).map(({ key, emoji, label }) => ({ key, emoji, label }));
  return all.slice(0, DECOR_CAP[style]);
}

// ---------------------------------------------------------------------------
// Streak — consecutive weeks with activity, ending at (or one week before) now.
// Pure so the "1 🔥 Week" number is deterministic and testable.
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Absolute week index for a timestamp (weeks since the Unix epoch). */
export function weekIndex(ms: number): number {
  return Math.floor(ms / WEEK_MS);
}

/** Length of the unbroken run of active weeks ending at the most recent one —
 *  but only if that run reaches the current week (grace: last week counts, so a
 *  streak isn't "lost" mid-week). Otherwise the streak is broken → 0. */
export function consecutiveWeeks(activeWeeks: Iterable<number>, currentWeek: number): number {
  const weeks = Array.from(new Set(activeWeeks)).sort((a, b) => b - a);
  if (weeks.length === 0) return 0;
  const latest = weeks[0]!;
  if (latest < currentWeek - 1) return 0; // last activity too old
  let streak = 1;
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] === weeks[i - 1]! - 1) streak++;
    else break;
  }
  return streak;
}
