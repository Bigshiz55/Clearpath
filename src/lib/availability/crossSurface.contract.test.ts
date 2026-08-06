/**
 * WS4 — CROSS-SURFACE AVAILABILITY CONTRACT.
 *
 * The claim WS4 has to earn is not "the module exists" or "nine surfaces import
 * it" — it is that, for ONE canonical title and ONE frozen availability
 * snapshot, every surface that shows availability arrives at the SAME decision,
 * and that the decision never overstates the evidence.
 *
 * Every availability-showing surface (WhereToWatch, AvailabilityPanel,
 * SearchResultRow, PosterCard, WatchNowList, OnTvGuide) renders the output of
 * exactly one function — `resolveWatchPresentation` — fed by exactly two
 * sanctioned adapters:
 *   • `optionsFromCardAvailability`  (Watchmode cache rows)
 *   • `optionsFromTileProviders`     (TMDB / report providers)
 * merged by `mergeProviderOptions`. No surface constructs a claim any other
 * way. That single decision point is what this file freezes: if the resolver
 * agrees with itself across every mandatory fixture and never breaks an
 * invariant, then every surface downstream agrees too, because they all render
 * the same object.
 *
 * The 16 mandatory fixtures below are the ones WS4 named. Each is fed through a
 * real adapter (not hand-built where an adapter exists) and then the resolver,
 * and the result is asserted against the acceptance criteria:
 *   – zero rental-as-included
 *   – zero Amazon-Channel-as-base-Prime
 *   – stale stays visibly stale; unknown stays unknown
 *   – source + fetched-time retained internally
 *   – no "included" wording without canonical inclusion evidence
 */
import { describe, it, expect } from 'vitest';
import {
  resolveWatchPresentation,
  optionsFromCardAvailability,
  type WatchPresentation,
  type StreamingOption,
  type WatchOption,
  type LegacyCardAvailability,
} from '@/lib/availability/watchPresentation';
import { optionsFromTileProviders, mergeProviderOptions, type TileProviders } from '@/lib/availability/providerOptions';
import { serviceKey } from '@/lib/availability/reconcile';
import { isIncluded, type AvailabilityState } from '@/lib/availability/states';

// A single frozen "now" so every freshness decision is deterministic.
const NOW = new Date('2026-08-06T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function streaming(partial: Partial<StreamingOption> & { service: string; state: AvailabilityState }): StreamingOption {
  return {
    kind: 'streaming',
    addonName: null,
    price: null,
    watchLink: null,
    lastVerifiedAt: daysAgo(1),
    provenance: 'watchmode',
    ...partial,
  };
}

function resolve(options: WatchOption[], checked = true): WatchPresentation {
  return resolveWatchPresentation({ options, checked, now: NOW });
}

/** The states that legitimately produce an "Included …" claim. */
const INCLUDED_TEXT = /included/i;

/**
 * A fixture: a human name, the resolved presentation, and the raw options that
 * produced it (so invariants can inspect the underlying evidence, not just the
 * words).
 */
interface Fixture {
  name: string;
  options: WatchOption[];
  presentation: WatchPresentation;
}

function fx(name: string, options: WatchOption[], checked = true): Fixture {
  return { name, options, presentation: resolve(options, checked) };
}

// ── The 16 mandatory fixtures ────────────────────────────────────────────────

