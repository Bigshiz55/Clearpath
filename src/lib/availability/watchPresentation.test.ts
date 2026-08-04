import { describe, it, expect } from 'vitest';
import {
  resolveWatchPresentation,
  usableOptions,
  airingStatus,
  airingWhen,
  stationLine,
  verifiedLabel,
  type StreamingOption,
  type LiveOption,
} from './watchPresentation';

/**
 * The contradiction this suite guards against: a card showing "82 · STREAM IT"
 * above "Availability not currently confirmed". Every assertion below is a
 * specific way that contradiction could come back.
 */

const NOW = new Date('2026-08-04T20:00:00-04:00');

const stream = (o: Partial<StreamingOption> & { service: string }): StreamingOption => ({
  kind: 'streaming',
  state: 'included_with_base_subscription',
  addonName: null,
  price: null,
  watchLink: null,
  lastVerifiedAt: null,
  ...o,
});

const airing = (o: Partial<LiveOption> & { network: string }): LiveOption => ({
  kind: 'live',
  station: null,
  channelNumber: null,
  startsAtIso: '2026-08-04T21:00:00-04:00',
  endsAtIso: '2026-08-04T22:00:00-04:00',
  ...o,
});

describe('unknown availability never produces a watch claim', () => {
  it('never returns "Watch now" when nothing is verified', () => {
    const p = resolveWatchPresentation({ options: [], checked: false, now: NOW });
    expect(p.status).toBe('unknown');
    expect(p.cta.kind).toBe('check_availability');
    expect(p.cta.label).toBe('Check availability');
    expect(p.cta.href).toBeNull();
  });

  it('says so in words, without implying the title is streamable', () => {
    const p = resolveWatchPresentation({ options: [], checked: false, now: NOW });
    expect(p.note).toBe('We haven’t confirmed where this is currently available.');
    expect(p.lines).toHaveLength(0);
  });

  it('distinguishes "not checked" from "checked and found nothing"', () => {
    const notChecked = resolveWatchPresentation({ options: [], checked: false, now: NOW });
    const checked = resolveWatchPresentation({ options: [], checked: true, now: NOW });
    expect(notChecked.status).toBe('unknown');
    expect(checked.status).toBe('none');
    expect(checked.cta.kind).toBe('notify_me');
    expect(checked.note).not.toBe(notChecked.note);
  });

  it('never guesses a provider — an unverified option is not a provider', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Netflix', state: 'unverified' })],
      checked: true,
      now: NOW,
    });
    expect(p.status).toBe('none');
    expect(JSON.stringify(p.lines)).not.toContain('Netflix');
  });

  it('an explicitly unavailable option is not rendered as a way to watch', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Hulu', state: 'unavailable' })],
      checked: true,
      now: NOW,
    });
    expect(p.lines).toHaveLength(0);
    expect(p.cta.kind).not.toBe('watch_now');
  });
});

describe('an original network is never presented as current availability', () => {
  it('keeps it out of the watch lines entirely', () => {
    const p = resolveWatchPresentation({ options: [], checked: false, originalNetwork: 'CBS', now: NOW });
    expect(JSON.stringify(p.lines)).not.toContain('CBS');
    expect(p.cta.kind).toBe('check_availability');
  });

  it('exposes it only as labelled history', () => {
    const p = resolveWatchPresentation({ options: [], checked: false, originalNetwork: 'CBS', now: NOW });
    expect(p.historical).toBe('Originally aired on CBS');
  });

  it('does not become a watch line even when real availability exists elsewhere', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Hulu' })],
      checked: true,
      originalNetwork: 'CBS',
      now: NOW,
    });
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]!.text).toBe('Included with Hulu');
    expect(p.historical).toBe('Originally aired on CBS');
  });
});

describe('streaming and live channels stay distinct', () => {
  it('tags each line with its own kind', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Paramount+' }), airing({ network: 'CBS' })],
      checked: true,
      now: NOW,
    });
    expect(p.lines.map((l) => l.kind)).toEqual(['live', 'streaming']);
  });

  it('renders network, station and channel number as the airing, not a service', () => {
    const p = resolveWatchPresentation({
      options: [airing({ network: 'CBS', station: 'WTVR', channelNumber: '6' })],
      checked: true,
      now: NOW,
    });
    expect(p.lines[0]!.text).toBe('CBS');
    expect(p.lines[0]!.detail).toContain('WTVR · Channel 6');
  });

  it('omits the channel number when the lineup does not supply one', () => {
    expect(stationLine(airing({ network: 'CBS', station: 'WTVR' }))).toBe('WTVR');
    expect(stationLine(airing({ network: 'CBS' }))).toBeNull();
  });
});

