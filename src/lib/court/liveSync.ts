/**
 * LIVE SYNC POLICY (pure, no I/O).
 *
 * The court is a room of people reacting to each other, so a two-second poll is
 * both too slow to feel live and too expensive to run for every room at scale.
 *
 * The design here is deliberate: Realtime carries a SIGNAL, never the data.
 * `court_messages` is RLS-protected with no direct SELECT policy — chat only
 * ever leaves the database through `court_state_v2`, which checks access. A
 * broadcast therefore says only "something changed in this room"; the client
 * then re-reads state through the RPC it was already using. Nothing a member
 * could not already fetch is exposed by the channel, and a hijacked broadcast
 * can at worst cause an extra authorised read.
 *
 * Polling never goes away — it is the fallback when the socket is down, which
 * is why the interval is a function of connection state rather than a constant.
 */

export type SyncStatus = 'connecting' | 'live' | 'polling';

/** One channel per room. The code is already the room's shared secret. */
export const channelName = (code: string) => `court:${code.toUpperCase()}`;

/** Broadcast events. `chat` and `state` are separated so the UI can react
 *  differently — a new message may buzz the chat button, a state change may not. */
export type SyncEvent = 'chat' | 'state';

export const POLL_LIVE_MS = 15_000; // heartbeat only; the socket does the work
export const POLL_FALLBACK_MS = 2_000; // socket down: keep the room usable
export const POLL_CONNECTING_MS = 2_000;

/**
 * How often to poll. When Realtime is connected we still poll slowly, because
 * a dropped broadcast must not leave a room permanently stale — but at 15s
 * instead of 2s, which is ~87% fewer reads per room.
 */
export function pollIntervalMs(status: SyncStatus): number {
  if (status === 'live') return POLL_LIVE_MS;
  if (status === 'connecting') return POLL_CONNECTING_MS;
  return POLL_FALLBACK_MS;
}

/**
 * Map a Supabase channel status string onto our three states. Anything we do
 * not recognise degrades to polling: an unknown socket state must never be
 * optimistically treated as live, or the room silently stops updating.
 */
export function statusFromChannel(raw: string): SyncStatus {
  if (raw === 'SUBSCRIBED') return 'live';
  if (raw === 'JOINING') return 'connecting';
  return 'polling';
}

/** What the room is told. Honest about degraded mode, never alarming. */
export function syncLabel(status: SyncStatus): string {
  if (status === 'live') return 'Live';
  if (status === 'connecting') return 'Connecting…';
  return 'Reconnecting — still updating';
}

/**
 * Coalesce bursts: when five people react at once we want ONE re-read, not
 * five. Returns the delay before the next refresh should fire.
 */
export const REFRESH_COALESCE_MS = 120;
