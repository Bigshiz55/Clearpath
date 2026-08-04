import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — item 5, TV date/time. Source-level on purpose: this
 * component fetches real listings and is gated behind `/app/*`, so a
 * rendered test can't exercise the "now & next" filter meaningfully here.
 *
 * The bug: `nowMin` was computed once (empty `useMemo` deps, so it froze at
 * mount and never advanced) from the VIEWER's own `new Date().getHours()`,
 * then compared against `a.minutes` — minutes-past-midnight in the
 * NETWORK's local time (see onTv.ts). Any viewer outside that network zone
 * got a "now & next" list that was silently off by their offset from it,
 * and it drifted further wrong the longer the tab stayed open.
 */
describe('OnTvGuide "now & next" filter uses the real instant, not a frozen device-local clock', () => {
  const src = read('src/components/OnTvGuide.tsx');

  it('no longer derives "now" from a frozen, viewer-local-only getHours()/getMinutes() read', () => {
    expect(src).not.toMatch(/const nowMin = useMemo\(/);
    expect(src).not.toMatch(/d\.getHours\(\) \* 60 \+ d\.getMinutes\(\)/);
  });

  it('the now&next filter compares the real UTC instant via stillJoinable, not network-local minutes against device-local minutes', () => {
    expect(src).toMatch(/time === 'nownext'\)\s*list = list\.filter\(\(a\) => stillJoinable\(a\.airstamp, a\.runtime, nowMs\)\)/);
  });

  it('the filter is keyed on the ticking nowMs clock (already used by the highlight strip), not a stale one-time value', () => {
    expect(src).toMatch(/\[airings, time, sort, nowMs, streaming, media\]/);
  });
});
