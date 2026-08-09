import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * VOICE DNA MUST STAY DISCOVERABLE.
 *
 * This exists because of a real failure, not a hypothetical one. `/voice-dna`
 * shipped, was un-gated, and worked — and was still unreachable for ordinary
 * users, because nothing linked to it and a stale regression test
 * (`retired.test.ts` TEST 7+8) actively asserted that nothing ever would. That
 * guard was correct while the path belonged to the retired predecessor feature;
 * once the route was rebuilt, the guard was the reason the new feature stayed
 * invisible. A working feature nobody can find is indistinguishable from a
 * feature that does not exist.
 *
 * So the discoverability contract is pinned here, at source level, for the
 * SAME menu array the production mobile "More" sheet renders — there is one
 * `SECONDARY` list feeding both the desktop dropdown and the mobile sheet, so
 * pinning it pins the phone.
 */

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

const nav = () => read('src/components/Nav.tsx');

/** The `SECONDARY` array — the exact list "More" renders, in order. */
function secondaryEntries(): { href: string; label: string }[] {
  const src = nav();
  const block = src.match(/const SECONDARY: NavLink\[\] = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('Could not find the SECONDARY nav array in Nav.tsx');
  return [...(block[1] ?? '').matchAll(/\{\s*href:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g)].map((m) => ({
    href: m[1] ?? '',
    label: m[2] ?? '',
  }));
}

describe('Voice DNA is reachable from the production navigation', () => {
  it('appears in the More menu', () => {
    const entry = secondaryEntries().find((e) => e.href === '/voice-dna');
    expect(
      entry,
      'Voice DNA is missing from the More menu — an ordinary user has no way to find it',
    ).toBeDefined();
  });

  it('is labelled recognisably, with the mic', () => {
    const entry = secondaryEntries().find((e) => e.href === '/voice-dna');
    expect(entry?.label).toContain('Voice DNA');
    expect(entry?.label).toContain('🎙️');
  });

  it('sits directly under Your Watch DNA, because that is what it builds', () => {
    const entries = secondaryEntries();
    const dna = entries.findIndex((e) => e.href === '/app/dna');
    const voice = entries.findIndex((e) => e.href === '/voice-dna');
    expect(dna, 'Your Watch DNA missing from More').toBeGreaterThanOrEqual(0);
    expect(voice).toBe(dna + 1);
  });

  it('points at the real experience, not a lab, placeholder or duplicate', () => {
    const entry = secondaryEntries().find((e) => e.href === '/voice-dna');
    // Not the founder-only audition diagnostic, and not a second copy of the
    // interview under some other path.
    expect(entry?.href).toBe('/voice-dna');
    expect(entry?.href).not.toContain('audition');
    expect(entry?.href).not.toContain('dev');
    expect(entry?.href).not.toContain('lab');
  });

  it('the destination page exists and renders the real interview', () => {
    const page = read('src/app/voice-dna/page.tsx');
    expect(page).toContain('VoiceInterview');
    // Not founder-gated: an ordinary user reaching it must not get a 404.
    expect(page).not.toContain('isFounderOrAdminEmail');
    expect(page).not.toContain('notFound()');
  });

  it('the one menu list feeds BOTH the desktop dropdown and the mobile sheet', () => {
    // If these ever diverge, "discoverable" would stop meaning discoverable on
    // a phone — which is where this was reported from.
    const src = nav();
    expect(src).toMatch(/<MoreMenu\s+links=\{SECONDARY\}/);
    expect(src).toMatch(/secondary=\{SECONDARY\}/);
  });

  it('the mobile sheet renders every secondary link it is given', () => {
    const mobile = read('src/components/nav/MobileNav.tsx');
    expect(mobile).toMatch(/secondary\.map\(/);
  });
});