describe('a rental is never labelled included', () => {
  it('says rent, with the price when verified', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Prime Video', state: 'rent', price: '$2.99' })],
      checked: true,
      now: NOW,
    });
    expect(p.lines[0]!.text).toBe('Prime Video — rent $2.99');
    expect(p.lines[0]!.text).not.toMatch(/included/i);
  });

  it('omits a price rather than inventing one', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Prime Video', state: 'rent' })],
      checked: true,
      now: NOW,
    });
    expect(p.lines[0]!.text).toBe('Prime Video — rent');
    expect(p.lines[0]!.text).not.toContain('$');
  });

  it('uses the Rent / Buy call to action, never Watch now', () => {
    const rent = resolveWatchPresentation({
      options: [stream({ service: 'Apple TV', state: 'rent', watchLink: 'https://x' })],
      checked: true, now: NOW,
    });
    expect(rent.cta.kind).toBe('rent');
    const buy = resolveWatchPresentation({
      options: [stream({ service: 'Apple TV', state: 'buy', watchLink: 'https://x' })],
      checked: true, now: NOW,
    });
    expect(buy.cta.kind).toBe('buy');
  });
});

describe('add-ons and premium tiers are never folded into the base subscription', () => {
  it('names the add-on', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Prime Video', state: 'included_with_addon', addonName: 'BritBox' })],
      checked: true, now: NOW,
    });
    expect(p.lines[0]!.text).toBe('Prime Video — BritBox add-on');
  });

  it('DROPS an add-on claim with no add-on name rather than showing plain inclusion', () => {
    // Knowing "you need some add-on" but not which one is a partial fact.
    // Rendering it as ordinary inclusion would make it a false one.
    const opts = [stream({ service: 'Prime Video', state: 'included_with_addon', addonName: null })];
    expect(usableOptions(opts)).toHaveLength(0);
    const p = resolveWatchPresentation({ options: opts, checked: true, now: NOW });
    expect(p.status).toBe('none');
  });

  it('marks a premium tier as premium', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Peacock', state: 'included_with_premium_tier' })],
      checked: true, now: NOW,
    });
    expect(p.lines[0]!.text).toBe('Peacock — premium tier');
    expect(p.lines[0]!.text).not.toBe('Included with Peacock');
  });

  it('keeps free-with-ads separate from subscription inclusion', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Tubi', state: 'free_with_ads' })],
      checked: true, now: NOW,
    });
    expect(p.lines[0]!.text).toBe('Free with ads on Tubi');
  });
});

