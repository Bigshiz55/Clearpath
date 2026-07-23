/**
 * Phase 3 — the synthetic query generator.
 *
 * Produces realistic voice searches with correct-by-construction ground truth.
 * We assemble the INTENDED NormalizedQuery + ExpectedBehavior from structured
 * choices first, then render a surface sentence, then optionally add
 * transcription noise. The sentence is never the source of truth.
 */
import { makeRng, type Rng } from './rng';
import { applyNoise, NOISE_KINDS, type NoiseKind } from './noise';
import { NETWORKS, PLATFORMS, TIMES, COUNTS, POSITIVE_PREFS, EXCLUSIONS, PERSONALIZATION, UNSUPPORTED } from './matrix';
import { emptyNormalized, type NormalizedQuery, type ExpectedBehavior, type HardConstraint } from '../contract';
import type { EvalCase, GenMode, CaseSource } from '../types';

interface Built {
  archetype: string;
  profileKey: string;
  text: string;
  intended: NormalizedQuery;
  expected: ExpectedBehavior;
  tags: string[];
}

function hc(kind: HardConstraint['kind'], description: string, value?: unknown): HardConstraint {
  return { kind, description, value };
}

/** Natural media word with count/plural agreement. */
function mediaWord(kind: 'movie' | 'tv', count: number | null): string {
  const singular = count === 1;
  if (kind === 'movie') return singular ? 'movie' : 'movies';
  return singular ? 'show' : 'shows';
}

// ── Archetype builders ──────────────────────────────────────────────────────

function scheduledPersonalized(rng: Rng): Built {
  const net = rng.pick(NETWORKS);
  const time = rng.pick(TIMES.filter((t) => t.broadcast));
  const count = rng.pick(COUNTS);
  const pers = rng.pick(PERSONALIZATION);
  const withPref = rng.bool(0.5) ? rng.pick(POSITIVE_PREFS) : null;
  const withExcl = rng.bool(0.35) ? rng.pick(EXCLUSIONS) : null;
  const mediaKind: 'movie' | 'tv' = rng.bool(0.85) ? 'movie' : 'tv';
  const media = mediaWord(mediaKind, count.n);

  const intended = emptyNormalized();
  intended.normalizedIntent = 'scheduled_broadcast_discovery';
  intended.contentTypes = [mediaKind];
  intended.networks = [net.key];
  intended.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: time.horizon ?? 24, timezone: 'USER_TIMEZONE' };
  intended.requestedCount = count.n;
  intended.personalizationRequested = pers.requested;
  intended.householdProfile = pers.household;
  if (withExcl) intended.excludedAttributes = [withExcl.attr];
  if (withPref?.mood) intended.moods = [{ ...withPref.mood, weight: 0.5, raw: withPref.say }];

  const constraints: HardConstraint[] = [
    hc('network', `must be on ${net.key}`, net.key),
    hc('time_window', `airing within ${time.horizon ?? 24}h`, time.horizon ?? 24),
    hc('content_type', `must be a ${mediaKind}`, mediaKind),
    hc('no_duplicates', 'no duplicate listings'),
    hc('no_hallucination', 'every title/airing must exist in the schedule'),
  ];
  if (count.n != null) constraints.push(hc('max_count', `at most ${count.n}`, count.n));
  if (withExcl?.attr === 'already_watched') constraints.push(hc('not_previously_watched', 'exclude watched'));
  if (withExcl?.attr === 'previously_rejected') constraints.push(hc('not_previously_rejected', 'exclude rejected'));

  // Natural phrasing: "Pull up five Lifetime movies coming on tonight that I'd like."
  const parts = [
    'Pull up',
    count.say,
    net.say[0],
    media,
    withPref ? withPref.say : '',
    rng.pick(time.say),
    pers.say,
    withExcl ? withExcl.say : '',
  ].filter(Boolean);

  return {
    archetype: 'scheduled_personalized',
    profileKey: 'scott',
    text: capitalize(parts.join(' ')) + '.',
    intended,
    expected: { intent: 'scheduled_broadcast_discovery', hardConstraints: constraints, maxResults: count.n },
    tags: ['broadcast', net.key, mediaKind, `time:${time.horizon ?? 24}h`, pers.requested ? 'personalized' : 'no-personalization'],
  };
}

