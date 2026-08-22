/**
 * THE TITLE-PAGE BADGE DOES NOT FAKE PERSONALIZATION, pinned at source.
 *
 * The bug: the header hard-coded "Your VERD1CT" and showed 🧬 whenever the
 * account had rated anything (`isPersonalized`), even over an objective score.
 * The fix drives the label + marker from the honest `personalizationView`, which
 * reads the resolver's own `canonical.personalized` verdict. This guards that the
 * hard-coded personal branding and the loud magenta cannot return.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'DnaScore.tsx'), 'utf8');

describe('the title-page score label is honest', () => {
  it('no longer hard-codes "Your VERD1CT" as the header', () => {
    expect(SRC).not.toMatch(/>Your VERD1CT</);
  });

  it('drives the state from the honest personalizationView', () => {
    expect(SRC).toMatch(/import \{ personalizationView \} from '@\/lib\/verdict\/personalizationState'/);
    expect(SRC).toMatch(/personalized: dna\.canonical\?\.personalized/);
    expect(SRC).toMatch(/view\.showDna \? '🧬'/);
    expect(SRC).toMatch(/\{view\.header\}/);
  });

  it('no longer decides the marker from mere rating volume (isPersonalized)', () => {
    expect(SRC).not.toMatch(/isPersonalized/);
  });

  it('drops the loud pink/magenta badge treatment', () => {
    expect(SRC).not.toMatch(/border-pink-400\/80/);
    expect(SRC).not.toMatch(/from-pink-500\/40/);
    expect(SRC).not.toMatch(/bg-pink-500\/10/);
  });
});
