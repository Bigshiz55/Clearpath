// Canonical lifecycle status for a book in a reader's library. The Phase 2
// StatusPill used display labels; this is the canonical machine value used by
// imports, persistence, and Reader DNA learning.

export type UserBookStatus =
  | 'saved'
  | 'interested'
  | 'reading'
  | 'finished'
  | 'dnf' // did not finish
  | 'paused'
  | 'reread';

export const USER_BOOK_STATUSES: readonly UserBookStatus[] = [
  'saved',
  'interested',
  'reading',
  'finished',
  'dnf',
  'paused',
  'reread',
] as const;

const LABELS: Record<UserBookStatus, string> = {
  saved: 'Saved',
  interested: 'Interested',
  reading: 'Reading',
  finished: 'Finished',
  dnf: 'DNF',
  paused: 'Paused',
  reread: 'Want to reread',
};

export function statusLabel(status: UserBookStatus): string {
  return LABELS[status];
}

/** Reasons a reader abandons a book (kept separate from durable dislikes). */
export type DnfReason =
  | 'too_slow'
  | 'prose'
  | 'confusing'
  | 'too_dark'
  | 'characters'
  | 'too_long'
  | 'lost_interest'
  | 'too_graphic'
  | 'wrong_mood'
  | 'narrator'
  | 'other';

export const DNF_REASONS: Record<DnfReason, string> = {
  too_slow: 'Too slow',
  prose: 'Prose was not for me',
  confusing: 'Too confusing',
  too_dark: 'Too dark',
  characters: 'Did not connect with characters',
  too_long: 'Too long',
  lost_interest: 'Lost interest',
  too_graphic: 'Too graphic',
  wrong_mood: 'Not the right mood',
  narrator: 'Audiobook narrator',
  other: 'Other',
};
