/**
 * SEARCH, FROM ANYWHERE.
 *
 * "There also needs to be a way that somewhere at the top is a search button
 * that's always there no matter what screen you're on. In case something pops
 * in your mind, you're like, I wonder if that was rated good."
 *
 * That is a different job from the search box on the home screen. The home box
 * is where you go to start something; this is for the thought that arrives
 * while you are already doing something else — halfway down a title page, mid
 * way through ruling a stack. The cost of that thought is currently: leave the
 * screen you are on, go home, scroll up, type. Which means the thought is
 * usually just lost.
 *
 * The header cannot carry it on a phone. Header plus build badge is ~148px, and
 * sticking that means 148px of every screen is permanently chrome — which was
 * itself a complaint ("it chops off the top"). So the always-there control is a
 * single 44px button, and the search itself is a sheet over the top.
 *
 * This module is the pure part: where a query goes, and what counts as asking
 * for the sheet. Kept apart from the component so the routing and the keyboard
 * rules can be tested without a browser.
 */

/** Ask the Judge is the one front door for a typed query. */
export const SEARCH_ROUTE = '/app/ask';

/** Matches the route's own `slice(0, 300)`, so what is sent is what is read. */
export const MAX_QUERY = 300;

/**
 * Where a typed query goes, or null when there is nothing to ask.
 *
 * Null rather than a bare `/app/ask`: submitting an empty box should do
 * NOTHING, not navigate you off the screen you were on. Losing your place is
 * the exact cost this control exists to remove.
 */
export function quickSearchHref(raw: string): string | null {
  const q = raw.trim().slice(0, MAX_QUERY);
  if (q.length === 0) return null;
  return `${SEARCH_ROUTE}?q=${encodeURIComponent(q)}`;
}

/**
 * Fields that own the keystroke — a shortcut must never eat someone's typing.
 *
 * Duck-typed rather than `instanceof HTMLElement`: this has to be decidable
 * without a DOM (it is unit-tested in node), and `instanceof` is also wrong
 * across realms — an element inside an iframe fails the check and would start
 * swallowing slashes.
 */
function isTyping(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** Typed `unknown` because the check is duck-typed — see `isTyping`. */
  target?: unknown;
}

/**
 * Does this keystroke mean "open search"?
 *
 * ⌘K / Ctrl-K works everywhere, including inside a text field — it is
 * unambiguous and it is what every other app on the machine has trained people
 * to press. A bare `/` only counts when nothing is being typed into, or the
 * shortcut would swallow slashes out of somebody's sentence.
 */
export function opensSearch(e: KeyLike): boolean {
  if (e.altKey) return false;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return true;
  if (e.metaKey || e.ctrlKey) return false;
  return e.key === '/' && !isTyping(e.target);
}

/** Escape closes it — and only Escape, so a stray key never loses the query. */
export function closesSearch(e: KeyLike): boolean {
  return e.key === 'Escape';
}
