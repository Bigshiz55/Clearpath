/**
 * RAPID FIRE'S NO-SKIP CONTRACT, pinned at source.
 *
 * The interaction bug: one tap recorded an answer AND advanced with no
 * re-entrancy guard, so a fast double-tap (or a tap landing as the next card
 * faded in) answered two consecutive titles from a single gesture — skipping
 * the one in between. The fix is a `locked` gate that makes the decision inert
 * until the next card has settled.
 *
 * The behavioral proof (a real double-tap producing exactly one advance) lives
 * in the browser at tests/mobile/rapid-fire.spec.ts, which is the only place a
 * genuine tap can be simulated. This node-env pin guards that the guard itself
 * cannot be quietly deleted: without these lines the skip returns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'RapidFire.tsx'), 'utf8');

describe('the no-skip re-entrancy lock holds', () => {
  it('the guard is a REF, read synchronously so a same-tick double-fire is caught', () => {
    // A useState lock is captured per-render: two clicks in one tick both read
    // the stale `false`. A ref updates immediately, so the second call returns.
    expect(SRC).toMatch(/const busyRef = useRef\(false\)/);
    expect(SRC).toMatch(/if \(busyRef\.current \|\| !item\) return;/);
    expect(SRC).toMatch(/busyRef\.current = true;/);
  });

  it('the lock is released only after the index advances (a settle beat)', () => {
    // An effect keyed on the index clears the ref after the fade, so the tap
    // that answered a card cannot fall through onto the next one.
    expect(SRC).toMatch(/busyRef\.current = false;/);
    expect(SRC).toMatch(/setLocked\(false\);/);
    expect(SRC).toMatch(/\}, \[index, locked\]\);/);
  });

  it('the decision card is inert while locked', () => {
    expect(SRC).toMatch(/aria-busy=\{locked\}/);
    expect(SRC).toMatch(/locked \? 'pointer-events-none' : ''/);
  });

  it('every answer path routes through the guarded answer()', () => {
    // Tap tiles and the 1–6 keyboard handler both call answer(), so the lock
    // covers keyboard-repeat as well as double-tap.
    expect(SRC).toMatch(/onClick=\{\(\) => answer\(o\.key\)\}/);
    expect(SRC).toMatch(/answer\(options\[n - 1\]!\.key\)/);
  });
});
