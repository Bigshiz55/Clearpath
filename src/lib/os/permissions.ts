/**
 * VERD1CT OS — roles, permissions and approval tiers (pure, no I/O).
 *
 * This is the security spine of the OS. Every server action checks these
 * functions BEFORE touching data, and the same functions drive what the UI
 * offers, so the interface can never present an action the server would reject.
 *
 * Deliberately deny-by-default: an unknown role gets nothing.
 */

export type OsRole = 'founder' | 'admin' | 'manager' | 'contributor' | 'approver' | 'viewer';

export const OS_ROLES: OsRole[] = ['founder', 'admin', 'manager', 'contributor', 'approver', 'viewer'];

/** Approval tiers, from the spec. */
export type ApprovalTier = 'automatic' | 'approval_required' | 'executive_only';

export type OsCapability =
  // Missions
  | 'mission.view' | 'mission.create' | 'mission.edit' | 'mission.delete'
  // Tasks
  | 'task.view' | 'task.create' | 'task.edit'
  // Approvals
  | 'approval.view' | 'approval.request' | 'approval.decide' | 'approval.decide_executive'
  // Automations
  | 'automation.view' | 'automation.edit' | 'automation.run'
  // Administrative
  | 'settings.edit' | 'audit.view';

const MATRIX: Record<OsRole, OsCapability[]> = {
  founder: [
    'mission.view', 'mission.create', 'mission.edit', 'mission.delete',
    'task.view', 'task.create', 'task.edit',
    'approval.view', 'approval.request', 'approval.decide', 'approval.decide_executive',
    'automation.view', 'automation.edit', 'automation.run',
    'settings.edit', 'audit.view',
  ],
  admin: [
    'mission.view', 'mission.create', 'mission.edit', 'mission.delete',
    'task.view', 'task.create', 'task.edit',
    'approval.view', 'approval.request', 'approval.decide',
    'automation.view', 'automation.edit', 'automation.run',
    'settings.edit', 'audit.view',
  ],
  manager: [
    'mission.view', 'mission.create', 'mission.edit',
    'task.view', 'task.create', 'task.edit',
    'approval.view', 'approval.request', 'approval.decide',
    'automation.view', 'automation.run',
    'audit.view',
  ],
  approver: [
    'mission.view', 'task.view',
    'approval.view', 'approval.request', 'approval.decide',
    'automation.view',
  ],
  contributor: [
    'mission.view', 'task.view', 'task.create', 'task.edit',
    'approval.view', 'approval.request',
    'automation.view',
  ],
  viewer: ['mission.view', 'task.view', 'approval.view', 'automation.view'],
};

/** Deny-by-default capability check. */
export function can(role: OsRole | null | undefined, capability: OsCapability): boolean {
  if (!role) return false;
  return (MATRIX[role] ?? []).includes(capability);
}

/** Every capability a role holds — used to shape the UI. */
export function capabilitiesFor(role: OsRole | null | undefined): OsCapability[] {
  if (!role) return [];
  return [...(MATRIX[role] ?? [])];
}

/**
 * Can this person decide THIS approval? Executive-tier requests need the
 * executive capability, and — critically — nobody may approve their own
 * request, regardless of role. That rule has no exception, including founder:
 * self-approval would make the audit trail meaningless.
 */
export function canDecideApproval(
  role: OsRole | null | undefined,
  tier: ApprovalTier,
  opts: { requesterId: string; deciderId: string },
): { allowed: boolean; reason?: string } {
  if (!role) return { allowed: false, reason: 'No role assigned.' };
  if (tier === 'automatic') {
    return { allowed: false, reason: 'Automatic actions do not require a decision.' };
  }
  if (opts.requesterId === opts.deciderId) {
    return { allowed: false, reason: 'You cannot decide your own request.' };
  }
  if (tier === 'executive_only') {
    return can(role, 'approval.decide_executive')
      ? { allowed: true }
      : { allowed: false, reason: 'This request is executive-only.' };
  }
  return can(role, 'approval.decide')
    ? { allowed: true }
    : { allowed: false, reason: 'Your role cannot approve requests.' };
}

/**
 * Which tier does an action fall into? Straight from the spec so the
 * classification is testable and cannot drift between UI and server.
 */
export type OsActionKind =
  | 'internal_summary' | 'report' | 'diagnostic' | 'test_run' | 'data_refresh'
  | 'publish_content' | 'send_outreach' | 'launch_campaign' | 'social_post'
  | 'production_deploy' | 'customer_comms' | 'change_automation' | 'spend_within_limit'
  | 'pricing_change' | 'contract' | 'destructive_data' | 'major_spend'
  | 'security_change' | 'legal_commitment' | 'irreversible_migration'
  | 'product_shutdown' | 'permission_change';

const TIERS: Record<OsActionKind, ApprovalTier> = {
  internal_summary: 'automatic', report: 'automatic', diagnostic: 'automatic',
  test_run: 'automatic', data_refresh: 'automatic',

  publish_content: 'approval_required', send_outreach: 'approval_required',
  launch_campaign: 'approval_required', social_post: 'approval_required',
  production_deploy: 'approval_required', customer_comms: 'approval_required',
  change_automation: 'approval_required', spend_within_limit: 'approval_required',

  pricing_change: 'executive_only', contract: 'executive_only',
  destructive_data: 'executive_only', major_spend: 'executive_only',
  security_change: 'executive_only', legal_commitment: 'executive_only',
  irreversible_migration: 'executive_only', product_shutdown: 'executive_only',
  permission_change: 'executive_only',
};

export function tierFor(action: OsActionKind): ApprovalTier {
  return TIERS[action];
}

/** Every action that needs a human decision (i.e. is not automatic). */
export function requiresApproval(action: OsActionKind): boolean {
  return tierFor(action) !== 'automatic';
}
