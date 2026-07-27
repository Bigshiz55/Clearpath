/**
 * WHAT TIME IS IT WHERE THE VIEWER IS.
 *
 * A listing carries two different times and they are not interchangeable:
 *
 *   `airstamp` — a real UTC instant. Unambiguous.
 *   `time`     — a pre-formatted "HH:MM" clock string that came off the
 *                provider in the NETWORK's timezone (US Eastern, for both
 *                Gracenote and TVmaze's US grid).
 *
 * The window ("the next 2 hours") is computed on the instant, which is right.
 * The label was rendered from the pre-formatted string, which is Eastern — so
 * anyone outside Eastern read a time that was hours off and did not match the
 * heading. On the West Coast a show starting in forty minutes announced itself
 * as "3:42 AM", which reads as something that already happened.
 *
 * So: always format from the instant, in the viewer's own zone. The provider's
 * string is only a fallback for a listing with no usable instant, where a
 * network-local time is all that exists.
 *
 * Pure — the zone is a parameter, so this is testable without touching TZ.
 */

/** The viewer's clock time for an airing. Null when the instant is unusable. */
export function airingClock(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return null;
  }
}

/** "3:42 AM" from a bare provider "HH:MM". Network-local — a last resort. */
export function clockFromProviderTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const raw = Number(m[1]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 23) return null;
  const ampm = raw >= 12 ? 'PM' : 'AM';
  const h = raw % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

/**
 * The label to show. Prefers the viewer's own clock; falls back to the
 * network's only when there is no instant to work from.
 */
export function displayClock(
  airstamp: string | null | undefined,
  providerTime: string | null | undefined,
  timeZone?: string,
): string | null {
  return airingClock(airstamp, timeZone) ?? clockFromProviderTime(providerTime);
}

/**
 * Has it started yet?
 *
 * The windowed guide deliberately includes airings that are already running —
 * joining a film twenty minutes late is a real option, and the schedule data
 * supports it. But the heading says "coming on in the next N hours", so
 * printing a start time that has already passed reads as a broken clock. The
 * card has to say which of the two it is.
 */
export type AiringState = 'upcoming' | 'live' | 'ended';

export interface AiringStatus {
  state: AiringState;
  /** Minutes since it started. 0 for anything not yet begun. */
  startedMinutesAgo: number;
}

export function airingStatus(
  airstamp: string | null | undefined,
  runtimeMinutes: number | null | undefined,
  nowMs: number,
): AiringStatus {
  const start = airstamp ? Date.parse(airstamp) : NaN;
  if (!Number.isFinite(start)) return { state: 'upcoming', startedMinutesAgo: 0 };
  if (start > nowMs) return { state: 'upcoming', startedMinutesAgo: 0 };
  const startedMinutesAgo = Math.max(0, Math.floor((nowMs - start) / 60_000));
  // No runtime means we cannot say it has finished, and guessing that it has
  // would hide something the viewer could still be watching.
  const runtime = typeof runtimeMinutes === 'number' && runtimeMinutes > 0 ? runtimeMinutes : null;
  if (runtime != null && nowMs >= start + runtime * 60_000) {
    return { state: 'ended', startedMinutesAgo };
  }
  return { state: 'live', startedMinutesAgo };
}

/** "On now · started 18m ago" — what a live airing should say instead of a time. */
export function liveLabel(startedMinutesAgo: number): string {
  if (startedMinutesAgo < 1) return 'On now';
  if (startedMinutesAgo < 60) return `On now · ${startedMinutesAgo}m in`;
  const h = Math.floor(startedMinutesAgo / 60);
  const m = startedMinutesAgo % 60;
  return m === 0 ? `On now · ${h}h in` : `On now · ${h}h ${m}m in`;
}
