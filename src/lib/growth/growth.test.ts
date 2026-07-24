import { describe, it, expect } from 'vitest';
import {
  stageForUsers, nextMilestone, allMilestones, requiredWeeklyGrowth,
  buildFunnel, biggestLeak, sampleConfidence,
} from './core';
import { todaysPlan } from './playbook';
import { slugify, isValidSlug, destinationWithUtm, shortLink } from './utm';
import { generateOutreach } from './outreach';

describe('growth stage', () => {
  it('maps user count to the right stage', () => {
    expect(stageForUsers(0).stage).toBe('stage1');
    expect(stageForUsers(99).stage).toBe('stage1');
    expect(stageForUsers(100).stage).toBe('stage2');
    expect(stageForUsers(999).stage).toBe('stage2');
    expect(stageForUsers(1000).stage).toBe('stage3');
    expect(stageForUsers(10000).stage).toBe('scale');
  });
});

describe('milestones', () => {
  it('finds the next unreached milestone with correct remaining/progress', () => {
    const m = nextMilestone(7);
    expect(m.target).toBe(10);
    expect(m.reached).toBe(false);
    expect(m.remaining).toBe(3);
    expect(m.progress).toBeCloseTo(0.7);
  });
  it('marks reached milestones and computes required weekly growth', () => {
    expect(allMilestones(30).find((x) => x.target === 25)!.reached).toBe(true);
    const now = 0, in4w = 4 * 7 * 86_400_000;
    expect(requiredWeeklyGrowth(20, 100, now, in4w)).toBe(20); // (100-20)/4
    expect(requiredWeeklyGrowth(100, 100, now, in4w)).toBe(0);
    expect(requiredWeeklyGrowth(20, 100, now, 0)).toBeNull(); // no time left
  });
});

describe('funnel', () => {
  it('labels untracked steps instead of faking zeros, and computes rates only between tracked steps', () => {
    const rows = buildFunnel({ signups: 40, dna_completed: 18, first_verdict: 12 });
    const visitors = rows.find((r) => r.step === 'visitors')!;
    expect(visitors.untracked).toBe(true); // no visitor analytics yet → not faked as 0-real
    const dna = rows.find((r) => r.step === 'dna_completed')!;
    expect(dna.untracked).toBe(false);
    expect(dna.rate).toBeCloseTo(18 / 40);
    expect(dna.dropoff).toBe(22);
  });
  it('finds the biggest absolute leak', () => {
    const rows = buildFunnel({ signups: 100, dna_completed: 30, first_verdict: 25 });
    const leak = biggestLeak(rows)!;
    expect(leak.step).toBe('dna_completed'); // lost 70 here vs 5 later
  });
});

describe('data honesty', () => {
  it('labels small samples directionally', () => {
    expect(sampleConfidence(0).level).toBe('none');
    expect(sampleConfidence(12).level).toBe('directional');
    expect(sampleConfidence(50).level).toBe('emerging');
    expect(sampleConfidence(200).level).toBe('meaningful');
  });
});

describe("today's plan", () => {
  const base = { users: 0, stage: 'stage1' as const, prospectsTotal: 0, prospectsToContact: 0, followUpsDue: 0, trackedLinks: 0, biggestLeak: null };

  it('returns at most five prioritized actions', () => {
    const plan = todaysPlan(base);
    expect(plan.length).toBeLessThanOrEqual(5);
    expect(plan.length).toBeGreaterThan(0);
    for (let i = 1; i < plan.length; i++) expect(plan[i - 1]!.priority).toBeGreaterThanOrEqual(plan[i]!.priority);
  });
  it('prioritizes due follow-ups above everything', () => {
    const plan = todaysPlan({ ...base, prospectsTotal: 20, followUpsDue: 3 });
    expect(plan[0]!.id).toBe('followups');
  });
  it('every action carries a task, why, impact, time, and a direct link', () => {
    for (const a of todaysPlan(base)) {
      expect(a.task).toBeTruthy();
      expect(a.why).toBeTruthy();
      expect(a.impact).toBeTruthy();
      expect(a.minutes).toBeGreaterThan(0);
      expect(a.href).toMatch(/^\/(growth-os|go)/);
    }
  });
  it('surfaces a fix-the-leak action only when the leak is meaningful', () => {
    const withLeak = todaysPlan({ ...base, biggestLeak: { fromLabel: 'Signups', toLabel: 'DNA', lostPct: 0.6 } });
    expect(withLeak.some((a) => a.id === 'fix-leak')).toBe(true);
  });
});

describe('tracking links', () => {
  it('builds valid slugs', () => {
    expect(isValidSlug(slugify('Reddit MovieSuggestions post'))).toBe(true);
    expect(slugify('!!!')).toMatch(/^[a-z0-9-]{3,}$/);
  });
  it('attaches UTM params to the destination and builds a short link', () => {
    const dest = destinationWithUtm({ slug: 'x', destination: '/app/quiz', source: 'reddit', medium: 'post', campaign: 'launch', content: 'v1', referrer: 'u123' });
    expect(dest).toContain('utm_source=reddit');
    expect(dest).toContain('utm_campaign=launch');
    expect(dest).toContain('ref=u123');
    expect(shortLink('https://watchverdict.app/', 'abc')).toBe('https://watchverdict.app/go/abc');
  });
});

describe('outreach generator', () => {
  it('personalizes and always includes the tracked link; never auto-sends', () => {
    const r = generateOutreach('creator_pitch', { name: 'Sam', audience: 'film TikTok, 40k', link: 'https://wv.app/go/x' });
    expect(r.body).toContain('Sam');
    expect(r.body).toContain('film TikTok, 40k');
    expect(r.body).toContain('https://wv.app/go/x');
  });
});
