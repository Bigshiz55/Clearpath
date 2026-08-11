import { describe, it, expect } from 'vitest';
import {
  classifySourceChannel,
  isCarriedLinear,
  LINEAR_CHANNELS,
  normalizeChannelName,
  resolveLinearChannel,
  summarizeCoverage,
  webChannelId,
} from './channelIdentity';

/**
 * The guide showed three channels that do not exist. These are the tests that
 * would have caught that, written so they fail for the RIGHT reason: not
 * "NBC.COM is absent from the output" (a UI filter would satisfy that) but
 * "NBC.COM cannot be resolved to a linear channel, and a web-only row cannot
 * be classified as linear even when it is named exactly like one".
 */

describe('normalizeChannelName', () => {
  it('folds case and spacing so one channel has one key', () => {
    expect(normalizeChannelName('FOX  News   Channel')).toBe('fox news channel');
    expect(normalizeChannelName(' NBC ')).toBe('nbc');
  });

  it('turns punctuation into a boundary, which is what separates NBC from NBC.com', () => {
    expect(normalizeChannelName('NBC.com')).toBe('nbc com');
    expect(normalizeChannelName('NBC')).toBe('nbc');
    expect(normalizeChannelName('NBC.com')).not.toBe(normalizeChannelName('NBC'));
  });
});

describe('resolveLinearChannel — ACCEPT the channels we carry', () => {
  const ACCEPT: [string, string][] = [
    ['ABC', 'abc'],
    ['CBS', 'cbs'],
    ['NBC', 'nbc'],
    ['FOX', 'fox'],
    ['CNN', 'cnn'],
    ['CNBC', 'cnbc'],
    ['FOX News Channel', 'fox-news'],
    ['Fox Business Network', 'fox-business'],
    ['NFL Network', 'nfl-network'],
    ['ESPN', 'espn'],
    ['AMC', 'amc'],
    ['USA Network', 'usa-network'],
    ['TNT', 'tnt'],
    ['HGTV', 'hgtv'],
    ['Discovery', 'discovery'],
    ['Hallmark Channel', 'hallmark'],
  ];

  for (const [name, id] of ACCEPT) {
    it(`accepts ${name}`, () => {
      const ch = resolveLinearChannel(name);
      expect(ch, `${name} was rejected`).not.toBeNull();
      expect(ch!.kind).toBe('linear');
      expect(ch!.id).toBe(id);
    });
  }

  it('is case- and spacing-insensitive without becoming fuzzy', () => {
    expect(resolveLinearChannel('  fox   NEWS   channel ')!.id).toBe('fox-news');
  });

  it('collapses alternate spellings of ONE channel to ONE identity', () => {
    // Two names, one channel — this is what stops a duplicate card.
    expect(resolveLinearChannel('Fox News')!.id).toBe(resolveLinearChannel('Fox News Channel')!.id);
    expect(resolveLinearChannel('MSNBC')!.id).toBe(resolveLinearChannel('MS NOW')!.id);
    expect(resolveLinearChannel('Nat Geo')!.id).toBe(resolveLinearChannel('National Geographic')!.id);
    expect(resolveLinearChannel('EPIX')!.id).toBe(resolveLinearChannel('MGM+')!.id);
  });

  it('carries the networks the source actually sends that we used to reject', () => {
    // Measured live: MS NOW 13 airings/day, NewsNation 10 — both invisible
    // before, because the allowlist knew MSNBC by its old name and had never
    // heard of NewsNation.
    expect(resolveLinearChannel('MS NOW')).not.toBeNull();
    expect(resolveLinearChannel('NewsNation')).not.toBeNull();
  });
});

describe('resolveLinearChannel — REJECT what is not a linear channel', () => {
  const REJECT = [
    'NBC.COM',
    'NBC.com',
    'ABC News Live',
    'CBS News',
    'ESPN+',
    'Syndication',
    'ABCDEFG Network',
    'Foxtel',
    'NestFlix Regional',
    'WKRP Cincinnati 12',
    'CBSN',
    'NBC News NOW',
    '',
    '   ',
  ];

  for (const name of REJECT) {
    it(`rejects ${JSON.stringify(name)}`, () => {
      expect(resolveLinearChannel(name), `${name} was admitted as a linear channel`).toBeNull();
    });
  }

  it('rejects null and undefined rather than throwing', () => {
    expect(resolveLinearChannel(null)).toBeNull();
    expect(resolveLinearChannel(undefined)).toBeNull();
  });

  it('NO PREFIX MATCHING — a longer name is not the channel it starts with', () => {
    // The exact defect: "nbc.com".startsWith("nbc") used to be enough.
    expect(resolveLinearChannel('NBC')).not.toBeNull();
    expect(resolveLinearChannel('NBC.com')).toBeNull();
    expect(resolveLinearChannel('NBCUniversal')).toBeNull();
    expect(resolveLinearChannel('ABC News')).toBeNull();
    expect(resolveLinearChannel('CBS Sports HQ')).toBeNull();
  });
});

