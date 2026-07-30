/**
 * Founder test-environment ACCESS control (pure). Three genuinely separate
 * founder identities — Scott, Heather, Amy — each with their own sign-in account
 * and their own isolated Watch DNA. This module decides, from a signed-in email
 * and the configured founder/admin allowlists, whether a request may enter a
 * given founder route — and, if not, why and where the user IS allowed.
 *
 * Data isolation itself is enforced at the DB level (RLS keys every row to the
 * founder's own user_id); this is the ROUTE gate on top of that. No I/O.
 */

export type FounderKey = 'scott' | 'heather' | 'amy';

export interface Founder {
  key: FounderKey;
  name: string;
  route: string; // canonical, PascalCase
  badge: string;
}

export const FOUNDERS: readonly Founder[] = [
  { key: 'scott', name: 'Scott', route: '/TestScott', badge: 'SCOTT TEST MODE' },
  { key: 'heather', name: 'Heather', route: '/TestHeather', badge: 'HEATHER TEST MODE' },
  { key: 'amy', name: 'Amy', route: '/TestAmy', badge: 'AMY TEST MODE' },
] as const;

export function founderByKey(key: FounderKey): Founder {
  return FOUNDERS.find((f) => f.key === key)!;
}

/** Case-insensitive path → founder key. '/testscott', '/TestScott' → 'scott'. */
export function founderForPath(pathSegment: string): FounderKey | null {
  const p = pathSegment.replace(/^\/+/, '').toLowerCase();
  if (p === 'testscott') return 'scott';
  if (p === 'testheather') return 'heather';
  if (p === 'testamy') return 'amy';
  return null;
}

export interface AccessConfig {
  /** email per founder (server env). */
  founderEmails: Partial<Record<FounderKey, string | undefined>>;
  /** admin/owner emails — may access every founder route. */
  adminEmails: string[];
}

export type DenyReason = 'not_signed_in' | 'wrong_founder' | 'not_a_founder' | 'not_configured';

export interface AccessResult {
  allowed: boolean;
  isOwner: boolean;
  /** The founder route being requested. */
  founder: FounderKey;
  reason?: DenyReason;
  /** If the signed-in user is a DIFFERENT founder, the route they MAY use. */
  authorizedRoute?: string;
}

/** Which founder (if any) does this email map to? */
export function founderOfEmail(email: string, cfg: AccessConfig): FounderKey | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  for (const f of FOUNDERS) {
    if ((cfg.founderEmails[f.key] ?? '').toLowerCase() === e && e) return f.key;
  }
  return null;
}

/**
 * Decide access to a founder route. Admins may enter any route (for support);
 * a founder may enter ONLY their own; anyone else is denied — never shown
 * another founder's environment.
 */
export function resolveFounderAccess(email: string | null | undefined, founder: FounderKey, cfg: AccessConfig): AccessResult {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return { allowed: false, isOwner: false, founder, reason: 'not_signed_in' };

  if (cfg.adminEmails.map((a) => a.toLowerCase()).includes(e)) {
    return { allowed: true, isOwner: true, founder };
  }

  const mine = founderOfEmail(e, cfg);
  if (mine === founder) return { allowed: true, isOwner: false, founder };
  if (mine) return { allowed: false, isOwner: false, founder, reason: 'wrong_founder', authorizedRoute: founderByKey(mine).route };
  return { allowed: false, isOwner: false, founder, reason: 'not_a_founder' };
}

/** Human-readable deny message (also used by the access-denied screen). */
export function denyMessage(r: AccessResult): string {
  switch (r.reason) {
    case 'not_signed_in': return 'Please sign in to access this founder test environment.';
    case 'wrong_founder': return 'This is not your founder test environment. Use your own authorized route.';
    case 'not_a_founder': return 'This account is not an approved founder. Access denied.';
    case 'not_configured': return 'This founder environment is not configured yet.';
    default: return 'Access denied.';
  }
}
