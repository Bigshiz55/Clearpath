/**
 * RAPID FIRE'S PREMIUM REDESIGN, pinned at source so a later edit can't quietly
 * bring back the control-panel look. Behavior is covered elsewhere
 * (rapidFire.test.ts, quizPayoff.test.ts, tests/mobile/rapid-fire.spec.ts);
 * this guards the LOOK the redesign committed to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'RapidFire.tsx'), 'utf8');

describe('the cinematic palette holds', () => {
  it('carries no hard-coded magenta — the brand blue is the only accent', () => {
    expect(SRC).not.toMatch(/ff1493|ff62b6/i);
    // Progress + eyebrow moved to the brand token.
    expect(SRC).toMatch(/from-brand-500 to-brand-300/);
    expect(SRC).toMatch(/text-brand-300/);
  });
});

describe('the decision is the focal point, escapes are secondary', () => {
  it('splits the two escape hatches into their own quiet row', () => {
    expect(SRC).toMatch(/const opinions = options\.slice\(0, -2\)/);
    expect(SRC).toMatch(/const escapes = options\.slice\(-2\)/);
  });

  it('renders escape hatches as quiet text, not equal-weight tiles', () => {
    // The escapes map uses a muted text-slate style, not the bordered TONE tile.
    const escapesBlock = /escapes\.map\(\(o\) => \([\s\S]*?\)\)/.exec(SRC)?.[0] ?? '';
    expect(escapesBlock).toMatch(/text-slate-400/);
    expect(escapesBlock).not.toMatch(/border-2/);
    // Still a real 44px tap target — a quiet control is not an unusable one.
    expect(escapesBlock).toMatch(/min-h-\[44px\]/);
  });
});

describe('the exit no longer outshouts the task', () => {
  it('Stop here is a quiet text button, not a heavy gradient', () => {
    const stop = /data-testid="rapid-stop"[\s\S]*?<\/button>/.exec(SRC)?.[0] ?? '';
    expect(stop).toMatch(/text-slate-400/);
    expect(stop).not.toMatch(/gradient|font-black/);
  });

  it('the redundant 1–6 number hints are gone (keyboard support stays)', () => {
    expect(SRC).not.toMatch(/hidden text-\[10px\] opacity-50 sm:inline/);
    expect(SRC).toMatch(/window\.addEventListener\('keydown'/); // keyboard still works
  });
});
