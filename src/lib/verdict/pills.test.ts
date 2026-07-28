import { describe, it, expect } from 'vitest';
import { buildPills, isMatchReceipt } from './pills';

describe('finding the one that matters', () => {
  it('recognises the match receipt both producers build', () => {
    expect(isMatchReceipt('Your 93')).toBe(true);
    expect(isMatchReceipt('Household 88')).toBe(true);
  });

  it('does not mistake a year, a runtime or a percentage for it', () => {
    for (const r of ['2023', '118m', '87% audience', 'IMDb 7.8', 'on Kanopy', 'Stream It']) {
      expect(isMatchReceipt(r), r).toBe(false);
    }
  });

  it('promotes it even when it is not first', () => {
    const p = buildPills({ receipts: ['2023', '87% audience', 'Your 93'] });
    expect(p[0]).toEqual({ label: 'Your 93', tone: 'match' });
  });

  it('there is only ever ONE loudest pill', () => {
    const p = buildPills({ receipts: ['Your 93', 'Household 88'] });
    expect(p.filter((x) => x.tone === 'match')).toHaveLength(1);
  });

  it('is fine when there is no match receipt at all', () => {
    const p = buildPills({ receipts: ['2023', '118m'] });
    expect(p.every((x) => x.tone === 'fact')).toBe(true);
  });
});

describe('everything else is quiet evidence', () => {
  it('keeps every receipt, in order, behind the match', () => {
    const p = buildPills({ receipts: ['Your 93', '118m', '2023', '87% audience'] });
    expect(p.map((x) => x.label)).toEqual(['Your 93', '118m', '2023', '87% audience']);
    expect(p.slice(1).every((x) => x.tone === 'fact')).toBe(true);
  });

  it('drops an exact duplicate rather than printing it twice', () => {
    const p = buildPills({ receipts: ['2023', '2023'] });
    expect(p).toHaveLength(1);
  });
});

describe('where to watch is an instruction, not a label', () => {
  it('says what to do with the service name', () => {
    const p = buildPills({ receipts: ['Your 93'], where: 'Kanopy' });
    expect(p.at(-1)).toEqual({ label: 'Watch on Kanopy', tone: 'watch' });
  });

  it('does not say the same thing twice in two shapes', () => {
    // The finder pushes "on Kanopy" as a receipt when you filtered by service,
    // and `where` is the same service. One row, one statement.
    const p = buildPills({ receipts: ['Your 93', 'on Kanopy', '2023'], where: 'Kanopy' });
    expect(p.map((x) => x.label)).toEqual(['Your 93', '2023', 'Watch on Kanopy']);
  });

  it('keeps a DIFFERENT service receipt — it is not a duplicate', () => {
    const p = buildPills({ receipts: ['on Netflix'], where: 'Kanopy' });
    expect(p.map((x) => x.label)).toEqual(['on Netflix', 'Watch on Kanopy']);
  });

  it('shows nothing at all rather than "Watch on "', () => {
    expect(buildPills({ receipts: ['Your 93'], where: null })).toHaveLength(1);
    expect(buildPills({ receipts: ['Your 93'], where: '  ' })).toHaveLength(1);
  });
});

describe('malformed input', () => {
  it('survives it without throwing', () => {
    expect(() => buildPills({})).not.toThrow();
    expect(buildPills({ receipts: ['', '   '] })).toHaveLength(0);
  });
});
