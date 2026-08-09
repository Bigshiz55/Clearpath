import { describe, it, expect } from 'vitest';
import { buildChannelGuide, isPaidProgramming, scheduleGaps, MIN_GAP_MIN } from './channelGuide';
import { channelIdentity } from './channelNames';
import { scoreDistribution } from './guideScoring';
import type { Airing } from '@/lib/onTv';

const NOW = Date.parse('2026-07-29T17:00:00Z');

function airing(over: Partial<Airing>): Airing {
  return {
    id: Math.floor(Math.random() * 1) + (over.id ?? 1),
    time: '12:00',
    minutes: 720,
    airstamp: new Date(NOW).toISOString(),
    runtime: 60,
    network: 'AMC',
    showName: 'Show',
    showId: 1,
    episodeName: null,
    season: null,
    number: null,
    showType: 'Scripted',
    genres: [],
    rating: null,
    image: null,
    summary: null,
    imdb: null,
    ...over,
  };
}

describe('the on-now broadcast never repeats as a schedule row', () => {
  it('drops a near-duplicate of the running programme from up next', () => {
    // The real defect: the same broadcast arrives twice with different episode
    // ids and airstamps seconds apart. Reference identity missed it, so the
    // header said "Chicago Fire — on now" and the first row underneath said
    // "5:00 AM Chicago Fire" again.
    const onNow = airing({ id: 1, showName: 'Chicago Fire', airstamp: new Date(NOW - 20 * 60_000).toISOString(), runtime: 60 });
    const dupe = airing({ id: 2, showName: 'Chicago Fire', airstamp: new Date(NOW - 20 * 60_000 + 30_000).toISOString(), runtime: 60 });
    const later = airing({ id: 3, showName: 'Inogen Portable Oxygen - No More Tanks!', airstamp: new Date(NOW + 40 * 60_000).toISOString() });
    const rows = buildChannelGuide([onNow, dupe, later], NOW, false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.onNow?.showName).toBe('Chicago Fire');
    expect(rows[0]!.upNext.map((a) => a.showName)).toEqual(['Inogen Portable Oxygen - No More Tanks!']);
  });

  it('keeps a genuine back-to-back later episode of the same show', () => {
    const onNow = airing({ id: 1, showName: 'Chicago Fire', airstamp: new Date(NOW - 20 * 60_000).toISOString(), runtime: 60 });
    const next = airing({ id: 2, showName: 'Chicago Fire', airstamp: new Date(NOW + 40 * 60_000).toISOString(), runtime: 60 });
    const rows = buildChannelGuide([onNow, next], NOW, false);
    expect(rows[0]!.upNext.map((a) => a.showName)).toEqual(['Chicago Fire']);
  });
});

describe('channel identity', () => {
  it('names an ION affiliate from its PX call block', () => {
    // The PX call block IS ION Television — that's what those call signs mean.
    for (const sign of ['KWPXDT', 'WPXD', 'KPPX-DT2']) {
      const id = channelIdentity(sign);
      expect(id.name, sign).toBe('ION Television');
      expect(id.mapped).toBe(true);
    }
  });

  it('normalizes known national feeds to display casing', () => {
    expect(channelIdentity('SUNDANCETV').name).toBe('Sundance TV');
    expect(channelIdentity('TMC').name).toBe('The Movie Channel');
    expect(channelIdentity('NICJR').name).toBe('Nick Jr.');
  });

  it('NEVER guesses: an unmapped call sign stays a call sign', () => {
    const id = channelIdentity('KTLA');
    expect(id.name).toBe('KTLA');
    expect(id.mapped).toBe(false);
  });

  it('strips only the digital-transmission tail, not real letters', () => {
    expect(channelIdentity('KABCDT').name).toBe('KABC');
  });
});

describe('paid programming is classified, never guessed', () => {
  it('flags the giveaway names and pitch shapes', () => {
    expect(isPaidProgramming({ showName: 'Paid Programming', showType: 'Variety' })).toBe(true);
    expect(isPaidProgramming({ showName: 'Inogen Portable Oxygen - No More Tanks!', showType: 'Variety' })).toBe(true);
    expect(isPaidProgramming({ showName: 'MyPillow Special Offer', showType: '' })).toBe(true);
  });

  it('does not flag real programming — even with salesy words in a title', () => {
    expect(isPaidProgramming({ showName: 'The Fugitive', showType: 'Movie' })).toBe(false);
    // A scripted episode called "Call Now" is a drama, not an infomercial.
    expect(isPaidProgramming({ showName: 'Call Now', showType: 'Scripted' })).toBe(false);
    expect(isPaidProgramming({ showName: 'Chicago Fire', showType: 'Scripted' })).toBe(false);
  });
});

describe('schedule gaps are named, not skipped', () => {
  const at = (min: number, over: Partial<Airing> = {}) =>
    airing({ id: 100 + min, airstamp: new Date(NOW + min * 60_000).toISOString(), ...over });

  it('finds the hole between two rows when the runtime proves it', () => {
    const a = at(0, { runtime: 60 }); // ends +60
    const b = at(240, { runtime: 60 }); // starts +240 → 3h hole
    const gaps = scheduleGaps([a, b]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.fromMs).toBe(NOW + 60 * 60_000);
    expect(gaps[0]!.toMs).toBe(NOW + 240 * 60_000);
  });

  it('ignores scheduling slop below the threshold', () => {
    const a = at(0, { runtime: 60 });
    const b = at(60 + MIN_GAP_MIN - 1, { runtime: 30 });
    expect(scheduleGaps([a, b])).toHaveLength(0);
  });

  it('claims nothing without a runtime — a gap needs proof of an end', () => {
    const a = at(0, { runtime: null });
    const b = at(240, { runtime: 60 });
    expect(scheduleGaps([a, b])).toHaveLength(0);
  });
});

describe('the score-scale audit', () => {
  it('reports the five-number summary', () => {
    const d = scoreDistribution([10, 20, 30, 40, 50, 60, 70, 80, 90])!;
    expect(d.min).toBe(10);
    expect(d.median).toBe(50);
    expect(d.max).toBe(90);
    expect(d.compressed).toBe(false);
  });

  it('flags a compressed scale — median above 65 means the badge stopped informing', () => {
    const d = scoreDistribution([66, 68, 70, 71, 72, 74])!;
    expect(d.compressed).toBe(true);
  });

  it('returns null with nothing to audit rather than a fake summary', () => {
    expect(scoreDistribution([])).toBeNull();
  });
});
