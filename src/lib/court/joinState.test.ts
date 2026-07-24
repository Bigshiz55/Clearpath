import { describe, it, expect } from 'vitest';
import { classifyRpcError, classifyRoomStatus, stateInfo } from './joinState';

describe('classifyRpcError — distinct states, never a generic blob', () => {
  it('missing table/function → migration-missing', () => {
    expect(classifyRpcError({ code: '42P01', message: 'relation "public.court_rooms" does not exist' }).state).toBe('migration-missing');
    expect(classifyRpcError({ code: '42883', message: 'function public.court_health() does not exist' }).state).toBe('migration-missing');
  });
  it('RLS/permission → permission-denied', () => {
    expect(classifyRpcError({ code: '42501', message: 'permission denied for table court_rooms' }).state).toBe('permission-denied');
  });
  it('DB-raised tokens map to precise states', () => {
    expect(classifyRpcError({ message: 'ROOM_NOT_FOUND' }).state).toBe('room-not-found');
    expect(classifyRpcError({ message: 'ROOM_EXPIRED' }).state).toBe('room-expired');
    expect(classifyRpcError({ message: 'ROOM_CLOSED' }).state).toBe('room-closed');
    expect(classifyRpcError({ message: 'COURT_ALREADY_STARTED' }).state).toBe('court-already-started');
    expect(classifyRpcError({ message: 'ROOM_FULL' }).state).toBe('room-full');
    expect(classifyRpcError({ message: 'NAME_REQUIRED' }).state).toBe('name-required');
    expect(classifyRpcError({ message: 'NOT_HOST' }).state).toBe('permission-denied');
  });
  it('network errors → connection-failed (transient)', () => {
    const c = classifyRpcError({ message: 'TypeError: Failed to fetch' });
    expect(c.state).toBe('connection-failed');
    expect(c.transient).toBe(true);
    expect(c.recovery).toBe('reconnect');
  });
  it('unknown → unexpected (transient, try-again)', () => {
    const c = classifyRpcError({ message: 'something weird' });
    expect(c.state).toBe('unexpected');
    expect(c.recovery).toBe('try-again');
  });
  it('every non-ok state carries a non-empty message and a real recovery', () => {
    for (const s of ['room-not-found', 'room-expired', 'room-closed', 'court-already-started', 'room-full', 'migration-missing', 'config-missing', 'permission-denied', 'connection-failed', 'unexpected'] as const) {
      const info = stateInfo(s);
      expect(info.message.length, s).toBeGreaterThan(0);
      expect(info.recovery, s).not.toBe('none');
    }
  });
});

describe('classifyRoomStatus — effective status from court_state', () => {
  it('active statuses are ok', () => {
    expect(classifyRoomStatus('lobby').state).toBe('ok');
    expect(classifyRoomStatus('veto').state).toBe('ok');
    expect(classifyRoomStatus('verdict').state).toBe('ok');
  });
  it('expired/closed map through', () => {
    expect(classifyRoomStatus('expired').state).toBe('room-expired');
    expect(classifyRoomStatus('closed').state).toBe('room-closed');
  });
});