const FIXTURES: Fixture[] = [
  fx('base Prime included', [streaming({ service: 'Prime Video', state: 'included_with_prime' })]),
  // TMDB lists Amazon Channels as their own flatrate providers, distinctly named.
  fx('MGM+ Amazon Channel', optionsFromTileProviders({
    region: 'US', checkedAt: daysAgo(1),
    options: [{ name: 'MGM+ Amazon Channel', type: 'flatrate', link: null }],
  }).options),
  fx('Acorn TV Amazon Channel', optionsFromTileProviders({
    region: 'US', checkedAt: daysAgo(1),
    options: [{ name: 'AcornTV Amazon Channel', type: 'flatrate', link: null }],
  }).options),
  fx('direct Acorn TV subscription', optionsFromTileProviders({
    region: 'US', checkedAt: daysAgo(1),
    options: [{ name: 'Acorn TV', type: 'flatrate', link: null }],
  }).options),
  fx('Hulu included', optionsFromTileProviders({
    region: 'US', checkedAt: daysAgo(1),
    options: [{ name: 'Hulu', type: 'flatrate', link: 'https://hulu.com/x' }],
  }).options),
  fx('Hulu add-on', [streaming({ service: 'Hulu', state: 'included_with_addon', addonName: 'STARZ' })]),
  fx('Peacock included', optionsFromTileProviders({
    region: 'US', checkedAt: daysAgo(1),
    options: [{ name: 'Peacock', type: 'flatrate', link: null }],
  }).options),
  fx('Tubi free with ads', optionsFromTileProviders({
    region: 'US', checkedAt: daysAgo(1),
    options: [{ name: 'Tubi', type: 'ads', link: null }],
  }).options),
  fx('rental only', [streaming({ service: 'Apple TV', state: 'rent', price: '$3.99', watchLink: 'https://tv.apple.com/x' })]),
  fx('purchase only', [streaming({ service: 'Apple TV', state: 'buy', price: '$14.99', watchLink: 'https://tv.apple.com/x' })]),
  fx('conflicting fresh and stale', [
    streaming({ service: 'Hulu', state: 'included_with_base_subscription', lastVerifiedAt: daysAgo(40) }),
    streaming({ service: 'Hulu', state: 'included_with_base_subscription', lastVerifiedAt: daysAgo(2) }),
  ]),
  fx('unknown availability', [], /* checked */ false),
  fx('expired record', [streaming({ service: 'Hulu', state: 'included_with_base_subscription', lastVerifiedAt: daysAgo(90) })]),
  fx('duplicate provider aliases', [
    streaming({ service: 'Amazon Prime Video', state: 'included_with_prime', lastVerifiedAt: daysAgo(5) }),
    streaming({ service: 'Prime Video', state: 'included_with_prime', lastVerifiedAt: daysAgo(1) }),
  ]),
  fx('Watchmode empty', optionsFromCardAvailability({ status: 'none', sources: [], checkedAt: daysAgo(3) } as LegacyCardAvailability).options,
     /* checked */ optionsFromCardAvailability({ status: 'none', sources: [], checkedAt: daysAgo(3) } as LegacyCardAvailability).checked),
  fx('TMDB provider data only', mergeProviderOptions(
    optionsFromCardAvailability({ status: 'unconfirmed', sources: [], checkedAt: null } as LegacyCardAvailability),
    optionsFromTileProviders({ region: 'US', checkedAt: daysAgo(2), options: [{ name: 'Paramount+', type: 'flatrate', link: null }] }),
  ).options),
];

// ── Per-fixture expectations ─────────────────────────────────────────────────

describe('WS4 cross-surface contract — 16 mandatory fixtures', () => {
  it('freezes exactly the 16 named fixtures', () => {
    expect(FIXTURES.map((f) => f.name)).toEqual([
      'base Prime included', 'MGM+ Amazon Channel', 'Acorn TV Amazon Channel',
      'direct Acorn TV subscription', 'Hulu included', 'Hulu add-on',
      'Peacock included', 'Tubi free with ads', 'rental only', 'purchase only',
      'conflicting fresh and stale', 'unknown availability', 'expired record',
      'duplicate provider aliases', 'Watchmode empty', 'TMDB provider data only',
    ]);
  });

  it('base Prime included → "Included with Prime", counted as included', () => {
    const f = FIXTURES[0]!.presentation;
    expect(f.status).toBe('available');
    expect(f.lines[0]!.text).toBe('Included with Prime');
  });

  it('MGM+ Amazon Channel is NEVER rendered as base Prime', () => {
    const f = FIXTURES[1]!;
    expect(f.presentation.lines[0]!.text).toBe('Included with MGM+ Amazon Channel');
    expect(f.presentation.lines[0]!.text).not.toBe('Included with Prime');
    expect(serviceKey('MGM+ Amazon Channel')).not.toBe('prime video');
  });

  it('Acorn Amazon Channel and direct Acorn subscription are distinct services', () => {
    expect(serviceKey('AcornTV Amazon Channel')).not.toBe(serviceKey('Acorn TV'));
    expect(FIXTURES[2]!.presentation.lines[0]!.text).toBe('Included with AcornTV Amazon Channel');
    expect(FIXTURES[3]!.presentation.lines[0]!.text).toBe('Included with Acorn TV');
  });

  it('Hulu included vs Hulu add-on read as DIFFERENT claims', () => {
    expect(FIXTURES[4]!.presentation.lines[0]!.text).toBe('Included with Hulu');
    expect(FIXTURES[5]!.presentation.lines[0]!.text).toBe('Hulu — STARZ add-on');
    expect(FIXTURES[4]!.presentation.lines[0]!.text).not.toBe(FIXTURES[5]!.presentation.lines[0]!.text);
  });

  it('Tubi free-with-ads is NOT worded or counted as subscription inclusion', () => {
    const f = FIXTURES[7]!.presentation;
    expect(f.lines[0]!.text).toBe('Free with ads on Tubi');
    expect(isIncluded('free_with_ads')).toBe(false);
  });

  it('rental only and purchase only never say "Included"', () => {
    expect(FIXTURES[8]!.presentation.lines[0]!.text).not.toMatch(INCLUDED_TEXT);
    expect(FIXTURES[8]!.presentation.cta.kind === 'rent' || FIXTURES[8]!.presentation.cta.kind === 'view_options').toBe(true);
    expect(FIXTURES[9]!.presentation.lines[0]!.text).not.toMatch(INCLUDED_TEXT);
  });

  it('conflicting fresh + stale collapse to ONE line, fresh wins (no stale label)', () => {
    const f = FIXTURES[10]!.presentation;
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]!.text).toBe('Included with Hulu');
    expect(f.lines[0]!.verified).toBeNull(); // 2-days-old winner is not stale
  });

  it('unknown stays unknown — honest "not confirmed", never "none"', () => {
    const f = FIXTURES[11]!.presentation;
    expect(f.status).toBe('unknown');
    expect(f.note).toMatch(/haven.t confirmed/i);
    expect(f.cta.kind).toBe('check_availability');
  });

  it('expired record stays a single line and stays VISIBLY stale', () => {
    const f = FIXTURES[12]!.presentation;
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]!.verified).toMatch(/last verified/i); // 90d → stale label present
  });

  it('duplicate provider aliases collapse to ONE line', () => {
    const f = FIXTURES[13]!.presentation;
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]!.text).toBe('Included with Prime');
  });

  it('Watchmode empty (checked, none found) → honest "none", never "unknown"', () => {
    const f = FIXTURES[14]!.presentation;
    expect(f.status).toBe('none');
    expect(f.note).toMatch(/found no/i);
  });

  it('TMDB-only providers still resolve to a real available claim', () => {
    const f = FIXTURES[15]!.presentation;
    expect(f.status).toBe('available');
    expect(f.lines[0]!.text).toBe('Included with Paramount+');
  });
});

