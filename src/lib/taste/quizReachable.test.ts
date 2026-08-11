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
  it('the legacy quiz route redirects to the Showdown rather than dangling', () => {
    /*
     * THE CANONICAL CALIBRATION IS NOW THE SHOWDOWN.
     *
     * This route used to render the title grid. It is a redirect now, because
     * two independently maintained "rate titles to build your DNA" flows is
     * exactly how `/app/quiz` and `/app/taste-quiz` drifted apart — and the fix
     * for that was a redirect too, so adding a third instrument beside them
     * would have been repeating a mistake this file already documents.
     *
     * The invariant this test has always defended is unchanged and is what is
     * checked here: every entry point lands somewhere real. It cannot 404,
     * because the nav, the DNA hub, the landing page and outreach links all
     * point at it.
     */
    const page = read('src/app/app/taste-quiz/page.tsx');
    expect(page).toContain('redirect(');
    expect(page).toContain('/app/showdown');
    // A founder session must survive the hop, or isolated calibration breaks.
    expect(page).toContain('session');
    // And the destination is real, not another stub.
    const showdown = read('src/app/app/showdown/page.tsx');
    expect(showdown).toContain('Showdown');
    expect(showdown).toContain("title: 'DNA Showdown");
  });

  it('the Showdown writes through the one preference log, not a store of its own', () => {
    // The whole point of the rebuild: a calibration flow that learns into a
    // private profile changes nothing about what anyone is recommended.
    const action = read('src/lib/actions/showdown.ts');
    expect(action).toContain('recordEvents');
    expect(action).toContain('preference/store');
    // No second model: the rules live in the shared pure bridge.
    expect(action).toContain('showdown/verdict');
  });

  it('the landing hero makes ONE ceremonial entrance — the DNA quiz and import history are visible but secondary', () => {
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
    expect(heroBlock.match(/btn-watchverdict/g)).toHaveLength(1);
    // The DNA quiz + import history are real, visible buttons (btn-secondary
    // — a plain bordered pill, not the brand accent) rather than buried
    // underlined text, but still a visibly quieter class than the brand CTA.
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
      expect(link, testid).not.toContain('btn-watchverdict');
      expect(link, testid).toContain('btn-secondary');
    }
    const importAt = page.indexOf('data-testid="cta-import"');
    const importLink = page.slice(page.lastIndexOf('<Link', importAt), page.indexOf('</Link>', importAt));
    expect(importLink).toContain('/import-taste');
  });

  it('never shows a second, equally-prominent "Start watching" button in the header', () => {
    const page = read('src/app/page.tsx');
    expect(page).not.toContain('Start watching');
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

  it('the retired grid route does not also try to render a grid', () => {
    // A redirect that still imports the component it replaced is the
    // half-removed state this file exists to prevent.
    const page = read('src/app/app/taste-quiz/page.tsx');
    expect(page).not.toContain('<TitleGridCalibration');
  });

  it('but a founder session still survives the legacy hop', () => {
    // The one thing the mode parameter shared its URL with, and the one that
    // actually matters: isolated founder calibration.
    expect(read('src/app/app/quiz/page.tsx')).toContain('session');
  });
});
