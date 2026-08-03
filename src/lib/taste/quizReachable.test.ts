/**
 * THE QUIZ HAS TO BE REACHABLE.
 *
 * A route nobody links to is not a feature. An earlier version of this work
 * shipped a whole interview behind a URL with no entry point anywhere in the
 * product, and nobody noticed until it was asked for by hand — so the entry
 * points are pinned here rather than trusted.
 *
 * THE TASTE QUIZ IS NOW ONE INSTRUMENT, NOT TWO. It used to offer a chooser
 * between a 12-statement questionnaire and a grid of real titles. The
 * statements lane is gone; agreeing with a sentence about yourself is a guess
 * about your own taste, and it had to be translated into attribute claims
 * before it could move anything, while a rating on a real title is already the
 * evidence the engine wants. Every entry point still lands somewhere real —
 * which is the whole point of this file, and the thing a deletion is most
 * likely to break.
 *
 * Source-level on purpose: `/app/*` redirects to the login page without a
 * session, so a browser test asserting "the DNA hub links to the quiz" would
 * pass against a login screen and prove nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const gone = (p: string) => !existsSync(join(ROOT, p));

const QUIZ_HREF = '/app/taste-quiz';

describe('entry points', () => {
  it('the route exists and renders the title grid', () => {
    const page = read('src/app/app/taste-quiz/page.tsx');
    expect(page).toContain('TitleGridCalibration');
    expect(page).toContain("title: 'Taste Quiz");
  });

  it('the landing hero makes ONE ceremonial entrance — the DNA quiz and import history are visible but secondary', () => {
    const page = read('src/app/page.tsx');
    const heroBlock = page.slice(page.indexOf('data-testid="hero-ctas"'), page.indexOf('</section>'));
    // The single entry button is styled as its own thing (gold, ceremonial) —
    // nothing else in the hero may claim btn-primary or btn-pulse either, or
    // a secondary action would compete with the entrance for the eye.
    expect(heroBlock.match(/btn-primary/g)).toBeNull();
    expect(heroBlock.match(/btn-pulse/g)).toBeNull();
    expect(heroBlock.match(/btn-courtroom/g)).toHaveLength(1);
    // The DNA quiz + import history are real, visible buttons (btn-secondary
    // — a plain bordered pill, not the brand accent) rather than buried
    // underlined text, but still a visibly quieter class than the gold CTA.
    expect(heroBlock.match(/btn-secondary/g)).toHaveLength(2);
    expect(page).toContain('data-testid="cta-enter"');
    expect(page).toContain('data-testid="cta-dna"');
    expect(page).toContain(QUIZ_HREF);
  });

  it('the DNA link and import history are secondary buttons, never styled as the primary entrance', () => {
    const page = read('src/app/page.tsx');
    for (const testid of ['cta-dna', 'cta-import']) {
      const at = page.indexOf(`data-testid="${testid}"`);
      const link = page.slice(page.lastIndexOf('<Link', at), page.indexOf('</Link>', at));
      expect(link, testid).not.toContain('btn-primary');
      expect(link, testid).not.toContain('btn-pulse');
      expect(link, testid).not.toContain('btn-courtroom');
      expect(link, testid).toContain('btn-secondary');
    }
    const importAt = page.indexOf('data-testid="cta-import"');
    const importLink = page.slice(page.lastIndexOf('<Link', importAt), page.indexOf('</Link>', importAt));
    expect(importLink).toContain('/import-taste');
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

  it('the card-flow quiz at /app/quiz is a second real instrument, not a stub', () => {
    // /app/quiz (DnaQuiz — swipe-style card flow) and /app/taste-quiz
    // (TitleGridCalibration — a grid of titles) are two distinct, real quiz
    // instruments that coexist deliberately (see DnaQuiz.tsx's doc comment).
    // Both need their own working entry point.
    const cardQuiz = read('src/app/app/quiz/page.tsx');
    expect(cardQuiz).toContain('DnaQuiz');
    // A founder session must survive the hop, or isolated calibration breaks.
    expect(cardQuiz).toContain('session');
  });

  it('the nav carries the quiz', () => {
    expect(read('src/components/Nav.tsx')).toContain(QUIZ_HREF);
  });
});

describe('honesty and safety of the title lane', () => {
  it('never turns "never heard of it" into a dislike', () => {
    const grid = read('src/components/TitleGridCalibration.tsx');
    // Untouched tiles must send nothing at all. A negative attraction from this
    // surface would be a preference the user never stated.
    expect(grid).toContain('if (!pick) return []');
    expect(grid).not.toMatch(/attraction:\s*'not_interested'/);
    expect(grid).not.toMatch(/attraction:\s*'absolutely_not'/);
    expect(grid).toContain('not recognising something is not a dislike');
  });

  it('writes DNA through the one preference log rather than a second model', () => {
    expect(read('src/components/TitleGridCalibration.tsx')).toContain('recordQuizAnswer');
  });

  it('ends on the payoff, not on an offer to go round again', () => {
    expect(read('src/components/TitleGridCalibration.tsx')).toContain('SeeRecommendations');
  });
});

/**
 * THE DELETION IS COMPLETE.
 *
 * A half-removed feature is worse than either state: dead components that still
 * compile, a chooser with one option, a route parameter nothing reads. These
 * pin that the statements lane left nothing behind.
 */
describe('the statements quiz is gone, not hidden', () => {
  it('its component, its model and its action are deleted', () => {
    for (const f of [
      'src/components/QuickTasteQuiz.tsx',
      'src/components/TasteQuizModes.tsx',
      'src/lib/taste/quickQuiz.ts',
      'src/lib/actions/tasteQuiz.ts',
      'src/app/dev/taste-quiz/page.tsx',
    ]) {
      expect(gone(f), `${f} is still here`).toBe(true);
    }
  });

  it('nothing imports it', () => {
    for (const f of ['src/app/app/taste-quiz/page.tsx', 'src/app/app/quiz/page.tsx', 'src/app/app/dna/page.tsx']) {
      const src = read(f);
      expect(src, `${f} still references the statements quiz`).not.toMatch(/QuickTasteQuiz|TasteQuizModes|quickQuiz|actions\/tasteQuiz/);
    }
  });

  it('the route no longer reads a mode it cannot honour', () => {
    const page = read('src/app/app/taste-quiz/page.tsx');
    expect(page).not.toContain("mode: QuizMode");
    expect(page).not.toContain("'statements'");
  });

  it('but a founder session still survives the legacy hop', () => {
    // The one thing the mode parameter shared its URL with, and the one that
    // actually matters: isolated founder calibration.
    expect(read('src/app/app/quiz/page.tsx')).toContain('session');
  });
});
