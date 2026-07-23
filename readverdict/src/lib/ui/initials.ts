// Pure helpers for initials-based avatars. Deterministic: the same name always
// yields the same initials and the same palette slot.

/** Up to two uppercase initials from a display name. */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Number of palette slots an avatar can map onto. */
export const AVATAR_PALETTE_SIZE = 6;

/** Stable palette index (0..AVATAR_PALETTE_SIZE-1) derived from a name. */
export function avatarPaletteIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 1_000_000_007;
  }
  return Math.abs(hash) % AVATAR_PALETTE_SIZE;
}