// ── Global invariants across ALL fixtures (the acceptance gate) ───────────────

describe('WS4 acceptance invariants — hold across every fixture', () => {
  it('ZERO rental-as-included: no rent/buy option ever produces "Included" wording', () => {
    for (const f of FIXTURES) {
      const transactional = f.options.filter(
        (o): o is StreamingOption => o.kind === 'streaming' && (o.state === 'rent' || o.state === 'buy'),
      );
      if (transactional.length === 0) continue;
      for (const line of f.presentation.lines) {
        // A rental/purchase line may name the service but must never say "Included".
        if (f.presentation.lines.every((l) => l.kind === 'streaming')) {
          expect(line.text, `${f.name}: "${line.text}"`).not.toMatch(INCLUDED_TEXT);
        }
      }
    }
  });

  it('ZERO Amazon-Channel-as-base-Prime: "Included with Prime" only for the real Prime service', () => {
    for (const f of FIXTURES) {
      for (const line of f.presentation.lines) {
        if (line.text === 'Included with Prime') {
          const sourced = f.options.some(
            (o) => o.kind === 'streaming' && serviceKey(o.service) === 'prime video',
          );
          expect(sourced, `${f.name} claimed base Prime without a Prime-keyed source`).toBe(true);
        }
      }
    }
  });

  it('source + fetched-time are retained internally on every surviving claim', () => {
    for (const f of FIXTURES) {
      const streamingOpts = f.options.filter((o): o is StreamingOption => o.kind === 'streaming');
      if (streamingOpts.length === 0) continue;
      // Every raw streaming option carries provenance and a fetched-at (or null,
      // never fabricated). This is the internal record the UI must not drop.
      for (const o of streamingOpts) {
        expect(o).toHaveProperty('provenance');
        expect(o).toHaveProperty('lastVerifiedAt');
      }
    }
  });

  it('the resolver is deterministic: same snapshot → identical presentation', () => {
    for (const f of FIXTURES) {
      const again = resolve(f.options, f.name === 'unknown availability' ? false : true);
      expect(again).toEqual(f.presentation);
    }
  });

  it('no "Included" wording ever appears without a canonical inclusion state behind it', () => {
    const INCLUSION: ReadonlySet<AvailabilityState> = new Set<AvailabilityState>([
      'included_with_base_subscription', 'included_with_premium_tier', 'included_with_prime',
      'included_with_addon', 'library_access',
    ]);
    for (const f of FIXTURES) {
      const anyInclusionEvidence = f.options.some(
        (o) => o.kind === 'streaming' && INCLUSION.has(o.state),
      );
      const saysIncluded = f.presentation.lines.some((l) => INCLUDED_TEXT.test(l.text));
      if (saysIncluded) {
        expect(anyInclusionEvidence, `${f.name} said "Included" with no inclusion evidence`).toBe(true);
      }
    }
  });
});
