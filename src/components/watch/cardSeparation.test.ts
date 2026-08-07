import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * THE CONTRADICTION, AS A STANDING TEST.
 *
 * A card showed "82 · STREAM IT" with "Availability not currently confirmed"
 * underneath. Two claims of different kinds, rendered as one. These assertions
 * are the structural guarantees that keep them apart:
 *
 *   1. The verdict is labelled as a verdict, before it is read.
 *   2. Availability comes from ONE shared component and ONE shared resolver.
 *   3. No page grows its own provider logic.
 */

const posterCard = read('src/components/PosterCard.tsx');
const verdictPanel = read('src/components/AlgorithmScore.tsx');
const whereToWatch = read('src/components/watch/WhereToWatch.tsx');
const resolver = read('src/lib/availability/watchPresentation.ts');

describe('the verdict is visibly a verdict, not an availability instruction', () => {
  it('labels the panel before the call, so "STREAM IT" is never read bare', () => {
    const labelAt = verdictPanel.indexOf('Your VERD');
    const callAt = verdictPanel.indexOf('{v.call}');
    expect(labelAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    expect(labelAt).toBeLessThan(callAt);
  });

  it('tells a screen reader which kind of claim it is', () => {
    expect(verdictPanel).toMatch(/aria-label=\{`Your recommendation verdict is/);
    expect(verdictPanel).toContain('Current viewing availability is not confirmed');
  });

  it('the availability block announces itself separately', () => {
    expect(whereToWatch).toContain('aria-label={ariaLabel}');
    expect(resolver).toContain("'Where to watch: not confirmed'");
  });

  it('the verdict panel makes no availability claim of its own', () => {
    // Asserted on IMPORTS and CALLS, not prose — the panel's own comments
    // necessarily discuss availability in order to explain why it holds none.
    // What matters is that it has no way to read any.
    const imports = verdictPanel.split('\n').filter((l) => l.trimStart().startsWith('import'));
    for (const line of imports) {
      expect(line).not.toMatch(/availability|watchmode|tileFacts/i);
    }
    const code = verdictPanel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const call of ['loadTileFacts', 'resolveWatchPresentation', 'watchLink']) {
      expect(code, call).not.toContain(call);
    }
  });
});

describe('one shared availability component, one shared resolver', () => {
  it('the card renders the shared block and no bespoke availability code', () => {
    expect(posterCard).toContain('<WhereToWatch');
    expect(posterCard).toContain('<WhyThisTitle');
  });

  it('the display component invents no wording of its own', () => {
    // Every user-facing string comes from the resolver. If a label were added
    // here, a second vocabulary would exist the tests do not govern.
    for (const label of ['Included with', 'Free with ads', 'rent', 'Watch now', 'Check availability']) {
      expect(whereToWatch, label).not.toContain(`>${label}`);
    }
    expect(whereToWatch).toContain('resolveWatchPresentation');
  });

  it('the CTA is derived from verified state, never from a score', () => {
    expect(resolver).toContain('function chooseCta');
    for (const scoreish of ['score', 'verdict', 'dna', 'rating']) {
      expect(resolver.slice(resolver.indexOf('function chooseCta')).toLowerCase(), scoreish)
        .not.toContain(scoreish);
    }
  });
});

describe('no page grows its own provider logic', () => {
  /** Every .tsx under src/app and src/components, so a new page is covered
   *  the moment it is added rather than when someone remembers to list it. */
  function tsxFiles(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${e}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) tsxFiles(rel, acc);
      else if (e.endsWith('.tsx') && !e.includes('.test.')) acc.push(rel);
    }
    return acc;
  }

  const surfaces = [...tsxFiles('src/app'), ...tsxFiles('src/components')];

  it('finds the real card surfaces (the sweep is not silently empty)', () => {
    expect(surfaces.length).toBeGreaterThan(50);
  });

  it('no component maps availability states to words except the resolver', () => {
    // These phrases are the resolver's output vocabulary. Finding them in a
    // component means that component is doing its own state mapping.
    const offenders = surfaces.filter((f) => {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return /'Included with |"Included with |Free with ads on |included_with_base_subscription/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('no component derives a watch option from an original network', () => {
    const offenders = surfaces.filter((f) => {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // A network becoming a StreamingOption's `service` is the exact defect.
      return /service:\s*[a-zA-Z.]*network/i.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe('mobile readability', () => {
  it('the availability rows wrap and never force a fixed width', () => {
    expect(whereToWatch).not.toMatch(/\bw-\[\d+px\]/);
    expect(whereToWatch).not.toMatch(/whitespace-nowrap/);
  });

  it('the call to action meets the tap-target minimum', () => {
    // 44px, not the 36 this used to pin. A test named "meets the tap-target
    // minimum" that asserted 36 was asserting the defect: "Notify me when
    // confirmed" rendered 205x36, and the visual-QA sweep flagged it as the
    // last sub-44px control in the grid at all twelve viewports.
    expect(whereToWatch).toContain('min-h-[44px]');
    expect(whereToWatch, 'no control here may go back under the floor').not.toContain('min-h-[36px]');
  });
});

describe('the reasons read the field the data actually uses', () => {
  const why = read('src/components/watch/WhyThisTitle.tsx');

  it('prefers episodeRuntimeMinutes, which is where a series carries its length', () => {
    // Caught against live production data: CSI: NY (tv/2458) and Harrow
    // (tv/77947) both return runtimeMinutes:null and episodeRuntimeMinutes 42
    // and 43. Reading only runtimeMinutes silently dropped the
    // "43-minute episodes" reason on exactly the cards it was written for.
    const line = why.split('\n').find((l) => l.includes('episodeMinutes:'))!;
    // The regex fixes the ORDER too: episodeRuntimeMinutes must come first,
    // with the movie field kept as the fallback rather than dropped.
    expect(line).toMatch(/episodeRuntimeMinutes\s*\?\?\s*facts\.facts\?\.runtimeMinutes/);
  });
});

describe('the card does not repeat its own metadata', () => {
  const why = read('src/components/watch/WhyThisTitle.tsx');
  const reasons = read('src/lib/reasons/whyThisTitle.ts');

  it('run length and episode length are not reasons on their own', () => {
    // Shipped and observed: "Why it fits" read "3 seasons · 30 episodes",
    // word for word the metadata line two rows above it.
    expect(reasons).not.toMatch(/kind: 'run'[,}]/);
    expect(reasons).not.toMatch(/kind: 'length'[,}]/);
    expect(reasons).toContain("kind: 'length_request'");
    expect(reasons).toContain("kind: 'run_request'");
  });

  it('they return only when an ACTIVE REQUEST makes them personal', () => {
    expect(reasons).toContain('requestedMaxMinutes');
    expect(reasons).toContain('requestedCompletedSeries');
    expect(reasons).toContain('fit the time you asked for');
  });

  it('the fallback needs a real profile behind it', () => {
    expect(reasons).toContain("(input.ratedCount ?? 0) > 0");
  });

  it('the card no longer needs an exclusion list to avoid duplicating itself', () => {
    expect(why).not.toContain('exclude');
    expect(posterCard).not.toContain('exclude=');
  });
});

describe('no action is rendered without a destination', () => {
  it('an unknown state gets a real button wired to the availability panel', () => {
    expect(whereToWatch).toContain('setPanelOpen(true)');
    expect(whereToWatch).toContain('<AvailabilityPanel');
  });

  it('the button label follows real server capability, not hope', () => {
    expect(whereToWatch).toContain("'/api/availability/refresh'");
    expect(whereToWatch).toMatch(/refreshable === false \? 'Notify me when confirmed'/);
  });

  it('a CTA with no link and no panel renders nothing — the logo strip is the answer', () => {
    // The third branch: verified options exist but none carries a deep link.
    // There is nothing to press AND nothing new to say — the ProviderLogos
    // strip (brand tiles + Free/Rent/Buy badges + "+N") already IS the answer,
    // so the branch returns null rather than repeating it as a "View options"
    // label. No pressable element, and no redundant text either.
    expect(whereToWatch).toMatch(/\)\s*:\s*null/);
    expect(whereToWatch).not.toMatch(/<span data-testid="where-to-watch-cta"/);
  });

  it('the panel runs a real refresh and names every failure', () => {
    const panel = read('src/components/watch/AvailabilityPanel.tsx');
    expect(panel).toContain("fetch('/api/availability/refresh'");
    for (const r of ['no_key', 'budget_exhausted', 'fetch_failed', 'store_failed', 'rate_limited']) {
      expect(panel, r).toContain(r);
    }
  });

  it('the notify path does something real, not just a label change', () => {
    const panel = read('src/components/watch/AvailabilityPanel.tsx');
    expect(panel).toContain('addToWatchlist');
  });
});

describe('the unknown state is short', () => {
  it('shows a two-word label, keeping the sentence as the description', () => {
    expect(whereToWatch).toContain("'Not yet confirmed'");
    expect(whereToWatch).toContain('title={note}');
  });

  it('the section labels are readable rather than near-invisible', () => {
    for (const src of [whereToWatch, read('src/components/watch/WhyThisTitle.tsx')]) {
      expect(src).not.toMatch(/text-\[10px\] font-black uppercase tracking-wide text-slate-500/);
    }
  });
});

describe('the verdict states both claims for a screen reader', () => {
  it('names the recommendation AND the availability separately', () => {
    expect(verdictPanel).toContain('Your recommendation verdict is');
    expect(verdictPanel).toContain('Current viewing availability is not confirmed');
  });
});

describe('the page header promises only what exists', () => {
  it('does not claim every title has a place to watch', () => {
    for (const f of ['src/app/app/watch/page.tsx', 'src/app/app/person/[id]/page.tsx']) {
      expect(read(f), f).not.toContain('Tap any for where to watch');
      expect(read(f), f).toContain('any verified viewing options');
    }
  });
});
