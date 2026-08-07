import { describe, it, expect, vi } from 'vitest';
import { isolateRun, type IsolatedFailure } from './scheduledIngest';

/**
 * PROPERTY: one source's HARD failure never propagates — it is contained to a
 * structured `failed` result so the sibling provider still runs. Before this,
 * a thrown error inside the TVmaze writer escaped `runGatedTvIngest` and TV
 * Media never ran at all; this guards the containment primitive that fixes it.
 */
describe('isolateRun — per-source failure containment', () => {
  it('a throwing run resolves to a structured failure instead of rejecting', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = (await isolateRun('tvmaze', async () => {
      throw new Error('DB write blew up');
    })) as IsolatedFailure;
    expect(res.ok).toBe(false);
    expect(res.ran).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.provider).toBe('tvmaze');
    expect(res.reason).toContain('DB write blew up');
    spy.mockRestore();
  });

  it('a successful run passes its value straight through, untouched', async () => {
    const res = await isolateRun('tv_media', async () => ({ ok: true, ran: true, marker: 42 }));
    expect(res).toEqual({ ok: true, ran: true, marker: 42 });
  });

  it('sequencing two isolated runs: the first throwing does not stop the second', async () => {
    const order: string[] = [];
    const a = await isolateRun('tvmaze', async () => {
      order.push('a-start');
      throw new Error('boom');
    }).then((r) => { order.push('a-done'); return r; });
    const b = await isolateRun('tv_media', async () => {
      order.push('b-start');
      return { ok: true, ran: true };
    }).then((r) => { order.push('b-done'); return r; });

    expect((a as IsolatedFailure).status).toBe('failed');
    expect((b as { ran: boolean }).ran).toBe(true);
    // Both ran; the throw in A did not prevent B.
    expect(order).toEqual(['a-start', 'a-done', 'b-start', 'b-done']);
  });
});
