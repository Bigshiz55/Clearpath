import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInterview, advance, type InterviewState, type TasteSignal } from '@/lib/voice/interview';

/**
 * THE TURN + COMPLETE ACTIONS, PINNED (the pure server logic, over a mocked DB).
 *
 *  • The founder gate rejects everyone who is not a founder/admin.
 *  • recordInterviewTurn advances the PURE engine, persists the new state, and
 *    returns { state, directive, done } — the turn counter always moves.
 *  • completeInterview writes the named-title reactions into preference_events
 *    with STABLE ids (the dedupe key), and only re-marks the row complete when it
 *    is not already complete (idempotent).
 */

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'founder@test.com' } as { id: string; email: string } | null,
  state: null as InterviewState | null,
  recordEvents: vi.fn(
    async (_s: unknown, _u: string, _events: Array<{ id: string; source?: string }>) => 1,
  ),
  saveInterview: vi.fn(async (_s: unknown, _state: InterviewState) => undefined),
  getInterview: vi.fn(async (_s?: unknown, _u?: string, _id?: string) => h.state),
  loadActiveInterview: vi.fn(async (_s?: unknown, _u?: string) => h.state),
  abandonInterview: vi.fn(async (_s: unknown, _u: string, _id: string) => undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock('@/lib/preference/store', () => ({ recordEvents: h.recordEvents }));
vi.mock('@/lib/voice/store', () => ({
  saveInterview: h.saveInterview,
  getInterview: h.getInterview,
  loadActiveInterview: h.loadActiveInterview,
  abandonInterview: h.abandonInterview,
}));

const { startOrResumeInterview, recordInterviewTurn, completeInterview, abandonInterview } = await import(
  './voiceInterview'
);

const titleSignal = (over: Partial<TasteSignal> = {}): TasteSignal =>
  ({
    id: 's1',
    turn: 1,
    kind: 'title',
    subject: 'Prisoners',
    sentiment: 'love',
    strength: 0.9,
    categories: [],
    raw: 'I absolutely loved Prisoners',
    ...over,
  }) as TasteSignal;

beforeEach(() => {
  h.user = { id: 'u1', email: 'founder@test.com' };
  process.env.ADMIN_EMAILS = 'founder@test.com';
  h.recordEvents.mockClear();
  h.saveInterview.mockClear();
  h.getInterview.mockClear();
  h.loadActiveInterview.mockClear();
  h.abandonInterview.mockClear();
  h.state = createInterview('u1', 1000);
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe('identity gate', () => {
  it('an ordinary signed-in user is admitted — the interview is not founder-only', async () => {
    h.user = { id: 'u2', email: 'stranger@example.com' };
    const res = await recordInterviewTurn({ interviewId: h.state!.id, signals: [] });
    expect(res.ok).toBe(true);
    expect(h.getInterview).toHaveBeenCalled();
  });

  it('an anonymous guest session is admitted (no email at all)', async () => {
    h.user = { id: 'guest-1', email: '' };
    const res = await startOrResumeInterview();
    expect(res.ok).toBe(true);
  });

  it('unauthenticated is still rejected — writes need an owner', async () => {
    h.user = null;
    const res = await startOrResumeInterview();
    expect(res.ok).toBe(false);
    expect(h.getInterview).not.toHaveBeenCalled();
  });

  it('every read is scoped to the caller, so one user cannot reach another', async () => {
    h.user = { id: 'u2', email: 'stranger@example.com' };
    await recordInterviewTurn({ interviewId: h.state!.id, signals: [] });
    // The store is always asked for THIS user's row, never a bare id lookup.
    expect(h.getInterview).toHaveBeenCalledWith(expect.anything(), 'u2', h.state!.id);
  });
});

describe('startOrResumeInterview', () => {
  it('resumes the active interview when one exists (no fresh row minted)', async () => {
    const res = await startOrResumeInterview();
    expect(res.ok).toBe(true);
    expect(res.state?.id).toBe(h.state!.id);
    expect(res.directive?.action).toBeTruthy();
    // Resume path does not re-save an existing interview.
    expect(h.saveInterview).not.toHaveBeenCalled();
  });

  it('mints and persists a fresh interview when there is none', async () => {
    h.state = null;
    h.loadActiveInterview.mockResolvedValueOnce(null);
    const res = await startOrResumeInterview();
    expect(res.ok).toBe(true);
    expect(res.state?.userId).toBe('u1');
    expect(res.state?.turn).toBe(0);
    expect(h.saveInterview).toHaveBeenCalledTimes(1);
  });
});

describe('recordInterviewTurn', () => {
  it('advances the engine, persists, and returns the next directive + done', async () => {
    const before = h.state!.turn;
    const res = await recordInterviewTurn({ interviewId: h.state!.id, signals: [titleSignal()] });
    expect(res.ok).toBe(true);
    expect(res.state!.turn).toBe(before + 1);
    expect(res.state!.signals.some((s) => s.subject === 'Prisoners')).toBe(true);
    expect(res.directive).toBeTruthy();
    expect(typeof res.done).toBe('boolean');
    // Persisted the ADVANCED state, not the old one.
    expect(h.saveInterview).toHaveBeenCalledTimes(1);
    expect(h.saveInterview.mock.calls[0]![1].turn).toBe(before + 1);
  });

  it('a missing interview returns a clean error, no persist', async () => {
    h.getInterview.mockResolvedValueOnce(null);
    const res = await recordInterviewTurn({ interviewId: 'nope', signals: [] });
    expect(res.ok).toBe(false);
    expect(h.saveInterview).not.toHaveBeenCalled();
  });

  it('over-long signal arrays are rejected by validation', async () => {
    const many = Array.from({ length: 100 }, (_, i) => titleSignal({ id: `s${i}` }));
    const res = await recordInterviewTurn({ interviewId: h.state!.id, signals: many });
    expect(res.ok).toBe(false);
  });

  it('malformed elements are rejected cleanly by validation, never a throw', async () => {
    const junk = [{ nonsense: true }, null, { subject: 42 }] as unknown as TasteSignal[];
    const res = await recordInterviewTurn({ interviewId: h.state!.id, signals: junk });
    expect(res.ok).toBe(false); // zod rejects null / wrong-typed elements at the boundary
    expect(h.saveInterview).not.toHaveBeenCalled();
  });

  it('zod-valid-but-semantically-garbage signals pass through and the engine sanitizes them', async () => {
    // Bogus sentiment/kind + out-of-range strength: shapes zod accepts but the
    // engine coerces/drops. The turn must still advance and never throw.
    const loose = [
      { id: 'x', kind: 'weird', subject: 'thing', sentiment: 'bogus', strength: 5 },
    ] as unknown as TasteSignal[];
    const res = await recordInterviewTurn({ interviewId: h.state!.id, signals: loose });
    expect(res.ok).toBe(true);
    expect(res.state!.turn).toBe(1);
  });
});

describe('completeInterview', () => {
  beforeEach(() => {
    // A state that has a graded title reaction → produces a preference event.
    h.state = advance(createInterview('u1', 1000), [titleSignal()], 2000);
  });

  it('builds the reveal and writes stable-id events into the preference log', async () => {
    const res = await completeInterview({ interviewId: h.state!.id });
    expect(res.ok).toBe(true);
    expect(res.reveal).toBeTruthy();
    expect(h.recordEvents).toHaveBeenCalledTimes(1);
    const drafts = h.recordEvents.mock.calls[0]![2];
    expect(drafts.length).toBeGreaterThan(0);
    // Stable id = the dedupe key that makes completing twice safe.
    expect(drafts[0]!.id).toMatch(/^voice:/);
    expect(drafts[0]!.source).toBe('voice_interview');
    // Marked the row complete (was active).
    expect(h.saveInterview).toHaveBeenCalledTimes(1);
    expect(h.saveInterview.mock.calls[0]![1].status).toBe('complete');
  });

  it('completing an already-complete interview does not re-mark the row', async () => {
    h.state = { ...h.state!, status: 'complete' };
    const res = await completeInterview({ interviewId: h.state.id });
    expect(res.ok).toBe(true);
    // recordEvents may run again (DB dedups by id); the status write must not.
    expect(h.saveInterview).not.toHaveBeenCalled();
  });

  it('produces no events (but still a reveal) when nothing actionable was said', async () => {
    h.state = createInterview('u1', 1000); // no signals
    const res = await completeInterview({ interviewId: h.state.id });
    expect(res.ok).toBe(true);
    expect(res.reveal).toBeTruthy();
    expect(h.recordEvents).not.toHaveBeenCalled();
  });
});

describe('abandonInterview', () => {
  it('marks the interview abandoned via the store', async () => {
    const res = await abandonInterview({ interviewId: h.state!.id });
    expect(res.ok).toBe(true);
    expect(h.abandonInterview).toHaveBeenCalledWith(expect.anything(), 'u1', h.state!.id);
  });
});
