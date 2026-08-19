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
  // The Verdict Room interiors, as their harnesses mount them, so what QA
  // photographs is what a juror gets.
  '/dev/court',
  '/dev/court-vote',
];

/**
 * Full-bleed surfaces whose path carries an identifier, so no exact string can
 * name them.
 *
 * ONE ENTRY, AND IT IS ANCHORED AT BOTH ENDS. A Verdict Room is `/court/<code>`
 * and nothing else: `^/court/[^/]+$` matches a room and cannot match a
 * descendant, which is the same guarantee the exact list gives and the reason
 * this is a list of anchored patterns rather than a prefix test.
 *
 * WHY THE ROOM BELONGS HERE. It renders its own header, its own chat and no app
 * nav — it owns the screen exactly as Showdown does. The collision is measured,
 * not asserted: `tests/mobile/court-fab-collision.spec.ts` walks the room at
 * 320, 390 and 430 and reads the rectangles. The feedback button sat on the
 * tonight-setup genre chips, and the QA screenshots caught it on "Watch it" on
 * the voting floor. A tap that lands on feedback when a juror meant to vote is
 * the room's primary action silently intercepted.
 *
 * The trade is the one this file already argues for: a room gives up the global
 * feedback affordance and gets it back the moment anyone leaves it. It keeps
 * every diagnostic — the version pill is `BuildVersionBadge`, which has its own
 * visibility rules and is not gated on this predicate, and the room prints its
 * own code in its header — so nothing a support report needs is lost. Only the
 * overlay is.
 */
export const IMMERSIVE_ROUTE_PATTERNS: readonly RegExp[] = [/^\/court\/[^/]+$/];

/** Does this path own the whole screen? Exact match, or one anchored pattern. */
export function isImmersiveRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  /* EXACT, because a prefix test would swallow descendants that are ordinary
     pages. `/app` is a prefix of every signed-in route; the same mistake one
     level down would silently strip chrome from a whole subtree, and nobody
     would notice until someone went looking for the feedback button. */
  if (IMMERSIVE_ROUTES.includes(pathname)) return true;
  return IMMERSIVE_ROUTE_PATTERNS.some((re) => re.test(pathname));
}
