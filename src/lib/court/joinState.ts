/**
 * Live Court error/state classification. PURE. Maps a Supabase RPC error (or an
 * effective room status) to ONE explicit state with a user-facing message and a
 * recovery action — so nothing ever collapses into a generic error or an infinite
 * spinner. Diagnostics carry a correlation id but never secrets.
 */

export type CourtState =
  | 'ok'
  | 'room-not-found'
  | 'room-expired'
  | 'room-closed'
  | 'court-already-started'
  | 'room-full'
  | 'name-required'
  | 'invite-invalid'
  | 'config-missing'
  | 'migration-missing'
  | 'permission-denied'
  | 'connection-failed'
  | 'unexpected';

export type RecoveryAction =
  | 'try-again'
  | 'ask-host-new-invite'
  | 'return-home'
  | 'reconnect'
  | 'open-correct-site'
  | 'none';

export interface ClassifiedError {
  state: CourtState;
  /** Short, friendly, no secrets/stack. */
  message: string;
  recovery: RecoveryAction;
  /** True when re-polling could still succeed (transient). */
  transient: boolean;
}

interface RpcErrorLike { message?: string | null; code?: string | null; details?: string | null }

const MESSAGES: Record<CourtState, { message: string; recovery: RecoveryAction; transient: boolean }> = {
  'ok': { message: '', recovery: 'none', transient: false },
  'room-not-found': { message: 'This Court room doesn’t exist. Double-check the link, or ask the host for a new invite.', recovery: 'ask-host-new-invite', transient: false },
  'room-expired': { message: 'This Court has expired. Ask the host to start a new one.', recovery: 'ask-host-new-invite', transient: false },
  'room-closed': { message: 'This Court has been closed by the host.', recovery: 'ask-host-new-invite', transient: false },
  'court-already-started': { message: 'This Court has already started, so new people can’t join. Ask the host to start a fresh room.', recovery: 'ask-host-new-invite', transient: false },
  'room-full': { message: 'This Court is full (8 people max).', recovery: 'ask-host-new-invite', transient: false },
  'name-required': { message: 'Enter a display name to join.', recovery: 'try-again', transient: false },
  'invite-invalid': { message: 'This invite link is incomplete or malformed.', recovery: 'ask-host-new-invite', transient: false },
  'config-missing': { message: 'This site isn’t fully configured for Live Court yet. If you opened a preview link, make sure you’re on the main site.', recovery: 'open-correct-site', transient: false },
  'migration-missing': { message: 'Live Court isn’t set up on this site yet (database update needed).', recovery: 'ask-host-new-invite', transient: false },
  'permission-denied': { message: 'You don’t have permission to do that here.', recovery: 'return-home', transient: false },
  'connection-failed': { message: 'Couldn’t reach the room. Check your connection and try again.', recovery: 'reconnect', transient: true },
  'unexpected': { message: 'Something went wrong. Try again in a moment.', recovery: 'try-again', transient: true },
};

/** Build a full ClassifiedError from a state. */
export function stateInfo(state: CourtState): ClassifiedError {
  const m = MESSAGES[state];
  return { state, ...m };
}

/** The DB raises these exact tokens (see 0023_court_hardening.sql). */
function fromRaisedToken(msg: string): CourtState | null {
  const t = msg.toUpperCase();
  if (t.includes('ROOM_NOT_FOUND')) return 'room-not-found';
  if (t.includes('ROOM_EXPIRED')) return 'room-expired';
  if (t.includes('ROOM_CLOSED')) return 'room-closed';
  if (t.includes('COURT_ALREADY_STARTED')) return 'court-already-started';
  if (t.includes('ROOM_FULL')) return 'room-full';
  if (t.includes('NAME_REQUIRED')) return 'name-required';
  if (t.includes('NOT_HOST')) return 'permission-denied';
  return null;
}

/** Classify a Supabase RPC error (from court_join / court_state / …). */
export function classifyRpcError(err: RpcErrorLike | null | undefined): ClassifiedError {
  if (!err) return stateInfo('unexpected');
  const code = (err.code ?? '').toString();
  const msg = (err.message ?? '').toString();

  // Undefined table/function → the migration hasn't been applied on this deployment.
  if (code === '42P01' || code === '42883' || /relation .* does not exist|function .* does not exist/i.test(msg)) {
    return stateInfo('migration-missing');
  }
  // RLS / permission.
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return stateInfo('permission-denied');
  }
  // Our own raised tokens.
  const token = fromRaisedToken(msg);
  if (token) return stateInfo(token);

  // Network / fetch failures surface as generic messages from supabase-js.
  if (/failed to fetch|networkerror|load failed|timeout|timed out/i.test(msg)) {
    return stateInfo('connection-failed');
  }
  return stateInfo('unexpected');
}

/** Classify the effective room status returned by court_state. */
export function classifyRoomStatus(status: string | null | undefined): ClassifiedError {
  switch (status) {
    case 'lobby':
    case 'veto':
    case 'verdict':
      return stateInfo('ok');
    case 'expired':
      return stateInfo('room-expired');
    case 'closed':
      return stateInfo('room-closed');
    default:
      return stateInfo('unexpected');
  }
}
