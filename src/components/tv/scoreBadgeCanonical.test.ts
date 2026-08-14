/**
 * THE GUIDE'S SCORE BADGE IS THE CANONICAL COMPONENT — the owner's RED items.
 *
 * "Your 72"-style ad-hoc pills are gone: the Live TV guide renders the same
 * Watch Verd1ct number through the same official component every card uses,
 * with the identical value, the canonical missing state, and an accessible
 * name that says what the number IS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const badge = read('src/components/tv/ScoreBadge.tsx');
const guide = read('src/components/ChannelGuide.tsx');
const algo = read('src/components/AlgorithmScore.tsx');

describe('RED — Live TV cards use the canonical score component', () => {
  it('the guide badge REUSES Verd1ctBadge — imported, not copied', () => {
    expect(badge).toContain("import { Verd1ctBadge } from '@/components/Verd1ctBadge'");
    expect(badge).toContain('<Verd1ctBadge score={score}');
    // The ad-hoc text pill is gone in both spellings.
    expect(badge).not.toContain('Your ${score}');
    expect(badge).not.toContain('${score} fit');
    // And no copied badge internals: the TV-set drawing (its svg geometry)
    // stays in one file.
    expect(badge).not.toContain('viewBox');
    expect(badge).not.toContain('antH');
  });

  it('the numeric value passes through untouched — no arithmetic, no remapping', () => {
    expect(badge).not.toMatch(/\bscore\s*[*+\-/]\s*\d/);
    expect(badge).not.toMatch(/Math\.(round|floor|ceil)\(\s*score/);
  });

  it('missing-score behavior is the canonical empty state, owned by the canonical module', () => {
    const canonical = read('src/components/Verd1ctBadge.tsx');
    expect(canonical).toContain('export function Verd1ctBadgePlaceholder');
    // The guide's on-now panel uses it when unscored…
    expect(guide).toContain('<Verd1ctBadgePlaceholder');
    // …and AlgorithmScore now imports the same one instead of inline markup.
    expect(algo).toContain('Verd1ctBadgePlaceholder');
    expect(algo).not.toContain("place-items-center rounded-[24%]");
  });

  it('the accessible name identifies the Watch Verd1ct score', () => {
    expect(badge).toContain('aria-label={`Watch Verd1ct score ${score}');
  });

  it('unrelated metrics are NOT relabeled — the DNA strength gauge keeps its own identity', () => {
    const dna = read('src/app/app/dna/page.tsx');
    expect(dna).toContain('DnaScoreBadge');
    expect(dna).not.toContain('Verd1ctBadge');
  });

  it('the personalized/baseline honesty split survives the reskin', () => {
    expect(badge).toContain('personalized');
    expect(badge).toContain('baseline');
    expect(badge).toContain('DNA_PERSONAL_MIN'); // named in the doc contract
  });
});
