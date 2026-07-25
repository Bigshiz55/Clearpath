/**
 * COMBINING TONIGHT'S PREFERENCES (pure, no I/O).
 *
 * Every member fills in their OWN tonight setup — content type, what sounds
 * good, what to avoid, how much time. The room then has to act on all of them
 * at once, and the combining rules are not symmetric on purpose:
 *
 *   avoid     → UNION.    One person's hard-no is the room's hard-no. This is
 *                         the promise the product already makes ("never
 *                         suggesting something on someone's hard-no list").
 *   runtime   → STRICTEST. If anyone has 90 minutes, the room has 90 minutes.
 *   mediaType → UNANIMOUS or 'any'. Narrowing to "movie" because one person
 *                         said so would silently overrule everyone else.
 *   moods     → KEPT PER MEMBER. Never merged into one blob, because the
 *                         ranking scores each member separately and takes the
 *                         floor. Averaging tastes is exactly the failure this
 *                         product exists to avoid.
 */

export interface MemberTonight {
  kind?: 'movie' | 'tv' | 'any';
  moods?: string[];
  avoid?: string[];
  time?: 'u90' | 'u120' | 'any';
}

export interface CombinedTonight {
  /** Narrowed only when everyone who expressed a preference agrees. */
  mediaType: 'movie' | 'tv' | 'any';
  /** Union of every member's exclusions, lower-cased and deduped. */
  avoid: string[];
  /** Strictest runtime cap in minutes, or null when nobody limited it. */
  runtimeCapMinutes: number | null;
  /** Each member's own moods, in room order. Never merged. */
  perMember: { name: string; moods: string[] }[];
  /** True when at least one member actually filled anything in. */
  anyExpressed: boolean;
}

const TIME_CAP: Record<string, number | null> = { u90: 90, u120: 120, any: null };

const clean = (list: unknown): string[] =>
  Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().toLowerCase()))] : [];

export function combineTonight(members: { name: string; tonight?: MemberTonight | null }[]): CombinedTonight {
  const avoid = new Set<string>();
  const kinds = new Set<'movie' | 'tv'>();
  let cap: number | null = null;
  let anyExpressed = false;
  const perMember: { name: string; moods: string[] }[] = [];

  for (const m of members) {
    const t = m.tonight ?? {};
    const moods = clean(t.moods);
    const theirAvoid = clean(t.avoid);
    for (const a of theirAvoid) avoid.add(a);

    if (t.kind === 'movie' || t.kind === 'tv') kinds.add(t.kind);

    const theirCap = t.time ? TIME_CAP[t.time] ?? null : null;
    if (theirCap != null) cap = cap == null ? theirCap : Math.min(cap, theirCap);

    if (moods.length > 0 || theirAvoid.length > 0 || (t.kind && t.kind !== 'any') || (t.time && t.time !== 'any')) {
      anyExpressed = true;
    }
    perMember.push({ name: m.name, moods });
  }

  // Unanimous only: one dissenting (or absent) preference reopens it to 'any'.
  const mediaType = kinds.size === 1 ? [...kinds][0]! : 'any';

  return {
    mediaType,
    avoid: [...avoid].sort(),
    runtimeCapMinutes: cap,
    perMember,
    anyExpressed,
  };
}

/**
 * Does this title break somebody's exclusion? Matched against genres and the
 * title's own descriptive attributes. A hard-no is a GATE, never a penalty —
 * scoring a disliked title slightly lower still lets it win a weak round.
 */
export function violatesAvoid(avoid: string[], haystack: string[]): boolean {
  if (avoid.length === 0) return false;
  const hay = haystack.map((h) => h.toLowerCase());
  return avoid.some((a) => hay.some((h) => h === a || h.includes(a)));
}
