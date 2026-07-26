/**
 * How an answer is written down.
 *
 * The interview has four kinds of answer — free text, a set of tapped chips, a
 * single choice, and a list of titles — but the transcript stores one string
 * per answer. Encoding lives here rather than being open-coded in the session
 * and again in the UI, because a mismatch between the two would silently drop
 * evidence instead of failing.
 *
 * Everything round-trips, and every decoder is total: bad input yields an empty
 * result, never a throw and never a partial guess.
 */
import type { TitleRef } from './types';

export const CHIP_SEP = ',';

export function encodeChips(values: readonly string[]): string {
  return values.map((v) => v.trim()).filter(Boolean).join(CHIP_SEP);
}

export function decodeChips(value: string): string[] {
  return value.split(CHIP_SEP).map((v) => v.trim()).filter(Boolean);
}

/** A title as the picker hands it over. */
export interface PickedTitle {
  /** Stable id ("movie:603") when it came from search; null when hand-typed. */
  titleId: string | null;
  text: string;
  year?: number | null;
  /** Genre slugs, when search supplied them — drives the "why" vocabulary. */
  genres?: string[];
}

/** Free text can ride along with a title answer, and often carries the reason. */
export interface TitleAnswer {
  titles: PickedTitle[];
  note: string;
}

export function encodeTitles(titles: readonly PickedTitle[], note = ''): string {
  return JSON.stringify({
    t: titles.map((t) => ({
      i: t.titleId,
      x: t.text,
      ...(t.year != null ? { y: t.year } : {}),
      ...(t.genres?.length ? { g: t.genres } : {}),
    })),
    n: note,
  });
}

export function decodeTitles(value: string): TitleAnswer {
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== 'object') return { titles: [], note: '' };
    const obj = raw as { t?: unknown; n?: unknown };
    const list = Array.isArray(obj.t) ? obj.t : [];
    const titles: PickedTitle[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const r = item as { i?: unknown; x?: unknown; y?: unknown; g?: unknown };
      if (typeof r.x !== 'string' || r.x.trim().length === 0) continue;
      titles.push({
        titleId: typeof r.i === 'string' && r.i.length > 0 ? r.i : null,
        text: r.x.trim(),
        ...(typeof r.y === 'number' ? { year: r.y } : {}),
        ...(Array.isArray(r.g) ? { genres: r.g.filter((g): g is string => typeof g === 'string') } : {}),
      });
    }
    return { titles, note: typeof obj.n === 'string' ? obj.n : '' };
  } catch {
    return { titles: [], note: '' };
  }
}

/** A picked title as the reason graph wants it. */
export function toTitleRef(t: PickedTitle): TitleRef {
  return {
    titleId: t.titleId,
    text: t.text,
    // Only a title chosen from search is confirmed; a hand-typed one still has
    // to pass review, exactly as before.
    needsConfirmation: t.titleId === null,
  };
}
