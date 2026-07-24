/**
 * Founder test SESSION model (pure). A founder can run several independent,
 * named Watch-DNA sessions and switch between them — "refresh" starts a clean
 * slate without deleting the old one, so before/after comparisons stay possible.
 * This module is pure (no I/O): types, ordering, naming, and the "which session
 * is active" selection. The DB store (sessions.ts) layers I/O on top.
 */

import type { FounderKey } from './access';

export type SessionStatus = 'active' | 'archived';

export interface FounderSession {
  id: string;
  userId: string;
  founder: FounderKey;
  name: string;
  status: SessionStatus;
  algoVersion: string | null;
  quizPosition: number;
  isTest: boolean;
  createdAt: number; // epoch ms
  lastActiveAt: number; // epoch ms
}

/** Newest activity first; active sessions always sort ahead of archived. */
export function sortSessions(sessions: readonly FounderSession[]): FounderSession[] {
  return [...sessions].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.lastActiveAt - a.lastActiveAt;
  });
}

/** The one session a founder is currently building — most-recently-active active session. */
export function activeSession(sessions: readonly FounderSession[]): FounderSession | null {
  const active = sortSessions(sessions).filter((s) => s.status === 'active');
  return active[0] ?? null;
}

/**
 * A friendly default name for a brand-new session. Deterministic given the
 * inputs (we pass `now` in, never read the clock here) so it is unit-testable.
 * Names are just labels — uniqueness is the row id's job.
 */
export function defaultSessionName(existingCount: number, now: number): string {
  const n = existingCount + 1;
  const d = new Date(now);
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return `Session ${n} · ${stamp}`;
}

/**
 * A stable, collision-resistant session id from a per-request seed. Pure: the
 * caller supplies entropy (a uuid / random hex) so this stays deterministic and
 * testable; we just namespace it by founder.
 */
export function makeSessionId(founder: FounderKey, seed: string): string {
  const clean = seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'x';
  return `fs_${founder}_${clean}`;
}

/** Trim + bound a user-supplied session name; empty falls back to a default. */
export function sanitizeSessionName(raw: string, fallback: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return fallback;
  return t.slice(0, 60);
}