function platformBrowse(rng: Rng): Built {
  const plat = rng.pick(PLATFORMS);
  const count = rng.pick(COUNTS);
  const withExcl = rng.bool(0.4) ? rng.pick(EXCLUSIONS.filter((e) => !e.attr.startsWith('__'))) : null;
  const mediaKind: 'movie' | 'tv' = rng.bool(0.7) ? 'movie' : 'tv';
  const media = mediaWord(mediaKind, count.n);

  const intended = emptyNormalized();
  intended.normalizedIntent = 'platform_browse';
  intended.contentTypes = [mediaKind];
  intended.platforms = [{ id: plat.id, name: plat.name }];
  intended.availability = { type: 'streaming', startOffsetHours: null, endOffsetHours: null, timezone: 'USER_TIMEZONE' };
  intended.requestedCount = count.n;
  intended.personalizationRequested = true;
  if (withExcl) intended.excludedAttributes = [withExcl.attr];

  const constraints: HardConstraint[] = [
    hc('platform', `must be on ${plat.name}`, plat.id),
    hc('content_type', `must be a ${mediaKind}`, mediaKind),
    hc('no_duplicates', 'no duplicates'),
    hc('no_hallucination', 'title must exist'),
  ];
  if (count.n != null) constraints.push(hc('max_count', `at most ${count.n}`, count.n));
  if (withExcl) constraints.push(hc('excluded_attribute', `no ${withExcl.attr}`, withExcl.attr));

  // Natural phrasing: always "on <Platform>" so the request reads like speech.
  const parts = ['Show me', count.say || 'the best', media, `on ${plat.name}`, withExcl ? `— ${withExcl.say}` : ''].filter(Boolean);
  return {
    archetype: 'platform_browse',
    profileKey: 'scott',
    text: capitalize(parts.join(' ')) + '.',
    intended,
    expected: { intent: 'platform_browse', hardConstraints: constraints, maxResults: count.n },
    tags: ['streaming', plat.name, mediaKind],
  };
}

function genreDiscovery(rng: Rng): Built {
  const pref = rng.pick(POSITIVE_PREFS);
  const excl = rng.bool(0.5) ? rng.pick(EXCLUSIONS.filter((e) => !e.attr.startsWith('__'))) : null;
  const intended = emptyNormalized();
  intended.normalizedIntent = 'personalized_content_discovery';
  intended.contentTypes = ['movie'];
  intended.personalizationRequested = true;
  if (excl) intended.excludedAttributes = [excl.attr];
  if (pref.mood) intended.moods = [{ ...pref.mood, weight: 0.5, raw: pref.say }];

  const constraints: HardConstraint[] = [hc('no_duplicates', 'no duplicates'), hc('no_hallucination', 'must exist')];
  if (excl) constraints.push(hc('excluded_attribute', `no ${excl.attr}`, excl.attr));

  const parts = ['Find me a', pref.say, 'movie', excl ? `, ${excl.say}` : ''].filter(Boolean);
  return {
    archetype: 'genre_discovery',
    profileKey: 'scott',
    text: capitalize(parts.join(' ')) + '.',
    intended,
    expected: { intent: 'personalized_content_discovery', hardConstraints: constraints, maxResults: null },
    tags: ['discovery', 'movie'],
  };
}

function whereToWatch(rng: Rng): Built {
  const titles = ['Oppenheimer', 'Barbie', 'The Silent Witness', 'Dune', 'Cold Harbor'];
  const title = rng.pick(titles);
  const intended = emptyNormalized();
  intended.normalizedIntent = 'where_to_watch';
  intended.watchTitle = title;
  const text = rng.pick([`Where can I watch ${title}?`, `Where's ${title} streaming?`, `Is ${title} on Netflix?`]);
  return {
    archetype: 'where_to_watch',
    profileKey: 'scott',
    text,
    intended,
    expected: { intent: 'where_to_watch', hardConstraints: [hc('no_hallucination', 'must exist')], maxResults: 1 },
    tags: ['where_to_watch'],
  };
}

