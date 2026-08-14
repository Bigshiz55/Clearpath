/**
 * THE FIRST-RUN TASTE DNA FLOW — order and controls, pinned at the source.
 *
 * Owner-stated fresh-user order: 1. GENRE CALIBRATION, 2. QUICK TASTE QUIZ —
 * with the showdown/pairwise experience demoted from the front of the line
 * (not deleted; it remains a trainer among trainers). Source-level for the
 * same reason quizReachable.test.ts is: `/app/*` sits behind auth, so a
 * browser test would assert against a login screen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('fresh-user order: genres first, titles second', () => {
  const page = read('src/app/app/taste-quiz/page.tsx');

  it('the quiz page fronts GenreCalibration for a user who has never answered a genre', () => {
    expect(page).toContain('GenreCalibration');
    expect(page).toContain("eq('source', 'genre-calibration')");
    // The gate fails OPEN to the titles grid — a log read hiccup must leave
    // the long-standing quiz working exactly as before.
    expect(page).toMatch(/catch\s*\{\s*showGenres = false/);
  });

  it('step two is the existing titles grid, reachable explicitly', () => {
    expect(page).toContain('TitleGridCalibration');
    expect(page).toContain("step=titles");
  });

  it('a founder session survives both steps', () => {
    expect(page).toContain('sessionId={sessionId}');
    expect(page).toMatch(/session=\$\{encodeURIComponent\(sessionId\)\}/);
  });
});

describe('the genre step is canonical, optional, and writes through the one action', () => {
  const cmp = read('src/components/onboarding/GenreCalibration.tsx');

  it('renders only the canonical vocabulary', () => {
    expect(cmp).toContain('CALIBRATION_GENRES');
    expect(cmp).not.toMatch(/const\s+GENRES\s*=\s*\[/); // no private genre list
  });

  it('nothing is required — continue is always available and silence writes nothing', () => {
    expect(cmp).toContain('genre-continue');
    expect(cmp).toContain('skip the rest');
  });

  it('every answer goes through recordGenreAnswer (the real event log)', () => {
    expect(cmp).toContain('recordGenreAnswer');
    expect(cmp).not.toContain('localStorage'); // preferences are DNA, not device flags
  });

  it('the rating row disables under a rule-out, and controls expose their states', () => {
    expect(cmp).toContain('disabled={out}');
    expect(cmp).toContain('aria-pressed');
    expect(cmp).toContain('focus-visible:outline');
  });
});

describe('the Quick Taste Quiz controls are labeled, not emoji-first', () => {
  const grid = read('src/components/TitleGridCalibration.tsx');

  it('rating chips render the label as visible text with the emoji as a supporting icon', () => {
    expect(grid).toContain('<span aria-hidden>{r.emoji}</span> {r.label}');
    // The emoji-only chip (label hidden in a tooltip) must not return.
    expect(grid).not.toMatch(/title=\{r\.label\}\s*>\s*\{r\.emoji\}/);
  });

  it('semantic values are untouched — same four ratings, same keys', () => {
    for (const key of ["'loved'", "'liked'", "'okay'", "'disliked'"]) {
      expect(grid).toContain(key);
    }
  });

  it('selected state is real (aria-pressed), not only color', () => {
    const chips = grid.slice(grid.indexOf('grid-ratings-'), grid.indexOf('grid-seen-'));
    expect(chips).toContain('aria-pressed={selected}');
  });
});

describe('showdown is demoted from the front of the line, not deleted', () => {
  it('the DNA hub lists the Taste Quiz before Showdown', () => {
    const hub = read('src/app/app/dna/page.tsx');
    const quizAt = hub.indexOf('data-testid="link-taste-quiz"');
    const showdownAt = hub.indexOf('data-testid="link-showdown"');
    expect(quizAt).toBeGreaterThan(-1);
    expect(showdownAt).toBeGreaterThan(-1);
    expect(quizAt).toBeLessThan(showdownAt);
  });
});
