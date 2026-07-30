/**
 * ROOM SETTINGS (pure, no I/O) — who may change the court size, and what every
 * member is told about it.
 *
 * The court size belongs to the ROOM, not to a person. Exactly one member (the
 * creator) may set it; everyone else sees the same value as a read-only fact.
 * Hiding it from guests would be worse than showing it: they need to know how
 * many titles the room will weigh before they invest in their preferences.
 */

import { COURT_SIZES, DEFAULT_COURT_SIZE, type CourtSize } from './pool';

/** Narrow an untrusted value (DB column, API body, localStorage) to a size. */
export function asCourtSize(value: unknown): CourtSize {
  return value === 'quick' || value === 'standard' || value === 'deep' ? value : DEFAULT_COURT_SIZE;
}

export interface RoomSizeView {
  size: CourtSize;
  /** May the viewer change it right now? */
  editable: boolean;
  /** Headline: "Standard Court selected by Heather". */
  headline: string;
  /** Detail: "12 titles · 6 in play · 6 in reserve". */
  detail: string;
  /** Why it cannot be changed, when it cannot. Null when editable. */
  lockedReason: string | null;
}

/**
 * What one viewer sees. `isHost` comes from holding the room's host token, and
 * `locked` from the room having left the lobby — candidate generation has begun
 * and the shortlist already reflects a size, so changing it now would silently
 * invalidate what everyone is looking at.
 */
export function roomSizeView(input: {
  size: CourtSize;
  isHost: boolean;
  locked: boolean;
  /** Display name of the creator; null until they have joined. */
  hostName: string | null;
}): RoomSizeView {
  const spec = COURT_SIZES[input.size];
  const by = input.hostName?.trim() ? input.hostName.trim() : 'the host';
  const headline = input.isHost
    ? `${spec.label} — your choice for the room`
    : `${spec.label} selected by ${by}`;
  const detail = `${spec.total} titles · ${spec.active} in play · ${spec.total - spec.active} in reserve`;

  if (input.locked) {
    return {
      size: input.size, editable: false, headline, detail,
      lockedReason: 'Locked — the court has already been built for this size.',
    };
  }
  if (!input.isHost) {
    return {
      size: input.size, editable: false, headline, detail,
      lockedReason: `Only ${by} can change this.`,
    };
  }
  return { size: input.size, editable: true, headline, detail, lockedReason: null };
}

/** The room label for a participant. Only the creator is the Host. */
export function participantRole(isHost: boolean): 'Host' | 'Member' {
  return isHost ? 'Host' : 'Member';
}