function similarTo(rng: Rng): Built {
  const refs = ['Sherlock', 'Mindhunter', 'The Silent Witness', 'Breaking Bad'];
  const ref = rng.pick(refs);
  const intended = emptyNormalized();
  intended.normalizedIntent = 'similar_to';
  intended.watchTitle = ref;
  intended.personalizationRequested = true;
  return {
    archetype: 'similar_to',
    profileKey: 'scott',
    text: `Show me something similar to ${ref}.`,
    intended,
    expected: { intent: 'similar_to', hardConstraints: [hc('no_hallucination', 'must exist')], maxResults: null },
    tags: ['similar_to'],
  };
}

function unsupported(rng: Rng): Built {
  const u = rng.pick(UNSUPPORTED);
  const intended = emptyNormalized();
  intended.normalizedIntent = 'unsupported';
  intended.contentTypes = [u.type];
  return {
    archetype: 'unsupported',
    profileKey: 'scott',
    text: `Find me ${u.say}.`,
    intended,
    expected: { intent: 'unsupported', hardConstraints: [], maxResults: null, expectsRejection: true },
    tags: ['unsupported', u.type],
  };
}

function ambiguous(rng: Rng): Built {
  const templates: { text: string; ambiguities: string[]; clarify?: boolean }[] = [
    { text: 'Find something new that I have already seen.', ambiguities: ['novelty: new AND already seen'] },
    { text: 'Give me five movies, but only show me one.', ambiguities: ['count: two different counts stated'] },
    { text: 'Something light and funny but also extremely dark.', ambiguities: ['tone: asked for light AND dark'] },
    { text: 'Put on a Lifetime movie on Netflix right now.', ambiguities: ['source: a linear network AND a streaming service'] },
    { text: 'Give me a slow-burn mystery, but I do not want anything slow.', ambiguities: ['pace: asked for slow-burn AND not slow'] },
    { text: 'Find something good.', ambiguities: [], clarify: true },
  ];
  const tmpl = rng.pick(templates);
  const intended = emptyNormalized();
  intended.normalizedIntent = 'personalized_content_discovery';
  intended.ambiguities = tmpl.ambiguities;
  return {
    archetype: 'ambiguous',
    profileKey: 'scott',
    text: tmpl.text,
    intended,
    expected: {
      intent: 'personalized_content_discovery',
      hardConstraints: [hc('no_hallucination', 'must exist')],
      maxResults: null,
      expectedAmbiguities: tmpl.ambiguities,
      expectsClarification: tmpl.clarify,
    },
    tags: ['ambiguous', tmpl.clarify ? 'clarify' : 'contradiction'],
  };
}

const ARCHETYPES: { build: (rng: Rng) => Built; weight: number }[] = [
  { build: scheduledPersonalized, weight: 4 },
  { build: platformBrowse, weight: 3 },
  { build: genreDiscovery, weight: 3 },
  { build: whereToWatch, weight: 2 },
  { build: similarTo, weight: 1 },
  { build: unsupported, weight: 1 },
  { build: ambiguous, weight: 2 },
];

function weightedPick(rng: Rng): (rng: Rng) => Built {
  const total = ARCHETYPES.reduce((s, a) => s + a.weight, 0);
  let r = rng.next() * total;
  for (const a of ARCHETYPES) {
    if (r < a.weight) return a.build;
    r -= a.weight;
  }
  return ARCHETYPES[0]!.build;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Generate `count` cases deterministically from `seed`. */
export function generateCases(count: number, seed: number, source: CaseSource = 'generated'): EvalCase[] {
  const rng = makeRng(seed);
  const out: EvalCase[] = [];
  for (let i = 0; i < count; i++) {
    const build = weightedPick(rng);
    const b = build(rng);
    // apply noise (clean-biased so most cases stay readable)
    const noise: NoiseKind = rng.bool(0.55) ? 'clean' : rng.pick(NOISE_KINDS);
    const rawQuery = applyNoise(b.text, noise, rng);
    out.push({
      id: `${source}-${seed}-${i}`,
      seed: seed + i,
      source,
      archetype: b.archetype,
      profileKey: b.profileKey,
      rawQuery,
      noise,
      intended: { ...b.intended, rawQuery },
      expected: b.expected,
      tags: [...b.tags, `noise:${noise}`],
    });
  }
  return out;
}

export function sizeForMode(mode: GenMode): number {
  switch (mode) {
    case 'smoke':
      return 50;
    case 'standard':
      return 500;
    case 'full':
      return 5000;
    case 'stress':
      return 25000;
    default:
      return 50;
  }
}
