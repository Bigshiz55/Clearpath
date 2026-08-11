/**
 * ROUTES THAT OWN THE WHOLE SCREEN.
 *
 * Global chrome — the feedback button, the build badge — is positioned `fixed`
 * against the viewport, which is correct on an ordinary scrolling page and
 * wrong on a full-bleed one. On Showdown the feedback FAB sits bottom-left, on
 * top of the left poster's title and year: the primary content of a game whose
 * entire mechanic is recognising the film in front of you.
 *
 * WHY A SHARED LIST AND NOT PADDING. Padding the poster would move the collision
 * rather than remove it — the FAB is fixed, so it lands wherever the viewport
 * puts it, and the next full-bleed surface would rediscover the same bug. It
 * would also distort a layout that is deliberately edge-to-edge. Suppression is
 * what the codebase already does (`FeedbackButton` on `/`, `BuildBadge` on
 * `/app/taste-quiz`); those were one-off pathname checks drifting apart, so this
 * is the same decision made once, in a place both can read.
 *
 * The trade is deliberate: an immersive route gives up its feedback affordance
 * for the length of a ninety-second game, and gets it back the moment the
 * player lands anywhere else. Obscuring the thing the player must read to play
 * is the worse outcome.
 *
 * Pure data. No React, no I/O — importable from a client component or a test.
 */

/** Exact paths that render a full-bleed surface and must not be overlaid. */
export const IMMERSIVE_ROUTES: readonly string[] = [
  '/app/showdown',
  '/app/tonight',
  '/dev/dna-showdown',
  '/app/taste-quiz',
];

/** Does this path own the whole screen? Exact match — never a prefix. */
export function isImmersiveRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  /* EXACT, because a prefix test would swallow descendants that are ordinary
     pages. `/app` is a prefix of every signed-in route; the same mistake one
     level down would silently strip chrome from a whole subtree, and nobody
     would notice until someone went looking for the feedback button. */
  return IMMERSIVE_ROUTES.includes(pathname);
}
