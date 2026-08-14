'use client';

import { useEffect, useState } from 'react';
import { chooseActiveCard, trailerCoordinator, type CardVisibility } from '@/lib/trailer/coordinator';

/**
 * The client glue between per-card IntersectionObserver visibility and the
 * single-active coordinator. Every trailer card reports its visibility here;
 * one rAF-throttled evaluator decides the sole winner (most-visible card that
 * has been stable past the dwell) and hands it to the coordinator — which, by
 * being single-valued, pauses whatever was playing before. This is where
 * "only one trailer, and only after real dwell" actually happens at runtime.
 */

export const MIN_VISIBILITY = 0.65;
export const DWELL_MS = 550;

interface Vis {
  ratio: number;
  visibleSinceMs: number | null;
}
const registry = new Map<string, Vis>();
let scheduled = false;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function reportVisibility(id: string, ratio: number): void {
  const prev = registry.get(id);
  const wasVisible = prev?.visibleSinceMs != null;
  const isVisible = ratio >= MIN_VISIBILITY;
  registry.set(id, {
    ratio,
    visibleSinceMs: isVisible ? (wasVisible ? prev!.visibleSinceMs : now()) : null,
  });
  schedule();
}

export function dropVisibility(id: string): void {
  registry.delete(id);
  trailerCoordinator.release(id);
  schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    evaluate();
  };
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

function evaluate(): void {
  const cards: CardVisibility[] = [...registry.entries()].map(([id, v]) => ({
    id,
    ratio: v.ratio,
    visibleSinceMs: v.visibleSinceMs,
  }));
  const winner = chooseActiveCard(cards, { nowMs: now(), minVisibility: MIN_VISIBILITY, dwellMs: DWELL_MS });
  trailerCoordinator.setActive(winner);
  // A card that is visible but still inside its dwell window cannot win yet —
  // schedule one more pass so it can take over once the dwell elapses.
  const pending = cards.some(
    (c) => c.ratio >= MIN_VISIBILITY && c.visibleSinceMs != null && now() - c.visibleSinceMs < DWELL_MS,
  );
  if (pending) setTimeout(schedule, DWELL_MS);
}

// ── THE ONE PLAYING SLOT ────────────────────────────────────────────────────
// `trailerCoordinator` above answers "which card is ELIGIBLE to autoplay".
// This answers "which card IS playing", manual or automatic, and it lives here
// rather than inside TrailerMedia so that something which is not a card — the
// More Info modal, with its own large video region — can stop a preview
// without importing a component and creating a cycle.
type PlayListener = () => void;
const playingListeners = new Set<PlayListener>();
let playingId: string | null = null;

export function claimPlaying(id: string): void {
  if (playingId === id) return;
  playingId = id;
  playingListeners.forEach((l) => l());
}

export function releasePlaying(id: string): void {
  if (playingId !== id) return;
  playingId = null;
  playingListeners.forEach((l) => l());
}

/**
 * STOP EVERY CARD PREVIEW, NOW.
 *
 * The single-active rule is enforced between cards by the two stores above,
 * but a modal is not a card: More Info opens its own trailer, and a card still
 * previewing behind it is two videos at once. This clears both the playing slot
 * (which stops whatever is open) and the autoplay-eligibility slot (which would
 * otherwise immediately restart it).
 */
export function releaseAllTrailers(): void {
  trailerCoordinator.setActive(null);
  if (playingId !== null) {
    playingId = null;
    playingListeners.forEach((l) => l());
  }
}

/** Subscribe a card to "am I the one card actually playing right now". */
export function useIsPlayingSlot(id: string): boolean {
  const [isSlot, setIsSlot] = useState(() => playingId === id);
  useEffect(() => {
    const on = () => setIsSlot(playingId === id);
    playingListeners.add(on);
    on();
    return () => {
      playingListeners.delete(on);
    };
  }, [id]);
  return isSlot;
}

/** Subscribe a card to "am I the one active trailer right now". */
export function useIsActiveTrailer(id: string): boolean {
  const [active, setActive] = useState<boolean>(false);
  useEffect(() => {
    setActive(trailerCoordinator.getActive() === id);
    return trailerCoordinator.subscribe((a) => setActive(a === id));
  }, [id]);
  return active;
}
