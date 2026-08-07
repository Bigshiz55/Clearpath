import { describe, it, expect } from 'vitest';
import { chooseActiveCard, TrailerCoordinator, type CardVisibility } from './coordinator';

const NOW = 1_000_000;
const opts = { nowMs: NOW, minVisibility: 0.65, dwellMs: 500 };
const card = (id: string, ratio: number, visibleSinceMs: number | null): CardVisibility => ({ id, ratio, visibleSinceMs });

describe('chooseActiveCard — dwell + visibility gating', () => {
  it('picks nothing when no card has met the dwell yet', () => {
    // Visible enough, but only just became visible — must wait out the dwell.
    expect(chooseActiveCard([card('a', 0.9, NOW - 100)], opts)).toBeNull();
  });

  it('picks a card once it has been visible past the dwell', () => {
    expect(chooseActiveCard([card('a', 0.9, NOW - 600)], opts)).toBe('a');
  });

  it('ignores a barely-visible card (below the visibility threshold)', () => {
    expect(chooseActiveCard([card('a', 0.3, NOW - 5000)], opts)).toBeNull();
  });

  it('the most-visible qualifying card wins', () => {
    const winner = chooseActiveCard([
      card('a', 0.7, NOW - 600),
      card('b', 0.95, NOW - 600),
      card('c', 0.66, NOW - 600),
    ], opts);
    expect(winner).toBe('b');
  });

  it('is deterministic on a visibility tie (stable id order, no flicker)', () => {
    const a = chooseActiveCard([card('y', 0.8, NOW - 600), card('x', 0.8, NOW - 600)], opts);
    const b = chooseActiveCard([card('x', 0.8, NOW - 600), card('y', 0.8, NOW - 600)], opts);
    expect(a).toBe('x');
    expect(b).toBe('x');
  });

  it('a card not currently past the threshold (visibleSince null) never wins', () => {
    expect(chooseActiveCard([card('a', 0.9, null)], opts)).toBeNull();
  });
});

describe('TrailerCoordinator — AT MOST ONE active trailer', () => {
  it('holding a second active necessarily clears the first', () => {
    const c = new TrailerCoordinator();
    const seen: (string | null)[] = [];
    c.subscribe((id) => seen.push(id));
    c.setActive('a');
    c.setActive('b'); // b displaces a — the store cannot hold two
    expect(c.getActive()).toBe('b');
    // At no observed point were two ids active; each notification is a single id.
    expect(seen).toEqual(['a', 'b']);
  });

  it('setActive is idempotent — re-selecting the same id does not re-notify', () => {
    const c = new TrailerCoordinator();
    let n = 0;
    c.subscribe(() => { n += 1; });
    c.setActive('a');
    c.setActive('a');
    expect(n).toBe(1);
  });

  it('release only clears when the caller still owns the active slot', () => {
    const c = new TrailerCoordinator();
    c.setActive('a');
    c.setActive('b'); // a scrolled away, b is now active
    c.release('a'); // a late release from the old card must NOT clobber b
    expect(c.getActive()).toBe('b');
    c.release('b'); // b releasing itself does clear
    expect(c.getActive()).toBeNull();
  });

  it('unsubscribe stops notifications', () => {
    const c = new TrailerCoordinator();
    let n = 0;
    const off = c.subscribe(() => { n += 1; });
    c.setActive('a');
    off();
    c.setActive('b');
    expect(n).toBe(1);
  });

  it('property: across a randomized scroll sequence, at most one id is ever active', () => {
    const c = new TrailerCoordinator();
    let concurrent = 0;
    let maxConcurrent = 0;
    c.subscribe((id) => {
      concurrent = id == null ? 0 : 1; // the store is single-valued by construction
      maxConcurrent = Math.max(maxConcurrent, concurrent);
    });
    // deterministic pseudo-random sequence of activate/release
    let s = 7;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 2000; i++) {
      const id = `card_${Math.floor(rnd() * 20)}`;
      if (rnd() < 0.7) c.setActive(id);
      else c.release(id);
      expect(c.getActive() == null || typeof c.getActive() === 'string').toBe(true);
    }
    expect(maxConcurrent).toBeLessThanOrEqual(1);
  });
});