describe('live airings use the viewer’s local time', () => {
  it('classifies in-progress, upcoming and finished airings', () => {
    const inProgress = airing({ network: 'CBS', startsAtIso: '2026-08-04T19:30:00-04:00', endsAtIso: '2026-08-04T20:30:00-04:00' });
    const later = airing({ network: 'CBS', startsAtIso: '2026-08-04T21:00:00-04:00' });
    const done = airing({ network: 'CBS', startsAtIso: '2026-08-04T17:00:00-04:00', endsAtIso: '2026-08-04T18:00:00-04:00' });
    expect(airingStatus(inProgress, NOW)).toBe('live_now');
    expect(airingStatus(later, NOW)).toBe('upcoming');
    expect(airingStatus(done, NOW)).toBe('ended');
  });

  it('formats the time in the runtime zone, which in the browser is the user’s', () => {
    const o = airing({ network: 'CBS', startsAtIso: '2026-08-04T21:00:00-04:00' });
    const expected = new Date(o.startsAtIso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(airingWhen(o, NOW)).toBe(`Tonight at ${expected}`);
  });

  it('drops an airing that already ended instead of offering to tune in', () => {
    const p = resolveWatchPresentation({
      options: [airing({ network: 'CBS', startsAtIso: '2026-08-04T17:00:00-04:00', endsAtIso: '2026-08-04T18:00:00-04:00' })],
      checked: true, now: NOW,
    });
    expect(p.status).toBe('none');
    expect(p.cta.kind).not.toBe('tune_in');
  });

  it('Tune in for something on air now, Set reminder for something later', () => {
    const nowAiring = resolveWatchPresentation({
      options: [airing({ network: 'CBS', startsAtIso: '2026-08-04T19:30:00-04:00', endsAtIso: '2026-08-04T20:30:00-04:00' })],
      checked: true, now: NOW,
    });
    expect(nowAiring.cta.kind).toBe('tune_in');
    expect(nowAiring.lines[0]!.detail).toContain('Live now');

    const later = resolveWatchPresentation({
      options: [airing({ network: 'CBS', startsAtIso: '2026-08-04T21:00:00-04:00' })],
      checked: true, now: NOW,
    });
    expect(later.cta.kind).toBe('set_reminder');
  });
});

describe('the call to action always matches the verified state', () => {
  it('Watch now only for a single included option WITH a real link', () => {
    const linked = resolveWatchPresentation({
      options: [stream({ service: 'Hulu', watchLink: 'https://hulu.com/x' })],
      checked: true, now: NOW,
    });
    expect(linked.cta.kind).toBe('watch_now');
    expect(linked.cta.href).toBe('https://hulu.com/x');

    // Same inclusion, no link: there is nothing to open, so do not pretend.
    const unlinked = resolveWatchPresentation({
      options: [stream({ service: 'Hulu' })], checked: true, now: NOW,
    });
    expect(unlinked.cta.kind).toBe('view_options');
    expect(unlinked.cta.href).toBeNull();
  });

  it('View options when several verified services exist', () => {
    const p = resolveWatchPresentation({
      options: [stream({ service: 'Hulu', watchLink: 'https://a' }), stream({ service: 'Max', watchLink: 'https://b' })],
      checked: true, now: NOW,
    });
    expect(p.cta.kind).toBe('view_options');
  });

  it('never emits a href it was not given', () => {
    for (const checked of [true, false]) {
      const p = resolveWatchPresentation({ options: [], checked, now: NOW });
      expect(p.cta.href).toBeNull();
    }
  });
});

describe('ordering puts the most actionable option first', () => {
  it('a live airing in progress outranks streaming', () => {
    const p = resolveWatchPresentation({
      options: [
        stream({ service: 'Paramount+', watchLink: 'https://p' }),
        airing({ network: 'CBS', startsAtIso: '2026-08-04T19:30:00-04:00', endsAtIso: '2026-08-04T20:30:00-04:00' }),
      ],
      checked: true, now: NOW,
    });
    expect(p.lines[0]!.kind).toBe('live');
    expect(p.cta.kind).toBe('tune_in');
  });

  it('inclusion outranks rental', () => {
    const p = resolveWatchPresentation({
      options: [
        stream({ service: 'Apple TV', state: 'rent', price: '$3.99' }),
        stream({ service: 'Hulu', state: 'included_with_base_subscription' }),
      ],
      checked: true, now: NOW,
    });
    expect(p.lines[0]!.text).toBe('Included with Hulu');
  });
});

describe('freshness is surfaced only when it changes the reading', () => {
  it('stays quiet for a recent check and speaks up for a stale one', () => {
    expect(verifiedLabel(new Date(NOW.getTime() - 2 * 86_400_000).toISOString(), NOW)).toBeNull();
    expect(verifiedLabel(new Date(NOW.getTime() - 10 * 86_400_000).toISOString(), NOW)).toMatch(/over a week/);
    expect(verifiedLabel(new Date(NOW.getTime() - 100 * 86_400_000).toISOString(), NOW)).toMatch(/2 months/);
  });

  it('says nothing at all when there is no verification date', () => {
    expect(verifiedLabel(null, NOW)).toBeNull();
  });
});

describe('screen readers can tell a verdict from an availability claim', () => {
  it('labels the block as availability, never as a recommendation', () => {
    const p = resolveWatchPresentation({ options: [stream({ service: 'Hulu' })], checked: true, now: NOW });
    expect(p.ariaLabel).toMatch(/^Where to watch:/);
    expect(p.ariaLabel).toContain('Included with Hulu');
  });

  it('an unknown state announces uncertainty rather than silence', () => {
    const p = resolveWatchPresentation({ options: [], checked: false, now: NOW });
    expect(p.ariaLabel).toBe('Where to watch: not confirmed');
  });
});
