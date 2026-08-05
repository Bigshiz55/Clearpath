import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Browse, My Checklist and Watched must stay three different questions.
 * The failure this guards is subtle and was shipped once already: a filter
 * labelled "Want to watch" that actually meant "not marked seen", asserting
 * an intention the user never expressed over a list they never chose.
 */
describe('the three questions stay separate', () => {
  const lib = read('src/lib/packs/checklist.ts');

  it('My Checklist reads pack_list_items — never the schedule', () => {
    const fn = lib.slice(lib.indexOf('export async function listMyChecklist'));
    expect(fn).toContain("from('pack_list_items')");
    expect(fn).not.toContain("from('tv_airings')");
  });

  it('Browse reads the schedule and is not personal', () => {
    const fn = lib.slice(lib.indexOf('export async function listPackBrowse'), lib.indexOf('export async function listMyChecklist'));
    expect(fn).toContain("from('tv_airings')");
  });

  it('Watched comes only from explicit seen marks', () => {
    expect(lib).toContain("from('user_seen_programmes')");
  });

  it('no shipped UI turns "not watched" into "want to watch"', () => {
    // The old ChecklistView did exactly this and survived the rewrite as dead
    // code reachable from the dev harness. It is gone; this keeps it gone.
    expect(existsSync(join(process.cwd(), 'src/components/packs/ChecklistView.tsx'))).toBe(false);
    for (const f of ['src/components/packs/PackTitleList.tsx', 'src/components/packs/ChecklistSection.tsx']) {
      expect(strip(read(f)), f).not.toMatch(/>\s*Want to watch\s*</);
    }
  });

  it('the browse filters name facts the user created', () => {
    const ui = read('src/components/packs/PackTitleList.tsx');
    expect(ui).toContain('On my list');
    expect(ui).toContain('Watched');
    expect(ui).toContain('Not watched');
  });
});
