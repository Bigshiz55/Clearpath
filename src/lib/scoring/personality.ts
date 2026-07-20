/**
 * Watch-personality archetype — a pure, deterministic read of a user's content
 * dimension profile into a friendly label + blurb. No I/O, unit-tested. Used by
 * the "Your Watch DNA" profile; never feeds scoring.
 */
import { topDials, type DimensionProfile } from './dimensions';

export interface Personality {
  title: string;
  blurb: string;
  traits: string[]; // the decisive leans, e.g. ["Dark", "Slow burn", "Character-driven"]
}

const has = (p: DimensionProfile, key: string, dir: 'high' | 'low', by = 15) => {
  const v = p.pref[key];
  if (typeof v !== 'number') return false;
  const decisive = Math.abs(v - 50) >= by && Math.min(1, (p.weight[key] ?? 0) / 8) > 0.4;
  return decisive && (dir === 'high' ? v >= 50 : v < 50);
};

// Ordered rules — first match wins. Each is a recognizable archetype.
const RULES: { title: string; blurb: string; test: (p: DimensionProfile) => boolean }[] = [
  {
    title: 'The Slow-Burn Noir',
    blurb: 'You live for dark, deliberate stories that take their time and reward patience.',
    test: (p) => has(p, 'darkness', 'high') && has(p, 'pacing', 'low'),
  },
  {
    title: 'The Moral Gray-Zone',
    blurb: 'Antiheroes, blurred lines, no easy answers — you like your good and evil tangled.',
    test: (p) => has(p, 'morality', 'high') && has(p, 'darkness', 'high'),
  },
  {
    title: 'The Prestige Purist',
    blurb: 'Layered, character-driven, cerebral — you gravitate to the finest writing.',
    test: (p) => has(p, 'complexity', 'high') && has(p, 'character', 'high'),
  },
  {
    title: 'The Thrill Seeker',
    blurb: 'High tension, high stakes — you want to be gripped from the first minute.',
    test: (p) => has(p, 'suspense', 'high') && (has(p, 'violence', 'high') || has(p, 'pacing', 'high')),
  },
  {
    title: 'The Epic Escapist',
    blurb: 'Sweeping, world-on-the-line stories set far from the everyday.',
    test: (p) => has(p, 'stakes', 'high') && has(p, 'realism', 'low'),
  },
  {
    title: 'The Feels Chaser',
    blurb: 'You watch for the lump in your throat — big-hearted, deeply felt stories.',
    test: (p) => has(p, 'emotion', 'high') && (has(p, 'darkness', 'low') || has(p, 'warmth', 'high')),
  },
  {
    title: 'The Genre Explorer',
    blurb: 'The fantastical and the impossible — you love worlds unlike your own.',
    test: (p) => has(p, 'realism', 'low'),
  },
  {
    title: 'The Grounded Realist',
    blurb: 'True-to-life, grounded stories over spectacle — you like it real.',
    test: (p) => has(p, 'realism', 'high'),
  },
  {
    title: 'The Comfort Watcher',
    blurb: 'Warm, funny, easy to love — you watch to feel good, not to work for it.',
    test: (p) => has(p, 'humor', 'high') && (has(p, 'darkness', 'low') || has(p, 'warmth', 'high')),
  },
  {
    title: 'The Easy Streamer',
    blurb: 'Low-effort, background-friendly picks that don’t demand your full attention.',
    test: (p) => has(p, 'attention', 'low'),
  },
  {
    title: 'The Romantic',
    blurb: 'Relationships and heart are what pull you in.',
    test: (p) => has(p, 'romance', 'high'),
  },
];

export function describePersonality(profile: DimensionProfile): Personality {
  const traits = topDials(profile, 4).map((d) => d.lean);
  if (profile.samples < 3 || traits.length === 0) {
    return {
      title: 'Still Calibrating',
      blurb: 'Rate a few more titles and your watch personality will come into focus.',
      traits,
    };
  }
  const rule = RULES.find((r) => r.test(profile));
  if (rule) return { title: rule.title, blurb: rule.blurb, traits };
  return {
    title: 'Your Signature Mix',
    blurb: `A distinct blend — you lean ${traits.slice(0, 3).join(', ').toLowerCase()}.`,
    traits,
  };
}
