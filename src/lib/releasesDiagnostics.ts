/**
 * NEW-RELEASES EMPTY-STATE DIAGNOSTICS (pure). The "Shows + Upcoming + Soonest +
 * Netflix → no titles" report was NOT a wiring bug: the controls reach the query
 * and the request is reissued. The failure is a DATA-SOURCE limitation — TMDB's
 * watch-provider data reflects only CURRENT streaming availability, so combining
 * a provider filter with the UPCOMING window is unsupported and always empty.
 *
 * This module turns an empty result into a TRUTHFUL, distinct reason code +
 * message + recovery actions, so an unsupported combination is never shown as
 * "no titles exist." No I/O; unit-tested.
 */

export type ReleasesEmptyReason =
  | 'ok' // has results — no empty state
  | 'unsupported_upcoming_provider' // upcoming + provider filter: not verifiable
  | 'no_data' // genuinely nothing for this valid combination
  | 'api_error'; // the request failed

export interface ReleasesEmptyState {
  reason: ReleasesEmptyReason;
  message: string;
  /** Suggested recovery actions the UI renders as buttons (each maps to a state change). */
  actions: { label: string; patch: Partial<{ window: 'recent' | 'upcoming'; providerIds: number[] }> }[];
}

export interface ReleasesEmptyInput {
  window: 'recent' | 'upcoming';
  providerIds: number[];
  itemCount: number;
  errored?: boolean;
}

/**
 * Streaming providers do NOT expose verified future (upcoming) availability
 * through the watch-provider endpoint. Networks/live-TV would need an EPG. So
 * for the releases wall, no streaming provider currently supports the upcoming
 * window — the combination is disclosed, not silently emptied.
 */
export function providerSupportsUpcoming(_providerId: number): boolean {
  return false;
}

/** Classify why the releases wall is empty (or 'ok' when it isn't). */
export function releasesEmptyState(i: ReleasesEmptyInput): ReleasesEmptyState {
  if (i.errored) {
    return {
      reason: 'api_error',
      message: 'Couldn’t load new releases just now. Your previous view is unchanged — try again in a moment.',
      actions: [],
    };
  }
  if (i.itemCount > 0) {
    return { reason: 'ok', message: '', actions: [] };
  }
  // The headline case: upcoming + a provider filter can't be verified.
  if (i.window === 'upcoming' && i.providerIds.length > 0 && i.providerIds.every(providerSupportsUpcoming) === false) {
    return {
      reason: 'unsupported_upcoming_provider',
      message:
        'Verified upcoming availability for that service isn’t published by our current listings source. ' +
        'I can show general upcoming titles, or that service’s titles available now.',
      actions: [
        { label: 'View general upcoming (all platforms)', patch: { providerIds: [] } },
        { label: 'View that service’s titles out now', patch: { window: 'recent' } },
      ],
    };
  }
  // Genuinely empty for a supported combination.
  return {
    reason: 'no_data',
    message:
      i.window === 'upcoming'
        ? 'No verified upcoming titles were found for your region with these filters.'
        : 'Nothing matched these filters for your region.',
    actions: [
      ...(i.providerIds.length > 0 ? [{ label: 'Try all platforms', patch: { providerIds: [] as number[] } }] : []),
      ...(i.window === 'upcoming' ? [{ label: 'Switch to Out now', patch: { window: 'recent' as const } }] : []),
    ],
  };
}
