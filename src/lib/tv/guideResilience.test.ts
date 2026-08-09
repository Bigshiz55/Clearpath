import { describe, it, expect } from 'vitest';
import { buildChannelGuide, guideSummary } from './channelGuide';
import { rankGuideForTaste } from './channelAffinity';
import type { Airing } from '@/lib/onTv';

/**
 * PROPERTY: a valid schedule airing never disappears from the guide because
 * enrichment is missing.
 *
 * Artwork, TMDB match, critic/Verd1ct score, synopsis, episode metadata and
 * runtime are ENRICHMENTS — they may improve a card, but they are not
 * prerequisites for showing a real airing. The minimum renderable airing is
 * channel + title + start. This drives hundreds of randomized airings with
 * every enrichment field independently present-or-null and asserts that every
 * channel carrying a future airing survives buildChannelGuide + the taste rank.
 */

// Deterministic RNG (no Math.random — keeps the property reproducible).
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const NOW = Date.UTC(2026, 7, 7, 18, 0, 0);
const HOUR = 3_600_000;

function makeAiring(rnd: () => number, i: number, network: string): Airing {
  const startMs = NOW + Math.floor(rnd() * 5 + 1) * HOUR; // 1–6h out (always future)
  const maybe = <T>(v: T): T | null => (rnd() < 0.5 ? v : null);
  return {
    id: 1000 + i,
    time: '20:00',
    minutes: 20 * 60,
    airstamp: new Date(startMs).toISOString(),
    runtime: maybe(60), // often null
    network,
    showName: `Show ${i}`, // title always present — the one real requirement
    showId: 2000 + i,
    episodeName: maybe(`Episode ${i}`),
    season: maybe(1),
    number: maybe(i),
    showType: rnd() < 0.5 ? 'Movie' : 'Scripted',
    genres: rnd() < 0.5 ? ['Drama'] : [],
    rating: maybe(7.5),
    image: maybe('https://x/y.jpg'),
    summary: maybe('A synopsis.'),
    imdb: maybe('tt1234567'),
    criticImdb: maybe(7.1),
    criticRt: maybe(88),
    criticMeta: maybe(70),
    tmdbId: maybe(555),
    mediaType: maybe('movie'),
    posterPath: maybe('/p.jpg'),
    match: maybe(62),
  };
}

describe('guide resilience — enrichment is never a prerequisite', () => {
  it('every channel with a future airing survives, across 300 randomized rounds', () => {
    for (let round = 0; round < 300; round++) {
      const rnd = lcg(round + 1);
      const channelCount = 1 + Math.floor(rnd() * 12);
      const networks = Array.from({ length: channelCount }, (_, c) => `NET_${c}`);
      const airings: Airing[] = [];
      let idx = 0;
      for (const net of networks) {
        const per = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < per; k++) airings.push(makeAiring(rnd, idx++, net));
      }
      const expected = new Set(airings.map((a) => a.network));

      const rows = buildChannelGuide(airings, NOW, false);
      const ranked = rankGuideForTaste(rows, []);
      const got = new Set(ranked.map((r) => r.network));

      for (const net of expected) {
        expect(got.has(net), `round ${round}: channel ${net} (with a future airing) was dropped`).toBe(true);
      }
      expect(guideSummary(rows).channels).toBe(expected.size);
    }
  });

  it('a bare airing — no runtime, artwork, tmdb, score, synopsis, episode data — still renders', () => {
    const bare: Airing = {
      id: 1,
      time: '21:00',
      minutes: 21 * 60,
      airstamp: new Date(NOW + 2 * HOUR).toISOString(),
      runtime: null,
      network: 'MTV',
      showName: 'Ridiculousness',
      showId: 9,
      episodeName: null,
      season: null,
      number: null,
      showType: '',
      genres: [],
      rating: null,
      image: null,
      summary: null,
      imdb: null,
      tmdbId: null,
      match: null,
      posterPath: null,
    };
    const rows = buildChannelGuide([bare], NOW, false);
    const ranked = rankGuideForTaste(rows, []);
    expect(ranked.map((r) => r.network)).toContain('MTV');
  });
});
