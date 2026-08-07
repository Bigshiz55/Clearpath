/**
 * ACTIVE-TRAILER COORDINATOR.
 *
 * The single most important runtime invariant of the whole feature:
 *
 *   AT MOST ONE TRAILER MAY PLAY AT A TIME.
 *
 * Two parts, both here so the guarantee is unit-testable:
 *
 *  1. `chooseActiveCard` — a PURE decision: given the current visibility of
 *     every candidate card and how long each has been stably visible, pick the
 *     single card eligible to become active (or none). A card qualifies only if
 *     it is sufficiently visible AND has stayed that way past a short dwell, so
 *     rapid scrolling never spins up players. The most-visible qualifying card
 *     wins; ties break deterministically by id.
 *
 *  2. `TrailerCoordinator` — a tiny store holding the ONE active id. Setting a
 *     new active necessarily clears the previous (the store cannot hold two),
 *     which is what guarantees a scrolled-away card is paused before the next
 *     one starts. Framework-agnostic; the React hook subscribes to it.
 */

export interface CardVisibility {
  id: string;
  /** 0–1 fraction of the card currently visible. */
  ratio: number;
  /** ms timestamp since which `ratio` has continuously been >= threshold.
   *  null when the card is not currently past the visibility threshold. */
  visibleSinceMs: number | null;
}

export interface ChooseOptions {
  nowMs: number;
  /** Minimum visible fraction to be eligible at all. */
  minVisibility: number;
  /** How long a card must stay visible before it may become active. */
  dwellMs: number;
}

/**
 * The single card eligible to be the active trailer right now, or null.
 * Pure and deterministic.
 */
export function chooseActiveCard(cards: readonly CardVisibility[], opts: ChooseOptions): string | null {
  const eligible = cards.filter(
    (c) =>
      c.ratio >= opts.minVisibility &&
      c.visibleSinceMs != null &&
      opts.nowMs - c.visibleSinceMs >= opts.dwellMs,
  );
  if (eligible.length === 0) return null;
  // Most-visible wins; deterministic id tiebreak so the choice never flickers
  // between two equally-visible cards.
  eligible.sort((a, b) => (b.ratio - a.ratio) || (a.id < b.id ? -1 : 1));
  return eligible[0]!.id;
}

export type ActiveListener = (activeId: string | null) => void;

/**
 * Holds the ONE active trailer id. By construction it cannot hold two, so a
 * new winner always displaces (and thereby pauses) the previous one.
 */
export class TrailerCoordinator {
  private activeId: string | null = null;
  private listeners = new Set<ActiveListener>();

  getActive(): string | null {
    return this.activeId;
  }

  /** Make `id` the sole active trailer (or clear with null). No-op if unchanged. */
  setActive(id: string | null): void {
    if (id === this.activeId) return;
    this.activeId = id;
    for (const l of this.listeners) l(this.activeId);
  }

  /** Release only if `id` is the current active one (avoids a late release from
   *  a scrolled-away card clobbering the new winner). */
  release(id: string): void {
    if (this.activeId === id) this.setActive(null);
  }

  subscribe(l: ActiveListener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

/** Process-wide singleton — the one coordinator every card shares. */
export const trailerCoordinator = new TrailerCoordinator();
