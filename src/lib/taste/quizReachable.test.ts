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

  it('the landing hero makes ONE entrance — and ONLY one', () => {
    const page = read('src/app/page.tsx');
    // The CTA block is not the first `<section>` on the page — the hero and
    // the three-card process explanation come first, by design (see
    // page.tsx's own doc comments) — so the search for its closing tag has
    // to start at the block itself, not at the top of the file.
    const ctaStart = page.indexOf('data-testid="hero-ctas"');
    const heroBlock = page.slice(ctaStart, page.indexOf('</section>', ctaStart));
    // The single entry button is styled as its own thing (the brand
    // blue→violet→magenta `.btn-watchverdict`, not the courtroom's gold) —
    // nothing else in the hero may claim btn-primary or btn-pulse either, or
    // a secondary action would compete with the entrance for the eye. The
    // gold `.btn-courtroom` is reserved for the Live Jury / Verdict Room and
    // must never appear on the landing entrance.
    expect(heroBlock.match(/btn-primary/g)).toBeNull();
    expect(heroBlock.match(/btn-pulse/g)).toBeNull();
    expect(heroBlock.match(/btn-courtroom/g)).toBeNull();
    // THE ENTRANCE IS A COMPONENT NOW, NOT INLINE MARKUP. A second section
    // (the Example Verd1ct) needed the same button, and copying the markup
    // would have been the start of a second button language — so
    // `EnterWatchVerd1ctCta` owns it and both places render that. The rule is
    // enforced: the hero contains exactly ONE brand entrance, and the class
    // it carries is `.btn-watchverdict`.
    expect(heroBlock.match(/EnterWatchVerd1ctCta/g)).toHaveLength(1);
    const cta = read('src/components/landing/EnterWatchVerd1ctCta.tsx');
    expect(cta.match(/className="btn-watchverdict"/g)).toHaveLength(1);
    expect(cta).not.toMatch(/btn-primary|btn-pulse|btn-courtroom/);
    expect(cta).toContain("href=\"/app\"");
    // The entrance identifies itself as `cta-enter`; the component stamps it
    // onto the anchor from this prop.
    expect(page).toContain('testId="cta-enter"');
    expect(cta).toContain('data-testid={testId}');
    // AND NOTHING ELSE COMPETES. The DNA quiz and import-history pills used
    // to sit under the entrance as btn-secondary; three doors on the front
    // step is a decision a visitor hasn't earned yet. Both remain first-class
    // INSIDE the app — the DNA hub and nav assertions below are what keeps
    // them reachable — so the hero holds exactly one button and no
    // secondary items.
    expect(heroBlock.match(/btn-secondary/g)).toBeNull();
    expect(page).not.toContain('data-testid="cta-dna"');
    expect(page).not.toContain('data-testid="cta-import"');
    expect(page).not.toContain('No account needed');
  });

  it('never shows a second, equally-prominent "Start watching" button in the header', () => {
    const page = read('src/app/page.tsx');
    expect(page).not.toContain('Start watching');
  });

  it('the landing no longer reads per-user DNA to word a second door', () => {
    // The adaptive "Build/Keep building/Sharpen my Watch DNA" button was the
    // landing's second entrance; with it gone, the per-user stage query and
    // its copy table must be gone too — dead machinery on the front page is
    // how a second door grows back.
    const page = read('src/app/page.tsx');
    expect(page).not.toContain('DNA_CTA');
    expect(page).not.toContain('dnaStage');
  });

  it('the DNA hub offers three ways in', () => {
    const hub = read('src/app/app/dna/page.tsx');
    expect(hub).toContain('data-testid="link-taste-quiz"');
    expect(hub).toContain('data-testid="link-import-taste"');
    expect(hub).toContain(QUIZ_HREF);
  });

  it('/app/quiz redirects to the one canonical quiz, /app/taste-quiz, forwarding the founder session', () => {
    // /app/quiz (DnaQuiz — a swipe-style card flow) and /app/taste-quiz
    // (TitleGridCalibration — a recognition grid) used to be two separately
    // maintained "rate titles to build your DNA" instruments. Consolidated
    // onto /app/taste-quiz — the route the persistent nav, the DNA hub, and
    // the landing page already treat as canonical — with /app/quiz kept as a
    // redirect (not deleted) because it's embedded in growth/outreach links
    // and the /begin, /start clean-slate entry points that may already be
    // distributed.
    const cardQuiz = read('src/app/app/quiz/page.tsx');
    expect(cardQuiz).not.toContain('import { DnaQuiz }');
    expect(cardQuiz).not.toContain('<DnaQuiz');
    expect(cardQuiz).toContain('redirect(');
    expect(cardQuiz).toContain('/app/taste-quiz');
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
    expect(grid).toContain('untouched → nothing is sent');
    expect(grid).toMatch(/pick \? \[.*\] : \[\]/);
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
