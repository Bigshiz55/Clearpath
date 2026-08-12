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

describe('Browse fetches every column its own filter reads', () => {
  const lib = read('src/lib/packs/checklist.ts');
  const fn = lib.slice(lib.indexOf('async function loadProgrammes'), lib.indexOf('async function seenSet'));

  it('selects the evidence columns, not just the display ones', () => {
    /* THE SILENT DEFECT. `tmdb_media_type` was declared optional on the row
       interface and never selected, so Browse read it as null on every row
       forever and the Movie Vault would have rejected 100% of its programmes
       even in a perfectly matched database. An absent optional property is a
       legal value, so the compiler had nothing to say. */
    const columns = read('src/lib/packs/checklist.ts');
    for (const col of ['tmdb_media_type', 'programme_type', 'season_number', 'episode_number']) {
      expect(columns, `PROGRAMME_COLUMNS omits ${col}`).toMatch(
        new RegExp(`PROGRAMME_COLUMNS[\\s\\S]{0,300}${col}`),
      );
    }
    expect(fn).toContain('PROGRAMME_COLUMNS');
  });

  it('passes that evidence to the filter rather than dropping it', () => {
    const browse = lib.slice(lib.indexOf('export async function listPackBrowse'));
    for (const field of ['programmeType', 'seasonNumber', 'episodeNumber']) {
      expect(browse, `browse does not pass ${field} to eligibility`).toContain(field);
    }
  });
});

describe('a filtered-empty Pack does not blame the listings feed', () => {
  const ui = read('src/components/packs/ChecklistSection.tsx');

  it('distinguishes "nothing arrived" from "nothing qualified"', () => {
    /* Two opposite causes with opposite fixes. Telling a user the feed carried
       nothing, when it carried twenty programmes we could not confirm, is a
       false statement about our own data. */
    expect(ui).toContain('rejected >= examined');
    expect(ui).toMatch(/hasn.t carried any programmes/);
    expect(ui).toContain('could be confirmed as what this Pack is for');
  });

  it('does not fall back to showing the rejected rows', () => {
    // "Show them anyway rather than look empty" is how Castle got back in.
    const branch = ui.slice(ui.indexOf('rejected >= examined'), ui.indexOf('No titles from this Pack'));
    expect(branch).not.toContain('PackTitleList');
  });
});
