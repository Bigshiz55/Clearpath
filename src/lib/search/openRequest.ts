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
 *   1. THE REQUEST PERSISTS. Instead of only shouting, a request leaves a mark
 *      that outlives the moment. Whenever the sheet mounts it checks for that
 *      mark and opens if it finds one — so a request made before the listener
 *      existed is honoured a moment later instead of lost.
 *
 *   2. THE MARK CAN BE LEFT WITHOUT REACT. `PREHYDRATION_SCRIPT` installs a
 *      capture-phase click listener directly in the document, before any
 *      bundle executes. A tap on a trigger therefore registers even if NOTHING
 *      has hydrated — React later mounts, finds the mark, and opens. This is
 *      what makes "the first tap always works" true rather than merely likely.
 *
 * ── WHY THE MARK IS NOT IN THE DOM ────────────────────────────────────────
 *
 * The obvious place was an attribute on `<html>`, and it was wrong. When
 * hydration mismatches — React error #418, then #423 — React throws the whole
 * client tree away, re-renders from scratch, and RE-PATCHES THE ROOT ELEMENT'S
 * ATTRIBUTES to match what the server sent. An attribute the server never
 * rendered is deleted. Measured on a real page: the mark was set at 406ms and
 * gone at 467ms, before any component could read it.
 *
 * That is precisely backwards. Slow, janky loads are where hydration breaks
 * AND where the tap arrives early — so the mechanism vanished in exactly the
 * conditions it exists for, and the button was dead again.
 *
 * So the mark lives on `window`, which React does not own, does not reconcile,
 * and does not rebuild. It survives hydration failure and any number of
 * remounts, and it dies with the document — which is the right lifetime, since
 * a request to open search means nothing on the next page.
 *
 * Written against a duck-typed host rather than the real `window` so the rules
 * are unit-tested in node without a browser.
 */

/** Marks that someone has asked for search and it has not been shown yet. */
export const PENDING_KEY = '__wvSearchPending';

/** Put this on any element that should open search when tapped. */
export const TRIGGER_ATTR = 'data-wv-search-open';

/** The bit of `window` this module touches. */
export type PendingHost = Record<string, unknown>;

/** Record a request. Idempotent — two taps are still one pending request. */
export function markSearchRequested(host: PendingHost): void {
  host[PENDING_KEY] = true;
}

/**
 * Clear the pending request, reporting whether there was one.
 *
 * THE REQUEST IS OUTSTANDING UNTIL THE SHEET IS DISMISSED, not until it is
 * first read. Consuming on mount looked tidier and was wrong for the same
 * reason as above: React discards and re-mounts the whole client tree after a
 * hydration mismatch, and a request consumed by the first (discarded) mount had
 * already vanished by the time the surviving one looked. So mounting only READS
 * the mark (`hasPendingSearchRequest`) and closing is what clears it. Clearing
 * on close is still what makes the sheet dismissible.
 */
export function consumeSearchRequest(host: PendingHost): boolean {
  if (!host[PENDING_KEY]) return false;
  delete host[PENDING_KEY];
  return true;
}

/**
 * The live host in a browser. Kept here so every caller does not repeat the
 * cast, and so there is exactly one place that decides where the mark lives.
 */
export function searchRequestHost(): PendingHost {
  return window as unknown as PendingHost;
}

/** True while a request is outstanding. Does not consume it. */
export function hasPendingSearchRequest(host: PendingHost): boolean {
  return Boolean(host[PENDING_KEY]);
}

/**
 * Runs before hydration, in the document `<head>`, so a tap during the window
 * where nothing is interactive yet is still recorded.
 *
 * Capture phase, and it does not preventDefault or stopPropagation: React's
 * own onClick must still fire normally once it exists, and on the common path
 * (already hydrated) that handler opens the sheet immediately. This is a safety
 * net, never the primary mechanism.
 *
 * It writes to `window` and touches no DOM attribute, so it cannot itself
 * introduce a hydration mismatch.
 *
 * Deliberately tiny and dependency-free — it is inlined into the HTML, so
 * anything here costs every page load.
 */
export const PREHYDRATION_SCRIPT = `(function(){try{
document.addEventListener('click',function(e){
var t=e.target;
while(t&&t!==document){if(t.hasAttribute&&t.hasAttribute('${TRIGGER_ATTR}')){window.${PENDING_KEY}=true;break;}t=t.parentNode;}
},true);}catch(_){}})();`;
