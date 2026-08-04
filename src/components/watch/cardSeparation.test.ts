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
    expect(verdictPanel).toMatch(/aria-label=\{`Your recommendation verdict/);
    expect(verdictPanel).toContain('not where it is available');
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
    expect(whereToWatch).toContain('min-h-[36px]');
  });
});
