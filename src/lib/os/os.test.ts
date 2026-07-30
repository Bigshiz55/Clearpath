import { describe, it, expect } from 'vitest';
import { can, canDecideApproval, capabilitiesFor, tierFor, requiresApproval, OS_ROLES, type OsRole } from './permissions';
import {
  canTransitionMission, canTransitionTask, canTransitionApproval, isApprovalTerminal,
  attentionItems, missionProgress, type MissionStatus, type ApprovalStatus,
} from './workflow';

describe('permissions — deny by default', () => {
  it('no role gets nothing', () => {
    expect(can(null, 'mission.view')).toBe(false);
    expect(can(undefined, 'approval.decide')).toBe(false);
    expect(capabilitiesFor(null)).toEqual([]);
  });

  it('viewer can only view', () => {
    expect(can('viewer', 'mission.view')).toBe(true);
    for (const c of ['mission.create', 'mission.edit', 'mission.delete', 'approval.decide', 'automation.run', 'settings.edit'] as const) {
      expect(can('viewer', c), `viewer must not have ${c}`).toBe(false);
    }
  });

  it('contributor can create work but never approve or administer', () => {
    expect(can('contributor', 'task.create')).toBe(true);
    expect(can('contributor', 'approval.request')).toBe(true);
    expect(can('contributor', 'approval.decide')).toBe(false);
    expect(can('contributor', 'settings.edit')).toBe(false);
  });

  it('ONLY the founder holds executive approval', () => {
    const holders = OS_ROLES.filter((r) => can(r, 'approval.decide_executive'));
    expect(holders).toEqual(['founder']);
  });

  it('only founder and admin can delete missions', () => {
    const holders = OS_ROLES.filter((r: OsRole) => can(r, 'mission.delete'));
    expect(holders.sort()).toEqual(['admin', 'founder']);
  });
});

describe('approval tiers match the spec', () => {
  it('routine internal work is automatic', () => {
    for (const a of ['internal_summary', 'report', 'diagnostic', 'test_run', 'data_refresh'] as const) {
      expect(tierFor(a), a).toBe('automatic');
      expect(requiresApproval(a)).toBe(false);
    }
  });

  it('outward-facing and spending actions need approval', () => {
    for (const a of ['publish_content', 'send_outreach', 'launch_campaign', 'social_post', 'production_deploy', 'customer_comms', 'change_automation', 'spend_within_limit'] as const) {
      expect(tierFor(a), a).toBe('approval_required');
    }
  });

  it('irreversible and legal actions are executive-only', () => {
    for (const a of ['pricing_change', 'contract', 'destructive_data', 'major_spend', 'security_change', 'legal_commitment', 'irreversible_migration', 'product_shutdown', 'permission_change'] as const) {
      expect(tierFor(a), a).toBe('executive_only');
    }
  });
});

describe('approval decisions', () => {
  const ids = { requesterId: 'alice', deciderId: 'bob' };

  it('NOBODY may approve their own request — not even the founder', () => {
    const self = { requesterId: 'alice', deciderId: 'alice' };
    for (const role of OS_ROLES) {
      const r = canDecideApproval(role, 'approval_required', self);
      expect(r.allowed, `${role} must not self-approve`).toBe(false);
      expect(r.reason).toMatch(/your own request/i);
    }
  });

  it('a manager can decide a normal request but not an executive one', () => {
    expect(canDecideApproval('manager', 'approval_required', ids).allowed).toBe(true);
    const exec = canDecideApproval('manager', 'executive_only', ids);
    expect(exec.allowed).toBe(false);
    expect(exec.reason).toMatch(/executive-only/i);
  });

  it('the founder can decide an executive request', () => {
    expect(canDecideApproval('founder', 'executive_only', ids).allowed).toBe(true);
  });

  it('a contributor and viewer can never decide', () => {
    expect(canDecideApproval('contributor', 'approval_required', ids).allowed).toBe(false);
    expect(canDecideApproval('viewer', 'approval_required', ids).allowed).toBe(false);
  });

  it('automatic actions have nothing to decide', () => {
    expect(canDecideApproval('founder', 'automatic', ids).allowed).toBe(false);
  });
});

