import type { ContentSignal } from '@/lib/types';

/**
 * TEN SCREENS OF SCROLLING, CONSOLIDATED.
 *
 * "When you touch on the show, all 10 screenshots of this information is
 * available, and you can just scroll and scroll and scroll."
 *
 * The title page was eighteen stacked cards in one column: the placard, the
 * ratings, the consensus, how the score was built, why it may / may not work,
 * your taste match, the taste dials, ten content-and-tone tiles, where to
 * watch, the season split, the Critics' Table, Theater Mode, the final verdict,
 * the watchlist controls, a 1–10 rating row, the Dossier, more like this, and a
 * finish-risk warning. Every one of them is worth having. Stacked, they made
 * the answer to "should I watch this?" the thing you scroll past on the way to
 * everything else.
 *
 * What every other service does with this problem is the same thing, and it is
 * the right thing: DECIDE ABOVE THE FOLD, EVERYTHING ELSE BEHIND TABS.
 *
 *   Netflix     — art, one-line synopsis, play/add, then Episodes · More Like
 *                 This · Details
 *   Letterboxd  — poster, rating, then Cast · Crew · Details · Genres
 *   JustWatch   — where to watch first, everything else below
 *   IMDb        — the score and the trailer, then everything under headings you
 *                 can jump to
 *
 * The split here is by QUESTION, not by data source, because the questions are
 * what people arrive with:
 *
 *   Verdict  — should I watch it, and why does it say that?
 *   Details  — what actually is it? (content, tone, who made it)
 *   Watch    — where can I put it on?
 *   Similar  — if not this, then what?
 *
 * The decision block stays OUTSIDE the tabs: score, call, ratings, the three
 * verdict controls and where-to-watch-tonight are never a tab away, because
 * they are the reason the page exists.
 */

export type ReportTab = 'verdict' | 'details' | 'watch' | 'similar';

export interface TabSpec {
  id: ReportTab;
  label: string;
  /** What the tab answers, for the accessible name. */
  hint: string;
}

export const REPORT_TABS: readonly TabSpec[] = [
  { id: 'verdict', label: 'Verdict', hint: 'why this call, and the evidence behind it' },
  { id: 'details', label: 'Details', hint: 'content, tone, cast and crew' },
  { id: 'watch', label: 'Watch', hint: 'where to watch it' },
  { id: 'similar', label: 'Similar', hint: 'more like this' },
];

export const DEFAULT_TAB: ReportTab = 'verdict';

/** Is this a tab we know? Guards a value read from a URL or storage. */
export function isReportTab(v: string | null | undefined): v is ReportTab {
  return v != null && REPORT_TABS.some((t) => t.id === v);
}

/** The tab to open on arrival, from `?tab=` — falling back to the decision. */
export function initialTab(param: string | null | undefined): ReportTab {
  return isReportTab(param) ? param : DEFAULT_TAB;
}

/**
 * CONTENT & TONE, WITHOUT SIX IDENTICAL GREY TILES.
 *
 * The grid drew a full tile for every signal including the ones we could not
 * determine, so a typical title spent half a screen on "Gore: Unknown",
 * "Sex & Nudity: Unknown", "Language: Unknown"… Saying "unknown" is the honest
 * thing and it stays — but it is one line of housekeeping, not six cards of it.
 *
 * Known levels keep their tiles. Unknown ones collapse into a single named list
 * so nothing is hidden and nothing is invented.
 */
export interface SplitSignals {
  known: ContentSignal[];
  unknown: ContentSignal[];
}

export function splitContentSignals(signals: readonly ContentSignal[]): SplitSignals {
  const known: ContentSignal[] = [];
  const unknown: ContentSignal[] = [];
  for (const s of signals) (s.level === 'unknown' ? unknown : known).push(s);
  return { known, unknown };
}

/** "Gore, Language and 4 others are not rated for this title." */
export function unknownSummary(unknown: readonly ContentSignal[]): string | null {
  if (unknown.length === 0) return null;
  const names = unknown.map((s) => s.label);
  const head = names.slice(0, 2).join(', ');
  const rest = names.length - 2;
  const subject =
    rest > 0
      ? `${head} and ${rest} other${rest === 1 ? '' : 's'}`
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : names[0]!;
  const verb = unknown.length === 1 ? 'is' : 'are';
  return `${subject} ${verb} not rated for this title — we mark that unknown rather than guess.`;
}
