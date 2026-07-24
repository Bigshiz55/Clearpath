import { describe, it, expect } from 'vitest';
import {
  sortSessions,
  activeSession,
  defaultSessionName,
  makeSessionId,
  sanitizeSessionName,
  type FounderSession,
} from './sessionModel';

function s(partial: Partial<FounderSession>): FounderSession {
  return {
    id: partial.id ?? 'fs_scott_a',
    userId: partial.userId ?? 'u1',
    founder: partial.founder ?? 'scott',
    name: partial.name ?? 'S',
    status: partial.status ?? 'active',
    algoVersion: partial.algoVersion ?? null,
    quizPosition: partial.quizPosition ?? 0,
    isTest: partial.isTest ?? true,
    createdAt: partial.createdAt ?? 0,
    lastActiveAt: partial.lastActiveAt ?? 0,
  };
}

describe('founder session model (pure)', () => {
  it('sorts active before archived, newest activity first', () => {
    const list = [
      s({ id: 'old-active', status: 'active', lastActiveAt: 100 }),
      s({ id: 'archived-new', status: 'archived', lastActiveAt: 999 }),
      s({ id: 'new-active', status: 'active', lastActiveAt: 500 }),
    ];
    expect(sortSessions(list).map((x) => x.id)).toEqual(['new-active', 'old-active', 'archived-new']);
  });

  it('activeSession picks the most-recently-active ACTIVE session', () => {
    const list = [
      s({ id: 'a', status: 'active', lastActiveAt: 10 }),
      s({ id: 'b', status: 'active', lastActiveAt: 20 }),
      s({ id: 'c', status: 'archived', lastActiveAt: 99 }),
    ];
    expect(activeSession(list)?.id).toBe('b');
    expect(activeSession([s({ id: 'z', status: 'archived' })])).toBeNull();
    expect(activeSession([])).toBeNull();
  });

  it('defaultSessionName is deterministic given now', () => {
    const t = Date.UTC(2026, 6, 24); // 2026-07-24
    expect(defaultSessionName(0, t)).toBe('Session 1 · 2026-07-24');
    expect(defaultSessionName(3, t)).toBe('Session 4 · 2026-07-24');
  });

  it('makeSessionId namespaces by founder and strips unsafe chars', () => {
    expect(makeSessionId('scott', 'ab-cd/ef')).toBe('fs_scott_abcdef');
    expect(makeSessionId('amy', '')).toBe('fs_amy_x');
    expect(makeSessionId('heather', 'A'.repeat(40)).length).toBeLessThanOrEqual(40);
  });

  it('sanitizeSessionName trims, collapses, bounds, and falls back', () => {
    expect(sanitizeSessionName('   ', 'Default')).toBe('Default');
    expect(sanitizeSessionName('  My   Test  ', 'D')).toBe('My Test');
    expect(sanitizeSessionName('x'.repeat(100), 'D').length).toBe(60);
  });
});
