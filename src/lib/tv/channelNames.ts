/**
 * CHANNEL IDENTITY — a friendly name for a raw grid call sign, plus a stable
 * monogram + color so a channel is recognizable at a glance without shipping
 * (or hotlinking) anyone's logo assets.
 *
 * The grid identifies broadcast stations by FCC call sign ("KWPXDT"), which is
 * meaningless to a viewer whose cable box says "ION". The mapping below covers
 * the two cases we can name with confidence:
 *
 *   1. National feeds the grid already names sensibly (AMC, TMC, SUNDANCETV…)
 *      — normalized to their display casing.
 *   2. Broadcast affiliate call signs whose NETWORK is encoded in the sign
 *      itself: every "…PX…" station is ION Television — that is what the PX
 *      call block IS. A "-DT"/"DT" tail is just "digital transmission".
 *
 * Anything we cannot name confidently keeps its call sign — per the data
 * honesty rule, a raw-but-true "KTLA" beats a guessed "The CW".
 *
 * Pure. Unit-tested in channelGuide.test.ts.
 */

/** National channels whose grid name is already the identity — display casing. */
const DISPLAY: Record<string, string> = {
  AMC: 'AMC',
  TMC: 'The Movie Channel',
  TCM: 'TCM',
  SUNDANCETV: 'Sundance TV',
  SUNDANCE: 'Sundance TV',
  HALLMARK: 'Hallmark Channel',
  LIFETIME: 'Lifetime',
  LMN: 'LMN',
  ESPN: 'ESPN',
  ESPN2: 'ESPN2',
  SEC: 'SEC Network',
  NICKELODEON: 'Nickelodeon',
  NICKJR: 'Nick Jr.',
  NICJR: 'Nick Jr.',
  STARZ: 'Starz',
  SHOWTIME: 'Showtime',
  BRAVO: 'Bravo',
  SYFY: 'Syfy',
  USA: 'USA Network',
  TNT: 'TNT',
  TBS: 'TBS',
  FX: 'FX',
  FXX: 'FXX',
  HGTV: 'HGTV',
  FOODNETWORK: 'Food Network',
  DISCOVERY: 'Discovery',
  HISTORY: 'History',
  A_E: 'A&E',
  'A&E': 'A&E',
  ID: 'Investigation Discovery',
  CNN: 'CNN',
  MSNBC: 'MSNBC',
  FOXNEWS: 'Fox News',
  CSPAN: 'C-SPAN',
  QVC: 'QVC',
  HSN: 'HSN',
  EISC: 'EISC',
};

export interface ChannelIdentity {
  /** What the row shows. Falls back to the raw call sign — never a guess. */
  name: string;
  /** True when `name` differs from the raw sign (we actually knew it). */
  mapped: boolean;
  /** 1–3 letters for the monogram chip. */
  monogram: string;
}

/** "KWPXDT" → strip the DT/HD/CD digital-subchannel tail for matching. */
function stripTail(sign: string): string {
  return sign.replace(/[- ]?(DT|HD|CD|LD)\d?$/i, '');
}

export function channelIdentity(rawNetwork: string): ChannelIdentity {
  const raw = rawNetwork.trim();
  const upper = raw.toUpperCase().replace(/\s+/g, '');
  const direct = DISPLAY[upper];
  if (direct) return { name: direct, mapped: direct !== raw, monogram: monogramFor(direct) };

  // Broadcast call signs: 4+ letters starting K or W. The PX block is ION.
  const core = stripTail(upper);
  if (/^[KW][A-Z]{2,4}$/.test(core)) {
    if (core.includes('PX')) return { name: 'ION Television', mapped: true, monogram: 'ION' };
    // A real call sign we can't map — show it as-is, minus the DT noise.
    return { name: core, mapped: core !== raw, monogram: core.slice(0, 3) };
  }

  return { name: raw, mapped: false, monogram: monogramFor(raw) };
}

function monogramFor(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[A-Za-z0-9&]/.test(w));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0]!)
    .join('')
    .toUpperCase();
}

/** Deterministic chip hue per channel so the monogram is stable run to run. */
export function channelHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
