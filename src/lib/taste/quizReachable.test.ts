/**
 * THE QUIZ HAS TO BE REACHABLE.
 *
 * A route nobody links to is not a feature. The previous version of this work
 * shipped a whole interview behind a URL with no entry point anywhere in the
 * product, and nobody noticed until it was asked for by hand — so the entry
 * points are pinned here rather than trusted.
 *
 * Source-level on purpose: `/app/*` redirects to the login page without a
 * session, so a browser test asserting "the DNA hub links to the quiz" would
 * pass against a login screen and prove nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const QUIZ_HREF = '/app/taste-quiz';

describe('entry points', () => {
  it('the route exists and renders the quiz', () => {
    const page = read('src/app/app/taste-quiz/page.tsx');
    expect(page).toContain('QuickTasteQuiz');
    expect(page).toContain("title: 'Taste Quiz");
  });

  it('the landing hero offers exactly two calls to action', () => {
    const page = read('src/app/page.tsx');
    const heroBlock = page.slice(page.indexOf('data-testid="hero-ctas"'), page.indexOf('data-testid="cta-import"'));
    const buttons = heroBlock.match(/btn-primary|btn-secondary/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(page).toContain('data-testid="cta-find"');
    expect(page).toContain('data-testid="cta-dna"');
    expect(page).toContain(QUIZ_HREF);
  });

  it('import history is a supporting link, not a third hero button', () => {
    const page = read('src/app/page.tsx');
    const at = page.indexOf('data-testid="cta-import"');
    const link = page.slice(page.lastIndexOf('<Link', at), page.indexOf('</Link>', at));
    expect(link).not.toContain('btn-primary');
    expect(link).not.toContain('btn-secondary');
    expect(link).toContain('/import-taste');
  });

  it('the Build my Watch DNA call to action adapts to how much DNA there is', () => {
    const page = read('src/app/page.tsx');
    expect(page).toContain('DNA_CTA');
    for (const stage of ['none', 'started', 'developed']) {
      expect(page).toContain(`${stage}:`);
    }
  });

  it('the DNA hub offers three ways in', () => {
    const hub = read('src/app/app/dna/page.tsx');
    expect(hub).toContain('data-testid="link-taste-quiz"');
    expect(hub).toContain('data-testid="link-title-quiz"');
    expect(hub).toContain('data-testid="link-import-taste"');
    expect(hub).toContain(QUIZ_HREF);
  });

  it('both quiz lanes live under the one Taste Quiz route', () => {
    const page = read('src/app/app/taste-quiz/page.tsx');
    expect(page).toContain('QuickTasteQuiz');
    expect(page).toContain('TitleGridCalibration');
    expect(page).toContain('TasteQuizModes');

    // Nothing may link at a second copy of the title quiz.
    const hub = read('src/app/app/dna/page.tsx');
    expect(hub).not.toMatch(/href="\/app\/quiz"/);
  });

  it('the old title-quiz URL forwards instead of holding a second copy', () => {
    const legacy = read('src/app/app/quiz/page.tsx');
    expect(legacy).toContain('redirect(');
    expect(legacy).toContain("mode: 'titles'");
    // A founder session must survive the hop, or isolated calibration breaks.
    expect(legacy).toContain('session');
  });

  it('the title lane never turns "never heard of it" into a dislike', () => {
    const grid = read('src/components/TitleGridCalibration.tsx');
    // Untouched tiles must send nothing at all. A negative attraction from this
    // surface would be a preference the user never stated.
    expect(grid).toContain('if (!pick) return []');
    expect(grid).not.toMatch(/attraction:\s*'not_interested'/);
    expect(grid).not.toMatch(/attraction:\s*'absolutely_not'/);
    expect(grid).toContain('not recognising something is not a dislike');
  });

  it('the nav carries the quiz', () => {
    expect(read('src/components/Nav.tsx')).toContain(QUIZ_HREF);
  });
});

describe('honesty and safety', () => {
  it('never hard-codes the response weights in the UI', () => {
    const ui = read('src/components/QuickTasteQuiz.tsx');
    expect(ui).toContain('RESPONSE_VALUES');
    // The four prices live in the model. Finding them written out in a
    // component means the two can drift apart.
    expect(ui).not.toMatch(/[^.\w]0\.75\b/);
    expect(ui).not.toMatch(/[^.\w]0\.6\b/);
  });

  it('shows coverage and confidence as two separate numbers', () => {
    const ui = read('src/components/QuickTasteQuiz.tsx');
    expect(ui).toContain('testid="dna-coverage"');
    expect(ui).toContain('testid="dna-confidence"');
    expect(ui).toContain('data-testid={testid}');
    expect(ui).toContain('how much of you I have asked about');
  });

  it('keeps the "Depends" clarifier inline — no modal, no second screen', () => {
    const ui = read('src/components/QuickTasteQuiz.tsx');
    expect(ui).not.toMatch(/<dialog|role="dialog"|Modal/);
  });

  it('does not log the answers', () => {
    const action = read('src/lib/actions/tasteQuiz.ts');
    expect(action).not.toMatch(/console\.(log|info)\(/);
    // The one warning that exists must not carry the answers with it.
    const warns = action.match(/console\.warn\([^)]*\)/g) ?? [];
    for (const w of warns) {
      expect(w).not.toContain('answers');
      expect(w).not.toContain('rows');
    }
  });

  it('writes DNA through the one preference log rather than a second model', () => {
    const action = read('src/lib/actions/tasteQuiz.ts');
    expect(action).toContain('recordEvents');
    expect(action).toContain('toPreferenceEvents');
  });

  it('survives a missing provenance table instead of losing the answers', () => {
    const action = read('src/lib/actions/tasteQuiz.ts');
    expect(action).toContain('42P01');
    expect(action).toContain('provenanceStored');
  });

  it('registers migration 0034 so the provenance table can actually be created', () => {
    expect(read('src/lib/pendingMigrations.ts')).toContain('0034_taste_quiz');
  });

  it('keeps the provenance log append-only in the database, not just in code', () => {
    const sql = read('supabase/migrations/0034_taste_quiz.sql');
    expect(sql).toContain('for insert with check (auth.uid() = user_id)');
    expect(sql).toContain('enable row level security');
    expect(sql).not.toContain('for update using');
  });
});