describe('state machines', () => {
  it('mission transitions follow the documented graph', () => {
    expect(canTransitionMission('draft', 'active').allowed).toBe(true);
    expect(canTransitionMission('active', 'complete').allowed).toBe(true);
    expect(canTransitionMission('blocked', 'active').allowed).toBe(true);
    const bad = canTransitionMission('draft', 'complete');
    expect(bad.allowed).toBe(false);
    expect(bad.reason).toMatch(/cannot go from draft to complete/i);
    expect(canTransitionMission('active', 'active').allowed).toBe(false);
  });

  it('task transitions follow the documented graph', () => {
    expect(canTransitionTask('todo', 'in_progress').allowed).toBe(true);
    expect(canTransitionTask('in_progress', 'done').allowed).toBe(true);
    expect(canTransitionTask('todo', 'done').allowed).toBe(false);
    expect(canTransitionTask('done', 'in_progress').allowed).toBe(true);
  });

  it('a decided approval is terminal — the audit record cannot be rewritten', () => {
    for (const s of ['approved', 'rejected', 'withdrawn'] as ApprovalStatus[]) {
      expect(isApprovalTerminal(s), s).toBe(true);
      expect(canTransitionApproval(s, 'pending').allowed).toBe(false);
    }
    expect(canTransitionApproval('pending', 'approved').allowed).toBe(true);
    expect(canTransitionApproval('changes_requested', 'pending').allowed).toBe(true);
  });
});

describe('Command Center attention model', () => {
  const now = new Date('2026-07-25T12:00:00Z');
  const base = { missions: [], approvals: [], now };

  it('an empty company produces an empty list, not filler', () => {
    expect(attentionItems(base)).toEqual([]);
  });

  it('executive approvals outrank normal approvals, which outrank due-soon work', () => {
    const items = attentionItems({
      ...base,
      approvals: [
        { id: 'a1', title: 'Publish pages', status: 'pending', tier: 'approval_required', requestedAt: '2026-07-25' },
        { id: 'a2', title: 'Change pricing', status: 'pending', tier: 'executive_only', requestedAt: '2026-07-25' },
      ],
      missions: [{ id: 'm1', title: 'Ship beta', status: 'active', priority: 'high', targetDate: '2026-07-29' }],
    });
    expect(items.map((i) => i.id)).toEqual(['a2', 'a1', 'm1']);
    expect(items[0]!.detail).toMatch(/Executive decision required/);
  });

  it('a longer wait raises urgency', () => {
    const items = attentionItems({
      ...base,
      approvals: [
        { id: 'new', title: 'New', status: 'pending', tier: 'approval_required', requestedAt: '2026-07-25' },
        { id: 'old', title: 'Old', status: 'pending', tier: 'approval_required', requestedAt: '2026-07-18' },
      ],
    });
    expect(items[0]!.id).toBe('old');
    expect(items[0]!.detail).toMatch(/waiting 7d/);
  });

  it('decided approvals never appear', () => {
    const decided: ApprovalStatus[] = ['approved', 'rejected', 'withdrawn', 'changes_requested'];
    const items = attentionItems({
      ...base,
      approvals: decided.map((s, i) => ({ id: `a${i}`, title: 'x', status: s, tier: 'approval_required', requestedAt: '2026-07-20' })),
    });
    expect(items).toEqual([]);
  });

  it('blocked and overdue missions surface with real detail', () => {
    const items = attentionItems({
      ...base,
      missions: [
        { id: 'b', title: 'Blocked one', status: 'blocked', priority: 'high', targetDate: null },
        { id: 'o', title: 'Overdue one', status: 'active', priority: 'critical', targetDate: '2026-07-20' },
      ],
    });
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId.b!.detail).toBe('Mission is blocked');
    expect(byId.o!.detail).toBe('Overdue by 5 days');
  });

  it('a healthy mission far from its date is NOT noise on the dashboard', () => {
    const items = attentionItems({
      ...base,
      missions: [{ id: 'm', title: 'Fine', status: 'active', priority: 'low', targetDate: '2026-12-01' }],
    });
    expect(items).toEqual([]);
  });

  it('draft and complete missions never demand attention', () => {
    for (const status of ['draft', 'complete', 'cancelled'] as MissionStatus[]) {
      const items = attentionItems({
        ...base,
        missions: [{ id: 'm', title: 'x', status, priority: 'critical', targetDate: '2026-07-01' }],
      });
      expect(items, status).toEqual([]);
    }
  });
});

describe('mission progress is real, never fabricated', () => {
  it('counts done tasks and ignores cancelled ones', () => {
    expect(missionProgress([{ status: 'done' }, { status: 'todo' }, { status: 'cancelled' }])).toEqual({ done: 1, total: 2, percent: 50 });
  });
  it('no tasks means 0%, not an invented number', () => {
    expect(missionProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});
