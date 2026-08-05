import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { titleHrefFor } from './SearchResultRow';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const ROW = stripComments(read('src/components/search/SearchResultRow.tsx'));
const BAR = stripComments(read('src/components/SearchBar.tsx'));
const REPORT = stripComments(read('src/components/verdict/VerdictReportView.tsx'));

/**
 * THE USER-LEVEL FAILURES THIS SUITE EXISTS FOR:
 *   "A large rich result card appears. Clicking much of that card does nothing."
 *   "Sometimes attempting to open it leaves a black/dark screen."
 *   "The full title page has Save and For/Against, but no circular W."
 */

describe('a result is ONE navigable thing', () => {
  it('opens the canonical title route', () => {
    expect(titleHrefFor({ mediaType: 'tv', id: 2458 })).toBe('/app/title/tv/2458');
    expect(titleHrefFor({ mediaType: 'movie', id: 921 })).toBe('/app/title/movie/921');
  });

  it('the poster and every line you read live INSIDE the link', () => {
    // The defect was a card where only the artwork and heading were wrapped.
    const link = ROW.slice(ROW.indexOf('<Link'), ROW.indexOf('</Link>'));
    for (const inside of ['<Poster', '{title}', '{year', 'facts.overview', 'facts.where', 'Open full verdict']) {
      expect(link, inside).toContain(inside);
    }
  });

  it('carries an explicit visible action as well as the whole-area target', () => {
    expect(ROW).toContain('Open full verdict');
  });

  it('NO button is ever nested inside the link', () => {
    // A <button> inside an <a> has undefined activation behaviour — every
    // action would become a coin toss between acting and navigating.
    const link = ROW.slice(ROW.indexOf('<Link'), ROW.indexOf('</Link>'));
    for (const control of ['<button', '<SaveButton', '<WCheck', '<CardVerdict']) {
      expect(link, control).not.toContain(control);
    }
  });

  it('the actions are siblings of the link, and all four are present', () => {
    const after = ROW.slice(ROW.indexOf('</Link>'));
    expect(after).toContain('<CardVerdict'); // For / Against
    expect(after).toContain('<SaveButton'); // Save
    expect(after).toContain('<WCheck'); // the docket W
  });

  it('does not reuse the oversized grid card', () => {
    // PosterCard is right for a grid and wrong for a dropdown; reusing it is
    // what produced the dead regions in the first place.
    expect(ROW).not.toContain('<PosterCard');
    expect(BAR).not.toContain('<PosterCard');
  });
});

describe('every way out of search closes it first', () => {
  it('there is exactly one exit path, and it does all three things', () => {
    const fn = BAR.slice(BAR.indexOf('function leaveForResult'), BAR.indexOf('function fileWithJudge'));
    expect(fn).toContain('setOpen(false)'); // 1. dropdown closes
    expect(fn).toContain('onNavigate?.()'); // 2. host sheet closes
    expect(fn).toContain('consumeSearchRequest'); // 3. persisted request cleared
  });

  it('the title result, the person result and the Judge all use it', () => {
    // Previously only the explicit Search button called onNavigate, which is
    // why the button worked and tapping a result left a black overlay.
    expect(BAR).toContain('onNavigate={leaveForResult}'); // title results
    expect(BAR).toContain('onClick={leaveForResult}'); // person results
    const judge = BAR.slice(BAR.indexOf('function fileWithJudge'), BAR.indexOf('async function go'));
    expect(judge).toContain('leaveForResult()');
  });

  it('the submitted-query path still closes before pushing', () => {
    const go = BAR.slice(BAR.indexOf('async function go'), BAR.indexOf('function clearAll'));
    expect(go).toContain('leaveForResult()');
    expect(go.indexOf('leaveForResult()')).toBeLessThan(go.indexOf('router.push(dest.href)'));
  });

  it('the row passes the callback down to its link', () => {
    expect(ROW).toContain('onClick={onNavigate}');
  });

  it('no result relies on a container click handler to close the dropdown', () => {
    // The old wrapper `onClick={() => setOpen(false)}` fired on the same tick
    // as the navigation and did nothing about the host sheet.
    expect(BAR).not.toContain('onClick={() => setOpen(false)}');
  });
});

describe('the W is on the full title page', () => {
  it('is rendered in the hero action row', () => {
    expect(REPORT).toContain('<WCheck');
    const actions = REPORT.slice(REPORT.indexOf('{t.trailerUrl'), REPORT.indexOf('</header>'));
    expect(actions).toContain('<WCheck');
  });

  it('sits alongside Save and For/Against — four distinct verbs', () => {
    const actions = REPORT.slice(REPORT.indexOf('{t.trailerUrl'), REPORT.indexOf('</header>'));
    expect(actions).toContain('<SaveButton');
    expect(actions).toContain('<CardVerdict');
    expect(actions).toContain('<WCheck');
  });

  it('uses the inline placement, since there is no poster corner here', () => {
    const actions = REPORT.slice(REPORT.indexOf('{t.trailerUrl'), REPORT.indexOf('</header>'));
    expect(actions).toContain('placement="inline"');
  });

  it('Save semantics are untouched — W is an addition, not a rename', () => {
    // Save = persistent watchlist. W = the active docket. Swapping either for
    // the other would silently change what a saved title means.
    expect(REPORT).toContain('<SaveButton');
    expect(REPORT).toContain('variant="inline"');
  });
});

describe('the W keeps its established design on every existing surface', () => {
  const W = read('src/components/WCheck.tsx');

  it('the poster placement is still the default', () => {
    expect(W).toContain("placement = 'poster'");
    expect(W).toContain("placement === 'poster' ? 'absolute right-1.5 top-1.5 z-10'");
  });

  it('44px, circular and gavel-marked in both placements', () => {
    expect(W).toContain("'grid h-11 w-11 place-items-center rounded-full'");
    expect(W).toContain('<Gavel');
  });

  it('a tap on it is never a navigation', () => {
    // It sits inside card links on other surfaces; this is what stops a
    // docket toggle from opening the title.
    expect(W).toContain('e.preventDefault()');
    expect(W).toContain('e.stopPropagation()');
  });
});
