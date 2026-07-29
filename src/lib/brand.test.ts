/**
 * ONE BRAND, EVERYWHERE.
 *
 * The product shipped with four spellings of its own name — "WatchVerdict",
 * "Watch Verdict", "WatchVerd1ct" and bare "VERD1CT" — mixed across page
 * titles, metadata, toasts, share sheets and auth screens. A product that
 * cannot spell its own name consistently reads as unfinished, whatever else it
 * does well.
 *
 * The official presentation is **WatchVerd1ct** (the numeral is the mark, and
 * `WatchVerdictWordmark` renders it with the styled "1"). This test is the
 * guard: it reads the real source and fails if a second spelling reappears.
 *
 * TWO DELIBERATE EXCEPTIONS, both narrow and both asserted below:
 *   • Code identifiers — `WatchVerdictWordmark`, `WatchVerdictLogo` — because
 *     a numeral cannot start an identifier segment cleanly and renaming a
 *     shared component is churn with no user-visible benefit.
 *   • The wordmark's `aria-label` — a screen reader must say "Watch Verdict",
 *     not "Watch Verd one ct".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Occurrences of the off-brand spelling that are NOT one of the two
 *  sanctioned exceptions. */
function offBrandHits(): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(ROOT.length + 1);
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        if (!/WatchVerdict|Watch Verdict/.test(text)) return;
        // Exception 1: code identifiers.
        if (/WatchVerdictWordmark|WatchVerdictLogo/.test(text)) return;
        // Exception 2: the accessible name of the wordmark.
        if (/aria-label/.test(text)) return;
        hits.push({ file: rel, line: i + 1, text: text.trim() });
      });
  }
  return hits;
}

describe('the product spells its own name one way', () => {
  it('no source file carries an off-brand spelling', () => {
    const hits = offBrandHits();
    expect(
      hits,
      `off-brand spellings:\n${hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n')}`,
    ).toEqual([]);
  });

  it('the site metadata uses the official brand', () => {
    const layout = readFileSync(join(SRC, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('WatchVerd1ct');
    expect(layout).not.toMatch(/WatchVerdict|Watch Verdict/);
  });

  it('the wordmark still announces a pronounceable name to screen readers', () => {
    const wordmark = readFileSync(join(SRC, 'components', 'WatchVerdictWordmark.tsx'), 'utf8');
    expect(wordmark).toMatch(/aria-label="Watch\s?Verdict"/);
  });
});
