/**
 * VERD1CT OS — mission and approval state machines (pure, no I/O).
 *
 * State transitions are validated here rather than in the UI, so an invalid
 * status change is impossible regardless of how the request arrives (form,
 * command bar, API). Every transition returns a reason on refusal, which is
 * what the interface shows the user instead of a silent no-op.
 */

export type MissionStatus = 'draft' | 'active' | 'blocked' | 'in_review' | 'complete' | 'cancelled';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'withdrawn';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

const MISSION_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['blocked', 'in_review', 'complete', 'cancelled'],
  blocked: ['active', 'cancelled'],
  in_review: ['active', 'complete', 'cancelled'],
  complete: ['active'], // reopening is allowed, and is itself audited
  cancelled: ['draft'],
};

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['blocked', 'done', 'todo', 'cancelled'],
  blocked: ['in_progress', 'todo', 'cancelled'],
  done: ['in_progress'],
  cancelled: ['todo'],
};

const APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'changes_requested', 'withdrawn'],
  // A decided request is terminal — re-deciding would break the audit trail.
  approved: [],
  rejected: [],
  changes_requested: ['pending', 'withdrawn'],
  withdrawn: [],
};

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

function check<T extends string>(map: Record<T, T[]>, from: T, to: T, label: string): TransitionResult {
  if (from === to) return { allowed: false, reason: `Already ${String(to).replace('_', ' ')}.` };
  const next = map[from];
  if (!next) return { allowed: false, reason: `Unknown ${label} status "${from}".` };
  return next.includes(to)
    ? { allowed: true }
    : { allowed: false, reason: `A ${label} cannot go from ${String(from).replace('_', ' ')} to ${String(to).replace('_', ' ')}.` };
}

export const canTransitionMission = (from: MissionStatus, to: MissionStatus) =>
  check(MISSION_TRANSITIONS, from, to, 'mission');
export const canTransitionTask = (from: TaskStatus, to: TaskStatus) =>
  check(TASK_TRANSITIONS, from, to, 'task');
export const canTransitionApproval = (from: ApprovalStatus, to: ApprovalStatus) =>
  check(APPROVAL_TRANSITIONS, from, to, 'approval');

/** A decided approval can never be changed — the audit record is final. */
export const isApprovalTerminal = (s: ApprovalStatus) => APPROVAL_TRANSITIONS[s].length === 0;

// ---------------------------------------------------------------------------
// Command Center attention model — what actually needs the founder.
// ---------------------------------------------------------------------------

export interface AttentionInput {
  missions: { id: string; title: string; status: MissionStatus; priority: Priority; targetDate: string | null }[];
  approvals: { id: string; title: string; status: ApprovalStatus; tier: string; requestedAt: string }[];
  now: Date;
}

export interface AttentionItem {
  kind: 'approval' | 'blocked_mission' | 'overdue_mission' | 'due_soon';
  id: string;
  label: string;
  detail: string;
  /** Higher sorts first. */
  urgency: number;
  href: string;
}

const DAY = 86_400_000;

/**
 * The single question the Command Center answers: what needs me now?
 * Ordered by real urgency, never decorative. Anything that cannot be acted on
 * is deliberately excluded — a metric with no action is noise.
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const a of input.approvals) {
    if (a.status !== 'pending') continue;
    const waitingDays = Math.floor((input.now.getTime() - new Date(a.requestedAt).getTime()) / DAY);
    items.push({
      kind: 'approval',
      id: a.id,
      label: a.title,
      detail:
        a.tier === 'executive_only'
          ? `Executive decision required${waitingDays > 0 ? ` · waiting ${waitingDays}d` : ''}`
          : `Approval required${waitingDays > 0 ? ` · waiting ${waitingDays}d` : ''}`,
      urgency: (a.tier === 'executive_only' ? 1000 : 800) + waitingDays,
      href: `/os/approvals#${a.id}`,
    });
  }

  for (const m of input.missions) {
    if (m.status === 'blocked') {
      items.push({
        kind: 'blocked_mission',
        id: m.id,
        label: m.title,
        detail: 'Mission is blocked',
        urgency: 900 + priorityWeight(m.priority),
        href: `/os/missions/${m.id}`,
      });
      continue;
    }
    if (m.status !== 'active' || !m.targetDate) continue;
    const msLeft = new Date(m.targetDate).getTime() - input.now.getTime();
    // Overdue is counted as whole days ELAPSED since the target, so a target of
    // the 20th viewed midday on the 25th reads "5 days" — flooring the negative
    // difference instead would overstate it by one.
    const daysOverdue = Math.floor(-msLeft / DAY);
    const daysLeft = Math.floor(msLeft / DAY);
    if (msLeft < 0) {
      items.push({
        kind: 'overdue_mission',
        id: m.id,
        label: m.title,
        detail: `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`,
        urgency: 850 + daysOverdue + priorityWeight(m.priority),
        href: `/os/missions/${m.id}`,
      });
    } else if (daysLeft <= 7) {
      items.push({
        kind: 'due_soon',
        id: m.id,
        label: m.title,
        detail: daysLeft === 0 ? 'Due today' : `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        urgency: 500 + (7 - daysLeft) + priorityWeight(m.priority),
        href: `/os/missions/${m.id}`,
      });
    }
  }

  return items.sort((a, b) => b.urgency - a.urgency);
}

function priorityWeight(p: Priority): number {
  return p === 'critical' ? 40 : p === 'high' ? 30 : p === 'medium' ? 20 : 10;
}

/** Mission progress from its tasks — real completion, never a fabricated %. */
export function missionProgress(tasks: { status: TaskStatus }[]): { done: number; total: number; percent: number } {
  const counted = tasks.filter((t) => t.status !== 'cancelled');
  const done = counted.filter((t) => t.status === 'done').length;
  const total = counted.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
