import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyEntry } from './schedule';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * "Do not make the experience depend entirely on is_premiere=true."
 * The classification below is what stands between an honest schedule and a
 * giant empty panel — and between a derived label and an invented premiere.
 */

describe('premiere classification', () => {
  it('a provider-verified flag is verified — the strongest claim', () => {
    expect(classifyEntry({ startAtUtc: '2026-08-10T20:00:00Z', isPremiere: true }, '2026-01-01T00:00:00Z')).toBe('verified');
  });

  it('the earliest airing we have EVER stored is a derived premiere', () => {
    expect(
      classifyEntry({ startAtUtc: '2026-08-10T20:00:00Z', isPremiere: null }, '2026-08-10T20:00:00Z'),
    ).toBe('derived');
  });

  it('anything with an earlier stored airing is a rerun, never a premiere', () => {
    // Claiming a rerun as a premiere is an invented fact — the exact thing
    // the packs must never show.
    expect(
      classifyEntry({ startAtUtc: '2026-08-10T20:00:00Z', isPremiere: null }, '2026-08-03T20:00:00Z'),
    ).toBe('scheduled');
    expect(
      classifyEntry({ startAtUtc: '2026-08-10T20:00:00Z', isPremiere: false }, '2026-08-03T20:00:00Z'),
    ).toBe('scheduled');
  });

  it('no earliest-airing evidence at all -> scheduled, not derived', () => {
    expect(classifyEntry({ startAtUtc: '2026-08-10T20:00:00Z', isPremiere: null }, null)).toBe('scheduled');
  });
});

describe('the premiere view no longer dead-ends on the flag', () => {
  const view = read('src/components/packs/PremiereCalendarView.tsx');

  it('falls back to the real upcoming schedule when no premiere is verified', () => {
    expect(view).toContain('getPackUpcoming');
    expect(view).toContain('UpcomingScheduleList');
  });

  it('the empty state no longer blames the ingest when the gap is premiere flags', () => {
    expect(view).not.toContain("or the ingest hasn't run yet");
  });

  it('derived premieres are labelled as derived, never passed off as verified', () => {
    const list = read('src/components/packs/UpcomingScheduleList.tsx');
    expect(list).toContain('First airing in our data');
    // The verified badge and derived badge are distinct labels.
    expect(list).toMatch(/verified:.*Premiere/s);
  });
});

describe('the checklist explains itself honestly', () => {
  const section = read('src/components/packs/ChecklistSection.tsx');

  it('never says "Nothing ingested yet"', () => {
    expect(section).not.toContain('Nothing ingested yet');
  });

  it('distinguishes broken wiring from an empty feed', () => {
    expect(section).toContain("This Pack's channels aren't wired up");
    expect(section).toContain("No titles from this Pack's channels yet");
  });
});
