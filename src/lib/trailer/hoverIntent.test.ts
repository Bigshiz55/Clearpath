import { describe, it, expect, vi } from 'vitest';
import { createHoverIntent, hoverPreviewAllowed, HOVER_INTENT_MS, type HoverGate } from './hoverIntent';

/**
 * The dwell and the gate are the two places a hover preview can go wrong in a
 * way no screenshot shows: firing for a finger, or firing for a pointer that
 * was only passing through. Both are pure here, so both are proved here.
 */

const mouse: HoverGate = {
  pointerType: 'mouse',
  hoverCapable: true,
  reducedMotion: false,
  autoplayPref: 'on',
};

describe('hoverPreviewAllowed', () => {
  it('allows a real mouse on a hover-capable device', () => {
    expect(hoverPreviewAllowed(mouse)).toBe(true);
  });

  it('never previews for touch — a tap must open More Info, not a trailer', () => {
    expect(hoverPreviewAllowed({ ...mouse, pointerType: 'touch' })).toBe(false);
  });

  it('never previews for pen', () => {
    expect(hoverPreviewAllowed({ ...mouse, pointerType: 'pen' })).toBe(false);
  });

  it('never previews on a device that cannot hover, even with a mouse pointer type', () => {
    expect(hoverPreviewAllowed({ ...mouse, hoverCapable: false })).toBe(false);
  });

  it('respects prefers-reduced-motion', () => {
    expect(hoverPreviewAllowed({ ...mouse, reducedMotion: true })).toBe(false);
  });

  it('respects the user turning autoplay off', () => {
    expect(hoverPreviewAllowed({ ...mouse, autoplayPref: 'off' })).toBe(false);
  });
});

/** A hand-driven clock, so no test sleeps. */
function fakeTimers() {
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; at: number }>();
  let now = 0;
  return {
    schedule: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, { fn, at: now + ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (id: ReturnType<typeof setTimeout>) => {
      pending.delete(id as unknown as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending.entries()]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

describe('createHoverIntent', () => {
  it('does not fire before the intent threshold', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    intent.enter();
    clock.advance(HOVER_INTENT_MS - 1);
    expect(onFire).not.toHaveBeenCalled();
    expect(intent.armed).toBe(true);
  });

  it('fires once after an uninterrupted dwell', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    intent.enter();
    clock.advance(HOVER_INTENT_MS);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(intent.previewing).toBe(true);
    expect(intent.armed).toBe(false);
  });

  it('leaving before the threshold fires nothing at all', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    intent.enter();
    clock.advance(200);
    intent.leave();
    clock.advance(10_000);
    expect(onFire).not.toHaveBeenCalled();
    expect(clock.pendingCount).toBe(0);
  });

  it('JITTER: repeated enters inside the poster arm exactly one dwell', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    for (let i = 0; i < 20; i++) intent.enter();
    expect(clock.pendingCount).toBe(1);
    clock.advance(HOVER_INTENT_MS);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('JITTER: entering again while previewing does not restart playback', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    intent.enter();
    clock.advance(HOVER_INTENT_MS);
    expect(onFire).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) intent.enter();
    clock.advance(10_000);
    expect(onFire, 'the preview restarted from a pointer wobble').toHaveBeenCalledTimes(1);
  });

  it('a fresh hover after leaving does preview again', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    intent.enter();
    clock.advance(HOVER_INTENT_MS);
    intent.leave();
    expect(intent.previewing).toBe(false);

    intent.enter();
    clock.advance(HOVER_INTENT_MS);
    expect(onFire).toHaveBeenCalledTimes(2);
  });

  it('UNMOUNT: dispose cancels a pending dwell and it can never fire later', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    intent.enter();
    intent.dispose();
    clock.advance(10_000);
    expect(onFire).not.toHaveBeenCalled();
    expect(clock.pendingCount).toBe(0);
  });

  it('UNMOUNT: a disposed intent stays inert even if entered again', () => {
    const clock = fakeTimers();
    const onFire = vi.fn();
    const intent = createHoverIntent({ onFire, schedule: clock.schedule, cancel: clock.cancel });

    intent.dispose();
    intent.enter();
    clock.advance(10_000);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('the default threshold sits inside the 300–500ms window', () => {
    expect(HOVER_INTENT_MS).toBeGreaterThanOrEqual(300);
    expect(HOVER_INTENT_MS).toBeLessThanOrEqual(500);
  });
});
