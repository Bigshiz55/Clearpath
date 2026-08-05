import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE ADAPTER CONTRACT, ENFORCED BY READING THE SOURCE.
 *
 * Every adapter that can reach the network must ask `requestEgress` before it
 * does, and must ask it BEFORE the first `fetch(` in the file — a gate placed
 * after the request it is meant to prevent is decoration.
 *
 * This is a source-text test on purpose. The alternative — asserting behaviour
 * per adapter — only covers adapters that exist today, and the failure this
 * guards against is precisely the NEXT adapter, written by someone who did not
 * read dataMode.ts. A new file in this directory that calls `fetch` and skips
 * the door fails here on the day it is added, not on the day the bill arrives.
 *
 * The escape hatch is deliberate and narrow: declare `EGRESS_EXEMPT` with a
 * written reason. `mock.ts` uses it because its "fetch" is a generator that
 * never leaves the process.
 */

const DIR = join(process.cwd(), 'src/lib/viewing/adapters');

const adapterFiles = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

/** Files that actually construct a network request. */
function callsFetch(src: string): boolean {
  // `await fetch(` / `= fetch(` / ` fetch(` — but not `.fetch(` (a method call
  // on an adapter instance) and not the adapter's own `async fetch(` decl.
  return /(?<![.\w])fetch\(/.test(src.replace(/async\s+fetch\(/g, 'async ADAPTER_METHOD('));
}

describe('every network adapter goes through the egress guard', () => {
  it('finds the adapters, so a rename cannot silently empty this suite', () => {
    expect(adapterFiles.length).toBeGreaterThanOrEqual(4);
    expect(adapterFiles).toContain('tvMedia.ts');
    expect(adapterFiles).toContain('tvmaze.ts');
    expect(adapterFiles).toContain('schedulesDirect.ts');
  });

  for (const file of adapterFiles) {
    const src = readFileSync(join(DIR, file), 'utf8');
    if (!callsFetch(src)) continue;

    if (src.includes('EGRESS_EXEMPT')) {
      it(`${file} declares a written reason for its exemption`, () => {
        const line = src.split('\n').find((l) => l.includes('EGRESS_EXEMPT')) ?? '';
        expect(line.length).toBeGreaterThan('EGRESS_EXEMPT'.length + 20);
      });
      continue;
    }

    it(`${file} imports requestEgress`, () => {
      expect(src).toMatch(/import\s*\{[^}]*requestEgress[^}]*\}\s*from\s*['"]@\/lib\/tv\/egressGuard['"]/);
    });

    it(`${file} asks the door at the very top of its public entry point`, () => {
      // Checking "gate before first fetch in the FILE" is wrong: private
      // helpers (SchedulesDirect's `token()`) are declared above the public
      // entry but only reachable through it, so textual order says nothing.
      //
      // The property that actually holds is stronger and easier to check:
      // inside `async fetch(...)`, the gate comes before ANY outbound fetch
      // AND before any `this.` helper call. Nothing the entry point can do
      // reaches the network without passing it first.
      const entry = src.slice(src.indexOf('async fetch('));
      expect(entry, 'no public async fetch( entry point').not.toBe('');

      const body = entry.replace(/^async\s+fetch\(/, 'async ADAPTER_METHOD(');
      const gate = body.indexOf('requestEgress({');
      expect(gate, 'requestEgress({ ... }) not called in the entry point').toBeGreaterThan(-1);

      const outbound = body.search(/(?<![.\w])fetch\(/);
      if (outbound > -1) expect(gate).toBeLessThan(outbound);

      const helper = body.search(/this\.\w+\(/);
      if (helper > -1) expect(gate).toBeLessThan(helper);
    });

    it(`${file} refuses rather than proceeding when denied`, () => {
      // A gate whose result is never read is not a gate.
      expect(src).toMatch(/if\s*\(!\s*gate\.allowed\s*\)/);
    });
  }
});

describe('the stubbed-transport seam stays inside tests', () => {
  it('is referenced by no non-test source file', () => {
    // `__stubTransportForTest` makes the guard say yes. That is correct for a
    // suite that has replaced global.fetch, and a hole anywhere else — so the
    // only place it may appear outside its own declaration is a *.test.ts.
    const roots = ['src', 'scripts', 'eval'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      let entries: ReturnType<typeof readdirSync>;
      try { entries = readdirSync(dir, { withFileTypes: true }) as never; } catch { return; }
      for (const e of entries as unknown as Array<{ name: string; isDirectory(): boolean }>) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.tsx')) continue;
        // Its own declaration is the one legitimate non-test mention.
        if (p.endsWith(join('src', 'lib', 'tv', 'egressGuard.ts'))) continue;
        if (readFileSync(p, 'utf8').includes('__stubTransportForTest')) offenders.push(p);
      }
    };
    for (const r of roots) walk(join(process.cwd(), r));
    expect(offenders).toEqual([]);
  });
});

describe('adapter cost classes are declared honestly', () => {
  it('TV Media is metered — it is the only one that bills', () => {
    const src = readFileSync(join(DIR, 'tvMedia.ts'), 'utf8');
    expect(src).toContain("cost: 'metered'");
    expect(src).not.toContain("cost: 'free'");
  });

  it.each(['tvmaze.ts', 'schedulesDirect.ts'])('%s is free', (file) => {
    const src = readFileSync(join(DIR, file), 'utf8');
    expect(src).toContain("cost: 'free'");
    expect(src).not.toContain("cost: 'metered'");
  });
});
