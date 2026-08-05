/**
 * "I TAPPED SEARCH AND NOTHING HAPPENED."
 *
 * The trigger and the sheet are separate React trees that hydrate
 * independently. The old wiring was a one-shot CustomEvent:
 *
 *     window.dispatchEvent(new CustomEvent('wv:quick-search'))
 *
 * A CustomEvent is delivered to whoever is listening AT THAT INSTANT and is
 * then gone forever. On a slow phone the trigger's own hydration can finish
 * before `QuickSearch` has mounted its listener, so the tap fires an event
 * into an empty room. The button is not broken and the sheet is not broken —
 * the message just falls on the floor, and the user taps a dead button.
 *
 * Two changes fix it, and both are needed:
 *
 *   1. THE REQUEST PERSISTS. Instead of only shouting, a request also leaves a
 *      mark on `<html>`. Whenever the sheet mounts it checks for that mark and
 *      opens if it finds one — so a request made before the listener existed
 *      is honoured a moment later instead of lost. An attribute rather than a
 *      React state or a module variable because it survives the two things that
 *      break the others: code that has not run yet, and a component that
 *      unmounts and mounts again. The second one is not hypothetical — a
 *      hydration mismatch anywhere on the page makes React throw the whole
 *      client tree away and rebuild it, which destroyed the request when it
 *      lived in `useState`.
 *
 *   2. THE MARK CAN BE LEFT WITHOUT REACT. `PREHYDRATION_SCRIPT` installs a
 *      capture-phase click listener directly in the document, before any
 *      bundle executes. A tap on a trigger therefore registers even if NOTHING
 *      has hydrated — React later mounts, finds the mark, and opens. This is
 *      what makes "the first tap always works" true rather than merely likely.
 *
 * Pure and DOM-agnostic (a duck-typed `RootLike`, not `HTMLElement`) so the
 * rules are unit-tested in node without a browser.
 */

/** Marks that someone has asked for search and it has not been shown yet. */
export const PENDING_ATTR = 'data-wv-search-pending';

/** Put this on any element that should open search when tapped. */
export const TRIGGER_ATTR = 'data-wv-search-open';

/** The bit of `document.documentElement` this module touches. */
export interface RootLike {
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** Record a request. Idempotent — two taps are still one pending request. */
export function markSearchRequested(root: RootLike): void {
  root.setAttribute(PENDING_ATTR, '1');
}

/**
 * Clear the pending request, reporting whether there was one.
 *
 * THE REQUEST IS OUTSTANDING UNTIL THE SHEET IS DISMISSED, not until it is
 * first read. Consuming on mount looked tidier and was wrong: React discards
 * and re-mounts the whole client tree after a hydration mismatch, and a request
 * consumed by the first (discarded) mount had already vanished by the time the
 * surviving one looked for it — the tap died exactly as before, on the slow
 * loads where mismatches actually happen. So mounting only READS the mark
 * (`hasPendingSearchRequest`) and closing is what clears it. Clearing on close
 * is still what makes the sheet dismissible.
 */
export function consumeSearchRequest(root: RootLike): boolean {
  if (!root.hasAttribute(PENDING_ATTR)) return false;
  root.removeAttribute(PENDING_ATTR);
  return true;
}

/** True while a request is outstanding. Does not consume it. */
export function hasPendingSearchRequest(root: RootLike): boolean {
  return root.hasAttribute(PENDING_ATTR);
}

/**
 * Runs before hydration, in the document `<head>`, so a tap during the window
 * where nothing is interactive yet is still recorded.
 *
 * Capture phase, and it does not preventDefault or stopPropagation: React's
 * own onClick must still fire normally once it exists, and on the common path
 * (already hydrated) that handler opens the sheet immediately and consumes the
 * mark. This is a safety net, never the primary mechanism.
 *
 * Deliberately tiny and dependency-free — it is inlined into the HTML, so
 * anything here costs every page load.
 */
export const PREHYDRATION_SCRIPT = `(function(){try{
document.addEventListener('click',function(e){
var t=e.target;
while(t&&t!==document){if(t.hasAttribute&&t.hasAttribute('${TRIGGER_ATTR}')){document.documentElement.setAttribute('${PENDING_ATTR}','1');break;}t=t.parentNode;}
},true);}catch(_){}})();`;
