/**
 * ONE SET OF ACTIONS, ON EVERY SURFACE.
 *
 * The TV guide let you set a reminder, save, and rule against — but not FOR,
 * and there was no W, so a listing could not go on the docket the way a poster
 * could. Two grids away, the same title offered W + FOR + AGAINST + SAVE and no
 * reminder. Which verbs a title supports depended on which screen you found it
 * on, which is not a rule anyone can learn.
 *
 * The set is now: W (docket) · FOR · AGAINST · SAVE, everywhere a title has a
 * TMDB id — plus REMIND wherever there is an actual airtime to be reminded of.
 * Remind is deliberately NOT on the streaming grids: a button promising to tell
 * you when something starts, on a title with no start time, is a lie with a
 * nice icon.
 *
 * Source-level: these screens need a session and live schedule data, so a
 * browser test would assert against a login page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Surfaces that show titles you can act on. */
const TITLE_SURFACES = [
  'src/components/PosterCard.tsx',
  'src/components/ReleaseWall.tsx',
  'src/components/WatchNowGrid.tsx',
  'src/components/OnTvGuide.tsx',
  'src/components/TvDetective.tsx',
];

/** Surfaces where a title has a real broadcast time. */
const SCHEDULED_SURFACES = ['src/components/OnTvGuide.tsx', 'src/components/TvDetective.tsx'];

describe('every title surface offers the same verdict actions', () => {
  it('the W, so anything can go on the docket', () => {
    for (const f of TITLE_SURFACES) {
      expect(read(f), `${f} is missing the W`).toContain('WCheck');
    }
  });

  it('FOR and AGAINST, through the one shared component', () => {
    for (const f of TITLE_SURFACES) {
      expect(read(f), `${f} is missing the verdict pair`).toContain('CardVerdict');
    }
  });

  it('SAVE', () => {
    for (const f of TITLE_SURFACES) {
      expect(read(f), `${f} is missing save`).toContain('SaveButton');
    }
  });
});

describe('REMIND, only where there is something to be reminded about', () => {
  it('every scheduled surface can set a reminder', () => {
    for (const f of SCHEDULED_SURFACES) {
      const src = read(f);
      expect(src.includes('RemindButton') || src.includes('SignalIcon'), `${f} cannot remind`).toBe(true);
    }
  });

  it('the streaming grids do NOT — those titles have no airtime', () => {
    for (const f of ['src/components/PosterCard.tsx', 'src/components/WatchNowGrid.tsx', 'src/components/ReleaseWall.tsx']) {
      expect(read(f), `${f} promises a reminder it cannot keep`).not.toContain('RemindButton');
    }
  });
});

/**
 * "Make the reminder button cooler than that bell."
 *
 * A 🔔 is the glyph every notification setting in every app has used for
 * fifteen years — it says "notifications exist", not "this show, at this time,
 * on this channel".
 */
describe('the reminder is a broadcast signal, not a bell', () => {
  it('no bell emoji survives on either TV surface', () => {
    for (const f of SCHEDULED_SURFACES) {
      expect(read(f), `${f} still has a bell`).not.toContain('🔔');
    }
  });

  it('both surfaces draw the SAME mark, rather than inventing one each', () => {
    expect(read('src/components/RemindButton.tsx')).toContain('export function SignalIcon');
    expect(read('src/components/OnTvGuide.tsx')).toContain('SignalIcon');
  });

  it('the arcs only move when the reminder is actually set', () => {
    const src = read('src/components/RemindButton.tsx');
    // Motion that is always on is decoration; motion tied to state is a signal.
    expect(src).toMatch(/on \? 'wv-signal-arc-1' : ''/);
    expect(src).toMatch(/on \? 'wv-signal-arc-2' : ''/);
  });
});

/**
 * "Too small on iPad. On other screen, icons small and confusing."
 */
describe('controls scale with the screen', () => {
  const css = read('src/app/globals.css');

  it('the action row has a size that grows past the touch floor', () => {
    expect(css).toContain('.wv-act {');
    expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]{0,400}\.wv-act \{[\s\S]{0,80}min-height: 52px/);
  });

  it('every action control uses it, so none is left at phone scale', () => {
    for (const f of ['src/components/CardVerdict.tsx', 'src/components/SaveButton.tsx', 'src/components/RemindButton.tsx']) {
      expect(read(f), `${f} does not scale`).toContain('wv-act');
    }
  });

  it('the reco slate says what its buttons do instead of 👍 📌 ✕', () => {
    const src = read('src/components/RecommendationSlate.tsx');
    for (const emoji of ['👍', '📌', '✕']) {
      expect(src, `${emoji} is still a button label`).not.toContain(`>${emoji}<`);
    }
    expect(src).toContain('>For<');
    expect(src).toContain('>Against<');
  });
});

/** "Make this pink and slightly flashing." */
describe('the Watch DNA call to action', () => {
  it('is pink and breathes', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('.btn-pulse');
    expect(css).toContain('@keyframes wv-cta-breathe');
    // A breath, not a blink: it must never drop to transparent, which reads as
    // an error, and never cycle colour, which reads as a warning.
    expect(css).not.toMatch(/wv-cta-breathe[\s\S]{0,400}opacity: 0[;\s]/);
  });

  it('respects a reduced-motion preference', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}animation-iteration-count: 1/);
  });
});
