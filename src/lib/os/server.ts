import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';
import type { OsRole } from './permissions';
import type { MissionStatus, TaskStatus, ApprovalStatus, Priority } from './workflow';

/**
 * VERD1CT OS — server-side identity, data loading and audit.
 *
 * Reads use the caller's own session (RLS restricts them to OS members).
 * Writes use the admin client because the OS tables carry NO write policy by
 * design; every write is gated by a capability check in the calling action and
 * recorded in the append-only activity log.
 */

export interface OsViewer {
  userId: string;
  email: string;
  role: OsRole | null;
  displayName: string | null;
}

/**
 * Who is asking, and with what role. The configured ADMIN_EMAILS founder is
 * recognised even before an os_members row exists, so the OS is reachable on a
 * fresh database — otherwise nobody could ever grant the first role.
 */
export async function getViewer(): Promise<OsViewer | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  let role: OsRole | null = null;
  let displayName: string | null = null;
  try {
    const { data } = await supabase.from('os_members').select('role, display_name').eq('user_id', user.id).maybeSingle();
    if (data) {
      role = data.role as OsRole;
      displayName = (data.display_name as string | null) ?? null;
    }
  } catch {
    /* table missing → fall through to the bootstrap rule below */
  }
  if (!role && isAdminEmail(user.email)) role = 'founder';
  return { userId: user.id, email: user.email, role, displayName };
}

export interface MissionRow {
  id: string; title: string; objective: string | null; description: string | null;
  status: MissionStatus; priority: Priority; target_date: string | null;
  product_id: string | null; owner_id: string | null; created_at: string; updated_at: string;
}
export interface TaskRow {
  id: string; mission_id: string; title: string; detail: string | null;
  status: TaskStatus; created_at: string;
}
export interface ApprovalRow {
  id: string; title: string; action_kind: string; tier: 'automatic' | 'approval_required' | 'executive_only';
  reason: string | null; expected_outcome: string | null; risk_level: string;
  status: ApprovalStatus; requested_by: string; decided_by: string | null;
  decided_at: string | null; decision_note: string | null; due_date: string | null; created_at: string;
}
export interface ActivityRow {
  id: string; actor_id: string | null; action: string; entity_type: string;
  entity_id: string | null; note: string | null; created_at: string;
}

/** Everything the OS needs, loaded once. Empty arrays when the migration is
 *  not yet applied, so the OS renders an honest empty state instead of 500ing. */
export async function loadOsData() {
  const supabase = createClient();
  const safe = async <T>(fn: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await fn();
      return error || !data ? [] : data;
    } catch {
      return [];
    }
  };
  const [missions, tasks, approvals, activity, products] = await Promise.all([
    safe<MissionRow>(() => supabase.from('os_missions').select('*').order('created_at', { ascending: false })),
    safe<TaskRow>(() => supabase.from('os_tasks').select('*').order('created_at', { ascending: true })),
    safe<ApprovalRow>(() => supabase.from('os_approvals').select('*').order('created_at', { ascending: false })),
    safe<ActivityRow>(() => supabase.from('os_activity').select('*').order('created_at', { ascending: false }).limit(50)),
    safe<{ id: string; key: string; name: string; status: string }>(() => supabase.from('os_products').select('*').order('name')),
  ]);
  return { missions, tasks, approvals, activity, products };
}

/** Is the OS schema present? Drives the setup notice rather than a crash. */
export async function osSchemaReady(): Promise<boolean> {
  try {
    const { error } = await createClient().from('os_missions').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Append to the audit trail. Best-effort by design — a failed audit write must
 * never roll back the user's work, but it is logged as a real gap.
 */
export async function recordActivity(entry: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  previous?: unknown;
  next?: unknown;
  note?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('os_activity').insert({
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      previous: entry.previous ?? null,
      next: entry.next ?? null,
      note: entry.note ?? null,
    });
  } catch {
    /* never block the primary write */
  }
}
