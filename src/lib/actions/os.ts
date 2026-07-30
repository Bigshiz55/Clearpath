'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer, recordActivity } from '@/lib/os/server';
import { can, canDecideApproval, tierFor, type OsActionKind } from '@/lib/os/permissions';
import { canTransitionMission, canTransitionTask, canTransitionApproval } from '@/lib/os/workflow';

/**
 * VERD1CT OS server actions. Every one of these:
 *   1. resolves the caller's real identity and role,
 *   2. checks the capability BEFORE touching data,
 *   3. validates the state transition,
 *   4. writes, then
 *   5. appends an audit record.
 *
 * The OS tables have no write policy, so these actions are the only write path.
 */

export type OsResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const fail = (error: string): OsResult => ({ ok: false, error });

function refresh() {
  revalidatePath('/os');
  revalidatePath('/os/missions');
  revalidatePath('/os/approvals');
}

// ---------------------------------------------------------------- missions --

const missionSchema = z.object({
  title: z.string().trim().min(3, 'Give the mission a title of at least 3 characters.').max(160),
  objective: z.string().trim().max(600).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  targetDate: z.string().trim().optional(),
});

export async function createMission(input: unknown): Promise<OsResult<{ id: string }>> {
  const parsed = missionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid mission.');
  const viewer = await getViewer();
  if (!viewer) return fail('Not signed in.');
  if (!can(viewer.role, 'mission.create')) return fail('Your role cannot create missions.');

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('os_missions')
      .insert({
        title: parsed.data.title,
        objective: parsed.data.objective || null,
        priority: parsed.data.priority,
        target_date: parsed.data.targetDate || null,
        status: 'draft',
        created_by: viewer.userId,
        owner_id: viewer.userId,
      })
      .select('id')
      .single();
    if (error) return fail(schemaHint(error.message));
    await recordActivity({
      actorId: viewer.userId, action: 'mission.created', entityType: 'mission',
      entityId: data.id, next: parsed.data, note: parsed.data.title,
    });
    refresh();
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function setMissionStatus(input: unknown): Promise<OsResult> {
  const schema = z.object({
    id: z.string().uuid(),
    status: z.enum(['draft', 'active', 'blocked', 'in_review', 'complete', 'cancelled']),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail('Invalid status change.');
  const viewer = await getViewer();
  if (!viewer) return fail('Not signed in.');
  if (!can(viewer.role, 'mission.edit')) return fail('Your role cannot change mission status.');

  try {
    const admin = createAdminClient();
    const { data: current, error: readErr } = await admin
      .from('os_missions').select('status, title').eq('id', parsed.data.id).single();
    if (readErr || !current) return fail('Mission not found.');

    const t = canTransitionMission(current.status, parsed.data.status);
    if (!t.allowed) return fail(t.reason ?? 'That status change is not allowed.');

    const { error } = await admin
      .from('os_missions')
      .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.id);
    if (error) return fail(error.message);

    await recordActivity({
      actorId: viewer.userId, action: 'mission.status_changed', entityType: 'mission',
      entityId: parsed.data.id, previous: { status: current.status }, next: { status: parsed.data.status },
      note: current.title,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------- tasks --

export async function createTask(input: unknown): Promise<OsResult<{ id: string }>> {
  const schema = z.object({
    missionId: z.string().uuid(),
    title: z.string().trim().min(2, 'Give the task a title.').max(200),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid task.');
  const viewer = await getViewer();
  if (!viewer) return fail('Not signed in.');
  if (!can(viewer.role, 'task.create')) return fail('Your role cannot create tasks.');

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('os_tasks')
      .insert({ mission_id: parsed.data.missionId, title: parsed.data.title, created_by: viewer.userId })
      .select('id')
      .single();
    if (error) return fail(schemaHint(error.message));
    await recordActivity({
      actorId: viewer.userId, action: 'task.created', entityType: 'task',
      entityId: data.id, next: parsed.data, note: parsed.data.title,
    });
    refresh();
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function setTaskStatus(input: unknown): Promise<OsResult> {
  const schema = z.object({
    id: z.string().uuid(),
    status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail('Invalid status change.');
  const viewer = await getViewer();
  if (!viewer) return fail('Not signed in.');
  if (!can(viewer.role, 'task.edit')) return fail('Your role cannot change tasks.');

  try {
    const admin = createAdminClient();
    const { data: current } = await admin.from('os_tasks').select('status, title').eq('id', parsed.data.id).single();
    if (!current) return fail('Task not found.');
    const t = canTransitionTask(current.status, parsed.data.status);
    if (!t.allowed) return fail(t.reason ?? 'That status change is not allowed.');

    const { error } = await admin
      .from('os_tasks')
      .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.id);
    if (error) return fail(error.message);
    await recordActivity({
      actorId: viewer.userId, action: 'task.status_changed', entityType: 'task',
      entityId: parsed.data.id, previous: { status: current.status }, next: { status: parsed.data.status },
      note: current.title,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// --------------------------------------------------------------- approvals --

const ACTION_KINDS = [
  'internal_summary', 'report', 'diagnostic', 'test_run', 'data_refresh',
  'publish_content', 'send_outreach', 'launch_campaign', 'social_post',
  'production_deploy', 'customer_comms', 'change_automation', 'spend_within_limit',
  'pricing_change', 'contract', 'destructive_data', 'major_spend',
  'security_change', 'legal_commitment', 'irreversible_migration',
  'product_shutdown', 'permission_change',
] as const;

export async function requestApproval(input: unknown): Promise<OsResult<{ id: string; tier: string }>> {
  const schema = z.object({
    title: z.string().trim().min(3, 'Describe what you are requesting.').max(200),
    actionKind: z.enum(ACTION_KINDS),
    reason: z.string().trim().max(1000).optional(),
    expectedOutcome: z.string().trim().max(1000).optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).default('medium'),
    missionId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request.');
  const viewer = await getViewer();
  if (!viewer) return fail('Not signed in.');
  if (!can(viewer.role, 'approval.request')) return fail('Your role cannot raise approval requests.');

  // The tier is derived from the action, never supplied by the client — a
  // client-chosen tier would let anyone downgrade an executive decision.
  const tier = tierFor(parsed.data.actionKind as OsActionKind);
  if (tier === 'automatic') {
    return fail('That action is automatic and does not need an approval request.');
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('os_approvals')
      .insert({
        title: parsed.data.title,
        action_kind: parsed.data.actionKind,
        tier,
        reason: parsed.data.reason || null,
        expected_outcome: parsed.data.expectedOutcome || null,
        risk_level: parsed.data.riskLevel,
        mission_id: parsed.data.missionId || null,
        requested_by: viewer.userId,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) return fail(schemaHint(error.message));
    await recordActivity({
      actorId: viewer.userId, action: 'approval.requested', entityType: 'approval',
      entityId: data.id, next: { ...parsed.data, tier }, note: parsed.data.title,
    });
    refresh();
    return { ok: true, data: { id: data.id as string, tier } };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function decideApproval(input: unknown): Promise<OsResult> {
  const schema = z.object({
    id: z.string().uuid(),
    decision: z.enum(['approved', 'rejected', 'changes_requested']),
    note: z.string().trim().max(1000).optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail('Invalid decision.');
  const viewer = await getViewer();
  if (!viewer) return fail('Not signed in.');

  try {
    const admin = createAdminClient();
    const { data: current } = await admin
      .from('os_approvals').select('status, tier, requested_by, title').eq('id', parsed.data.id).single();
    if (!current) return fail('Request not found.');

    // Role + self-approval check, then the state machine.
    const allowed = canDecideApproval(viewer.role, current.tier, {
      requesterId: current.requested_by,
      deciderId: viewer.userId,
    });
    if (!allowed.allowed) return fail(allowed.reason ?? 'You cannot decide this request.');

    const t = canTransitionApproval(current.status, parsed.data.decision);
    if (!t.allowed) return fail(t.reason ?? 'This request has already been decided.');

    const { error } = await admin
      .from('os_approvals')
      .update({
        status: parsed.data.decision,
        decided_by: viewer.userId,
        decided_at: new Date().toISOString(),
        decision_note: parsed.data.note || null,
      })
      .eq('id', parsed.data.id)
      // Guard against two people deciding at once: only a still-pending row updates.
      .eq('status', current.status);
    if (error) return fail(error.message);

    await recordActivity({
      actorId: viewer.userId, action: `approval.${parsed.data.decision}`, entityType: 'approval',
      entityId: parsed.data.id, previous: { status: current.status }, next: { status: parsed.data.decision },
      note: parsed.data.note || current.title,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** Turn a missing-table error into an actionable instruction. */
function schemaHint(m: string): string {
  return /relation .* does not exist/i.test(m)
    ? 'Apply migration 0028_verdict_os before using Verd1ct OS.'
    : m;
}
