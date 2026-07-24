/**
 * Court "Genre Draft" — per-participant deck generation. PURE.
 *
 * Each juror gets ~12 candidates built from a shared, filtered pool:
 *   6 shared      — the same broadly-relevant titles for everyone
 *   3 personalized — best fit to THIS juror's Watch DNA
 *   2 wildcard    — discovery picks (decent fit, less obvious)
 *   1 divisive    — the title the jury most disagrees on (measures compromise)
 *
 * Every candidate must satisfy the host's genre / media / runtime / availability
 * filters. We never insert filler to reach 12 — fewer reliable candidates → a
 * shorter deck. No duplicate titles; at most one title per franchise per deck.
 */
import { dimensionMatch } from '@/lib/scoring/dimensions';
import type { CourtCandidate, CourtParticipant, Deck, DeckFilters, DeckSlot } from './types';

const DECK_TARGET = 12;
const N_SHARED = 6;
const N_PERSONAL = 3;
const N_WILDCARD = 2;
const N_DIVISIVE = 1;

/** Affinity of one juror for one candidate, 0..1. Uses DNA when both sides have a
 *  fingerprint; otherwise a neutral 0.5 nudged by an explicit "love". */
export function affinity01(p: CourtParticipant, c: CourtCandidate): number {
  let base = 0.5;
  if (p.profile && c.dimensions) base = clamp01(dimensionMatch(c.dimensions, p.profile) / 100);
  if (p.love?.includes(c.key)) base = clamp01(base + 0.3);
  return base;
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function variance(xs: number[]): number { const m = mean(xs); return xs.length ? mean(xs.map((x) => (x - m) ** 2)) : 0; }

/** True when a candidate passes the host's hard filters. */
export function passesFilters(c: CourtCandidate, f: DeckFilters): boolean {
  if (f.mediaType !== 'any' && c.mediaType !== f.mediaType) return false;
  if (f.genreId != null && !c.genreIds.includes(f.genreId)) return false;
  if (f.maxRuntime != null && c.runtime != null && c.runtime > f.maxRuntime) return false;
  if ((f.requireAvailable ?? true) && !c.available) return false;
  return true;
}

/** Eligible pool for a specific juror (adds their watched-title exclusion). */
function eligibleFor(pool: CourtCandidate[], p: CourtParticipant, f: DeckFilters): CourtCandidate[] {
  const watched = new Set(p.watched ?? []);
  return pool.filter((c) => passesFilters(c, f) && !(f.avoidWatched && watched.has(c.key)));
}

/** Add a candidate to a deck if it isn't a dup and respects the franchise cap. */
function tryAdd(slots: DeckSlot[], franchiseCount: Map<string, number>, c: CourtCandidate, kind: DeckSlot['kind'], maxPerFranchise: number): boolean {
  if (slots.some((s) => s.candidate.key === c.key)) return false;
  if (c.franchise) {
    const n = franchiseCount.get(c.franchise) ?? 0;
    if (n >= maxPerFranchise) return false;
    franchiseCount.set(c.franchise, n + 1);
  }
  slots.push({ candidate: c, kind });
  return true;
}

/** Stable, deterministic sort by score desc then key asc (no Math.random). */
function byScore<T>(items: T[], score: (t: T) => number, key: (t: T) => string): T[] {
  return [...items].sort((a, b) => score(b) - score(a) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

export function buildDecks(participants: CourtParticipant[], pool: CourtCandidate[], filters: DeckFilters): Deck[] {
  const maxPerFranchise = filters.maxPerFranchise ?? 1;
  const globallyEligible = pool.filter((c) => passesFilters(c, filters));

  // Shared six — the titles with the highest MEAN affinity across the whole jury.
  const shared = byScore(
    globallyEligible,
    (c) => mean(participants.map((p) => affinity01(p, c))),
    (c) => c.key,
  ).slice(0, N_SHARED);
  const sharedKeys = new Set(shared.map((c) => c.key));

  // The most divisive title — highest disagreement (variance of affinity) — is the
  // same probe for everyone; it measures willingness to compromise.
  const divisive = byScore(
    globallyEligible.filter((c) => !sharedKeys.has(c.key)),
    (c) => variance(participants.map((p) => affinity01(p, c))),
    (c) => c.key,
  )[0] ?? null;

  return participants.map((p) => {
    const slots: DeckSlot[] = [];
    const franchiseCount = new Map<string, number>();
    const eligible = eligibleFor(pool, p, filters);
    const eligibleKeys = new Set(eligible.map((c) => c.key));

    const used = () => new Set(slots.map((s) => s.candidate.key));

    // 1) Shared (only those this juror is also eligible for).
    for (const c of shared) { if (eligibleKeys.has(c.key)) tryAdd(slots, franchiseCount, c, 'shared', maxPerFranchise); }

    // 2) Divisive probe — reserved BEFORE personalized/wildcard so it isn't claimed
    //    as another kind first.
    if (divisive && eligibleKeys.has(divisive.key) && !sharedKeys.has(divisive.key)) {
      tryAdd(slots, franchiseCount, divisive, 'divisive', maxPerFranchise);
    }
    const divisiveKey = divisive?.key;

    // 3) Personalized — best DNA fit not already placed.
    const personalPool = byScore(eligible.filter((c) => !used().has(c.key) && !sharedKeys.has(c.key) && c.key !== divisiveKey), (c) => affinity01(p, c), (c) => c.key);
    for (const c of personalPool) { if (countKind(slots, 'personalized') >= N_PERSONAL) break; tryAdd(slots, franchiseCount, c, 'personalized', maxPerFranchise); }

    // 4) Wildcard / discovery — decent fit but LESS obvious: not loved, and novel to
    //    the jury (low mean affinity across others), yet still positive for this juror.
    const others = participants.filter((q) => q.id !== p.id);
    const discovery = byScore(
      eligible.filter((c) => !used().has(c.key) && !(p.love?.includes(c.key))),
      (c) => 0.6 * affinity01(p, c) + 0.4 * (1 - mean(others.map((q) => affinity01(q, c)))),
      (c) => c.key,
    );
    for (const c of discovery) { if (countKind(slots, 'wildcard') >= N_WILDCARD) break; tryAdd(slots, franchiseCount, c, 'wildcard', maxPerFranchise); }

    // 5) Top up toward 12 with the next-best personal fits — but ONLY real, eligible,
    //    non-dup, franchise-respecting titles. Never pad past what's available.
    if (slots.length < DECK_TARGET) {
      const fill = byScore(eligible.filter((c) => !used().has(c.key)), (c) => affinity01(p, c), (c) => c.key);
      for (const c of fill) { if (slots.length >= DECK_TARGET) break; tryAdd(slots, franchiseCount, c, 'personalized', maxPerFranchise); }
    }

    return { participantId: p.id, slots: slots.slice(0, DECK_TARGET) };
  });
}

function countKind(slots: DeckSlot[], kind: DeckSlot['kind']): number {
  return slots.reduce((n, s) => n + (s.kind === kind ? 1 : 0), 0);
}
