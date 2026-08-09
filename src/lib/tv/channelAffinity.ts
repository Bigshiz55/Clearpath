/**
 * CHANNELS, RANKED BY THE USER'S OWN DNA.
 *
 * The full guide sorted alphabetically, so A&E, ACC and ACCSD owned the top of
 * a 188-channel list for every user on earth. But the app already holds a real
 * taste model — the deterministic preference rules (`detective_mystery +12`,
 * `supernatural −20`, …) that score every title. A cable channel has a
 * programming identity those same traits describe: Investigation Discovery IS
 * true-crime, Syfy IS science fiction, Travel Channel's flagship slate is
 * paranormal. So the guide can be ordered by the same DNA as everything else,
 * with no new model and no guesswork.
 *
 * HONESTY RULES:
 *  - A channel is tagged ONLY where its programming identity is defensible.
 *    Unknown channels (and ones whose slate spans everything, like the
 *    premiums) carry no tags, score zero, and keep their alphabetical place.
 *  - The score is the SUM OF THE USER'S OWN RULE WEIGHTS for matching traits —
 *    the same numbers the title engine uses. Negative rules push a channel
 *    DOWN: a viewer who avoids the supernatural sees Travel Channel sink, not
 *    just their favourites rise.
 *  - Zero-affinity channels are ordered alphabetically, exactly as before, so
 *    a user with no rules sees the guide unchanged.
 *
 * Pure. No I/O.
 */
import type { ChannelRow } from '@/lib/tv/channelGuide';
import { guideRankScore } from '@/lib/tv/guideScoring';

/** The slice of a preference rule this module needs — serializable. */
export interface TasteRule {
  trait: string;
  weight: number;
}

/**
 * Programming identity per network, in the SAME trait vocabulary as the
 * scoring engine's preference rules. Matched against the display name,
 * case-insensitively, most-specific pattern first.
 */
const CHANNEL_TRAITS: { re: RegExp; traits: string[] }[] = [
  // True crime — the genre IS the channel.
  { re: /investigation discovery|^id$/i, traits: ['grounded_crime', 'serial_killer'] },
  { re: /oxygen/i, traits: ['grounded_crime', 'serial_killer'] },
  { re: /a&e/i, traits: ['grounded_crime'] },
  { re: /court tv/i, traits: ['grounded_crime'] },
  // The Lifetime-thriller house style, named as the engine names it.
  { re: /lifetime|lmn/i, traits: ['domestic_thriller'] },
  // Genre channels.
  { re: /syfy/i, traits: ['science_fiction', 'fantasy', 'supernatural'] },
  { re: /travel channel/i, traits: ['paranormal'] }, // Ghost Adventures & co are the slate
  { re: /^tcm|turner classic/i, traits: ['noir'] },
  // Procedural-rerun homes: crime drama is the daypart staple.
  { re: /usa network/i, traits: ['grounded_crime'] },
  { re: /^ion/i, traits: ['grounded_crime'] },
  { re: /^tnt/i, traits: ['grounded_crime'] },
];

/** The engine traits a channel's programming identity carries. [] = unknown. */
export function channelTraits(network: string): string[] {
  const hit = CHANNEL_TRAITS.find((c) => c.re.test(network.trim()));
  return hit ? [...hit.traits] : [];
}

/** The user's own rule weights, summed over the channel's traits. */
export function channelAffinity(network: string, rules: readonly TasteRule[]): number {
  const traits = channelTraits(network);
  if (traits.length === 0 || rules.length === 0) return 0;
  let score = 0;
  for (const r of rules) if (traits.includes(r.trait)) score += r.weight;
  return score;
}

export type RankedChannel = ChannelRow & {
  affinity: number;
  /** True when the user's rules actively favour this channel's programming. */
  forYou: boolean;
  /** The one rank number: the programme's own engine match when one exists,
   *  else the neutral baseline nudged by channel affinity. */
  rankScore: number;
};

/**
 * Order the guide by taste WITHOUT breaking its promises: live channels still
 * lead; inside each group the rank score sorts (a scored PROGRAMME outranks a
 * channel identity — "this movie suits you 84" beats "this channel usually
 * suits you"), alphabetical breaking ties — so with no signal at all the
 * guide reads exactly as before.
 */
export function rankGuideForTaste(rows: readonly ChannelRow[], rules: readonly TasteRule[]): RankedChannel[] {
  const ranked = rows.map((r) => {
    const affinity = channelAffinity(r.network, rules);
    return { ...r, affinity, forYou: affinity > 0, rankScore: guideRankScore({ ...r, affinity }) };
  });
  return ranked.sort((a, b) => {
    // on-now first, then channels with upcoming, then schedule-unavailable last.
    const tier = (r: (typeof ranked)[number]) => (r.onNow ? 0 : r.scheduleUnavailable ? 2 : 1);
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (a.rankScore !== b.rankScore) return b.rankScore - a.rankScore;
    return a.network.localeCompare(b.network);
  });
}
