/**
 * SHARE CARD — pure text/data shaping for the shareable Verd1ct image.
 *
 * The actual pixels are drawn client-side on a canvas (`ShareVerdictCard`,
 * where real font metrics are available); everything that is a DECISION about
 * what the card says — how a juror's initials are derived, how vetoers are
 * named, when a long veto list gets capped with a "+N more" summary instead of
 * silently overflowing — lives here, pure and unit-tested, so those decisions
 * hold regardless of how the canvas draws them.
 *
 * No I/O, no DOM, no canvas.
 */

export interface ShareJuror {
  name: string;
  /** This juror's own fit score for the WINNING title, 0..100. */
  score: number;
}

export interface ShareVeto {
  title: string;
  /** Everyone who vetoed this title. A veto always has a vetoer. */
  byNames: string[];
}

export interface ShareCardInput {
  title: string;
  year: number | null;
  posterUrl: string | null;
  /** The winning title's group match score, 0..100 — the same number the
   *  verdict screen already shows; the card doesn't compute a new one. */
  groupScore: number;
  /** The room's own join link — the card's acquisition surface (§3). */
  joinUrl: string;
  jurors: ShareJuror[];
  vetoed: ShareVeto[];
}

/** 1–2 uppercase letters for an avatar chip. Never blank, even for odd input. */
export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Deterministic hue (0–359) so the same name always gets the same avatar
 *  color, on the card and everywhere the app colors an avatar by name. */
export function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** "A" · "A & B" · "A, B & C" — never a bare comma list, never a trailing "and". */
export function formatNames(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return 'the group';
  if (clean.length === 1) return clean[0]!;
  if (clean.length === 2) return `${clean[0]} & ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} & ${clean[clean.length - 1]}`;
}

const ELLIPSIS = '…';

/** Hard character cap — a truncation policy, not a font-metric one. The
 *  canvas renderer additionally fits text to its actual pixel box, but the
 *  DECISION of "how long is too long" is made here so it's testable. */
export function truncateTitle(title: string, max = 42): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}${ELLIPSIS}`;
}

export interface VetoLine {
  title: string;
  by: string;
}

/** The card never grows without bound for a room with many vetoes — capped,
 *  and the cut is STATED (an overflow count), never hidden. */
export const MAX_VETO_LINES = 4;

export interface VetoSection {
  lines: VetoLine[];
  /** How many more vetoed titles exist beyond `lines`. 0 = nothing was cut. */
  overflow: number;
}

export function buildVetoSection(vetoed: readonly ShareVeto[], max = MAX_VETO_LINES): VetoSection {
  const shown = vetoed.slice(0, max);
  return {
    lines: shown.map((v) => ({ title: truncateTitle(v.title, 34), by: formatNames(v.byNames) })),
    overflow: Math.max(0, vetoed.length - shown.length),
  };
}

export interface ShareCardJurorText {
  name: string;
  initials: string;
  hue: number;
  score: number;
}

export interface ShareCardText {
  title: string;
  /** '' when the year is unknown — never a fabricated one. */
  year: string;
  groupScore: number;
  jurors: ShareCardJurorText[];
  vetoes: VetoSection;
  joinUrl: string;
  /** The two-tone wordmark halves, so the renderer never hard-codes brand copy. */
  wordmark: { prefix: string; suffix: string };
}

/** Every text decision the card needs, already made. The canvas renderer
 *  measures and positions this; it invents nothing. */
export function buildShareCardText(input: ShareCardInput): ShareCardText {
  return {
    title: truncateTitle(input.title, 46),
    year: input.year != null ? String(input.year) : '',
    groupScore: Math.round(Math.min(100, Math.max(0, input.groupScore))),
    jurors: input.jurors.map((j) => ({
      name: truncateTitle(j.name, 18),
      initials: initialsFor(j.name),
      hue: hueFor(j.name),
      score: Math.round(j.score),
    })),
    vetoes: buildVetoSection(input.vetoed),
    joinUrl: input.joinUrl,
    wordmark: { prefix: 'Watch', suffix: 'VERD1CT' },
  };
}
