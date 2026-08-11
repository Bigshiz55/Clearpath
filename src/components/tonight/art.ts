/**
 * Deterministic per-title colour, shared by every card that can render without
 * artwork.
 *
 * Two components inventing their own palette is how the same film ends up two
 * different colours on two screens, which reads as a bug rather than as design.
 * One function, hashed from the id, so a title looks the same everywhere and
 * across sessions with no storage and no network.
 */

const ACCENTS = ['#38bdf8', '#f59e0b', '#a855f7', '#22c55e', '#ec4899', '#14b8a6'] as const;

export function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length]!;
}