describe('classifySourceChannel — linear and web can never collapse', () => {
  it('a network row resolves to a linear channel', () => {
    const c = classifySourceChannel({ networkName: 'NBC' });
    expect(c).toEqual({ kind: 'linear', id: 'nbc', name: 'NBC', category: 'broadcast' });
  });

  it('a webChannel row is a WEB channel, never linear', () => {
    const c = classifySourceChannel({ webChannelName: 'NBC.com' });
    expect(c!.kind).toBe('web');
    expect(c!.id).toBe('web:nbc-com');
  });

  it('THE CORE GUARANTEE: a web feed named exactly like a network stays web', () => {
    // Even a perfect name match must not promote a streaming feed to a channel.
    // The decision comes from which FIELD was populated, not from the string.
    const c = classifySourceChannel({ webChannelName: 'NBC' });
    expect(c!.kind, 'a web feed was promoted to a linear channel').toBe('web');
    expect(isCarriedLinear({ webChannelName: 'NBC' })).toBe(false);
    expect(isCarriedLinear({ webChannelName: 'Hallmark Channel' })).toBe(false);
  });

  it('the three real offenders from the guide are all refused as linear', () => {
    for (const name of ['NBC.COM', 'ABC News Live', 'CBS News']) {
      expect(isCarriedLinear({ webChannelName: name }), `${name} became a channel`).toBe(false);
      const c = classifySourceChannel({ webChannelName: name });
      expect(c!.kind).toBe('web');
    }
  });

  it('a network name we do not carry is null — not silently downgraded to web', () => {
    expect(classifySourceChannel({ networkName: 'Syndication' })).toBeNull();
    // …and it does NOT fall through to the webChannel field when both exist.
    expect(classifySourceChannel({ networkName: 'Syndication', webChannelName: 'Peacock' })).toBeNull();
  });

  it('prefers the linear field when a row carries both', () => {
    const c = classifySourceChannel({ networkName: 'CBS', webChannelName: 'Paramount+' });
    expect(c).toMatchObject({ kind: 'linear', id: 'cbs' });
  });

  it('an empty ref is null', () => {
    expect(classifySourceChannel({})).toBeNull();
    expect(classifySourceChannel({ networkName: '  ', webChannelName: '  ' })).toBeNull();
  });
});

describe('identity registry integrity', () => {
  it('every canonical id is unique — two entries cannot both own a channel', () => {
    const ids = LINEAR_CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every display name resolves back to its own channel (round-trip)', () => {
    for (const ch of LINEAR_CHANNELS) {
      const back = resolveLinearChannel(ch.name);
      expect(back, `${ch.name} does not resolve to itself`).not.toBeNull();
      expect(back!.id).toBe(ch.id);
    }
  });

  it('web ids are namespaced so they can never collide with a linear id', () => {
    const linearIds = new Set(LINEAR_CHANNELS.map((c) => c.id));
    for (const n of ['NBC', 'NBC.com', 'ESPN+', 'Peacock']) {
      expect(linearIds.has(webChannelId(n))).toBe(false);
      expect(webChannelId(n).startsWith('web:')).toBe(true);
    }
  });
});

describe('summarizeCoverage — the guide can only claim what it measured', () => {
  it('counts channels with listings, and web feeds refused', () => {
    const cov = summarizeCoverage([
      { networkName: 'CNN' },
      { networkName: 'CNN' }, // same channel twice → one channel
      { networkName: 'Fox News Channel' },
      { networkName: 'Fox News' }, // alias of the same channel → still one
      { webChannelName: 'NBC.com' },
      { webChannelName: 'ABC News Live' },
      { networkName: 'Syndication' },
    ]);
    expect(cov.withListings).toBe(2); // CNN + Fox News, deduped
    expect(cov.webFeedsRejected).toBe(2);
    expect(cov.unknownLinearNames).toEqual(['Syndication']);
    expect(cov.carried).toBe(LINEAR_CHANNELS.length);
  });

  it('never reports more channels-with-listings than channels carried', () => {
    const cov = summarizeCoverage(LINEAR_CHANNELS.map((c) => ({ networkName: c.name })));
    expect(cov.withListings).toBeLessThanOrEqual(cov.carried);
    expect(cov.withListings).toBe(LINEAR_CHANNELS.length);
  });

  it('an empty window claims nothing', () => {
    const cov = summarizeCoverage([]);
    expect(cov.withListings).toBe(0);
    expect(cov.webFeedsRejected).toBe(0);
  });
});
