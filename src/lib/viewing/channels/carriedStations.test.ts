import { describe, it, expect } from 'vitest';
import { isCarriedStationKey, uncarriedStationKeys, NATIONAL_STATION_PREFIX } from './carriedStations';

/**
 * The stale-row condition, reproduced.
 *
 * These are the exact station keys that were sitting in production after the
 * write-boundary fix shipped: three web feeds that are no longer carried, next
 * to legitimate channels stored under BOTH key schemes. The test that matters
 * most is not "the three are purged" — it is that nothing beside them is.
 */
const k = (s: string) => `${NATIONAL_STATION_PREFIX}${s}`;

describe('the three stale production stations are no longer carried', () => {
  for (const suffix of ['nbc-com', 'abc-news-live', 'cbs-news']) {
    it(`purges ${k(suffix)}`, () => {
      expect(isCarriedStationKey(k(suffix))).toBe(false);
    });
  }

  it('reproduces the production set: exactly those three go, the rest stay', () => {
    // A realistic snapshot — the twelve channels the guide was rendering.
    const stored = [
      k('abc'), k('cbs'), k('nbc'), k('cnn'), k('cnbc'),
      k('fox-news-channel'), k('fox-business-network'), k('nfl-network'), k('newsmax'),
      k('nbc-com'), k('abc-news-live'), k('cbs-news'),
    ];
    expect(uncarriedStationKeys(stored)).toEqual([k('nbc-com'), k('abc-news-live'), k('cbs-news')]);
  });
});

describe('SIMILARLY NAMED LEGITIMATE STATIONS ARE NOT REMOVED', () => {
  it('CBS survives while CBS News is purged', () => {
    expect(isCarriedStationKey(k('cbs'))).toBe(true);
    expect(isCarriedStationKey(k('cbs-news'))).toBe(false);
  });

  it('NBC survives while NBC.com is purged', () => {
    expect(isCarriedStationKey(k('nbc'))).toBe(true);
    expect(isCarriedStationKey(k('nbc-com'))).toBe(false);
  });

  it('ABC survives while ABC News Live is purged', () => {
    expect(isCarriedStationKey(k('abc'))).toBe(true);
    expect(isCarriedStationKey(k('abc-news-live'))).toBe(false);
  });

  it('every carried channel survives under its CANONICAL id', () => {
    for (const id of ['fox-news', 'fox-business', 'usa-network', 'hallmark', 'nfl-network', 'msnbc', 'mgm-plus']) {
      expect(isCarriedStationKey(k(id)), id).toBe(true);
    }
  });

  it('every carried channel survives under its LEGACY display-name slug', () => {
    // The scheme in the database before the canonical-id change. A purge that
    // only understood the new scheme would have deleted every live channel.
    for (const legacy of ['fox-news-channel', 'fox-business-network', 'usa-network', 'hallmark-channel', 'a-e', 'e', 'mgm', 'investigation-discovery']) {
      expect(isCarriedStationKey(k(legacy)), legacy).toBe(true);
    }
  });
});

describe('the purge cannot reach anything that is not its own', () => {
  it('curated Pack stations on the same lineup are never touched', () => {
    for (const other of ['hallmark-mystery-curated', 'tvmaze:lifetime', 'tvmedia:12345', 'anything-at-all']) {
      expect(isCarriedStationKey(other), other).toBe(true);
    }
  });

  it('a bare or malformed national key is purged rather than kept by accident', () => {
    expect(isCarriedStationKey(NATIONAL_STATION_PREFIX)).toBe(false);
    expect(isCarriedStationKey(`${NATIONAL_STATION_PREFIX}   `)).toBe(false);
  });

  it('is deterministic and order-preserving', () => {
    const stored = [k('nbc-com'), k('abc'), k('cbs-news'), k('cnn')];
    expect(uncarriedStationKeys(stored)).toEqual([k('nbc-com'), k('cbs-news')]);
    expect(uncarriedStationKeys(stored)).toEqual(uncarriedStationKeys(stored));
  });

  it('an empty stored set purges nothing', () => {
    expect(uncarriedStationKeys([])).toEqual([]);
  });
});

describe('the purge is fetch-independent BY CONSTRUCTION', () => {
  it('takes no fetch input at all, so a failed fetch cannot influence it', () => {
    // The reconcile compares fetched-vs-stored and must never expire after a
    // failed fetch — an empty fetch looks exactly like "everything cancelled".
    // This function's signature is the guarantee that it is a different
    // question: there is nowhere to pass a fetch result, empty or otherwise.
    expect(isCarriedStationKey.length).toBe(1);
    expect(uncarriedStationKeys.length).toBe(1);
  });

  it('a full carried lineup is never mass-deleted, however the day went', () => {
    const everything = [...new Set(['abc', 'cbs', 'nbc', 'fox', 'cnn', 'espn', 'amc', 'hallmark', 'lifetime'])].map(k);
    expect(uncarriedStationKeys(everything)).toEqual([]);
  });
});
