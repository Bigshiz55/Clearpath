import { describe, it, expect } from 'vitest';
import { assessTitleRisk, type FinishProfile, type TitleRiskInput } from './finish';

const noRisk: TitleRiskInput = { long: false, longRunningTv: false, subtitleOnly: false, runtimeMinutes: 100, seasons: null };
const longSub: TitleRiskInput = { long: true, longRunningTv: false, subtitleOnly: true, runtimeMinutes: 160, seasons: null };
const prof = (finished: number, abandoned: number): FinishProfile => {
  const sample = finished + abandoned;
  return { finished, abandoned, finishRate: sample >= 5 ? finished / sample : null, sample };
};

describe('finish / regret risk (honest)', () => {
  it('stays quiet when there is no history and no risk factors', () => {
    expect(assessTitleRisk(noRisk, prof(0, 0)).level).toBe('unknown');
  });

  it('reads low risk for a completer watching a normal-length film', () => {
    const r = assessTitleRisk(noRisk, prof(18, 2));
    expect(r.level).toBe('low');
    expect(r.note).toContain('90%');
    expect(r.note).toContain('18 of 20');
  });

  it('escalates for a serial-abandoner facing a long subtitled film', () => {
    const r = assessTitleRisk(longSub, prof(4, 8));
    expect(r.level).toBe('high');
    expect(r.factors).toContain('subtitles only — no English dub');
    expect(r.factors.some((f) => f.includes('h'))).toBe(true); // runtime factor
  });

  it('only ever states the user’s real numbers, never a made-up prediction', () => {
    const r = assessTitleRisk(longSub, prof(10, 5));
    expect(r.note).toContain('67%'); // 10/15
    expect(r.note).toContain('10 of 15');
  });
});
