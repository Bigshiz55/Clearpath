import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  markSearchRequested,
  consumeSearchRequest,
  hasPendingSearchRequest,
  PENDING_ATTR,
  TRIGGER_ATTR,
  PREHYDRATION_SCRIPT,
  type RootLike,
} from './openRequest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** The smallest thing that behaves like `document.documentElement`. */
function fakeRoot(): RootLike & { attrs: Map<string, string> } {
  const attrs = new Map<string, string>();
  return {
    attrs,
    hasAttribute: (n) => attrs.has(n),
    setAttribute: (n, v) => void attrs.set(n, v),
    removeAttribute: (n) => void attrs.delete(n),
  };
}

/**
 * THE USER-LEVEL FAILURE: "the search button does nothing, especially on
 * iPhone." The trigger and the sheet hydrate independently, and the old wiring
 * was a one-shot CustomEvent — delivered only to whoever was listening at that
 * instant. Tap during the gap and the request was gone.
 */
describe('a request made before the sheet exists is not lost', () => {
  it('survives until something is there to receive it', () => {
    const root = fakeRoot();
    // The tap: nothing is mounted, so there is nobody to hear an event.
    markSearchRequested(root);
    expect(hasPendingSearchRequest(root)).toBe(true);

    // …the sheet mounts a moment later and claims it.
    expect(consumeSearchRequest(root)).toBe(true);
  });

  it('is consumed exactly once, so the sheet can be closed again', () => {
    // Without this the request would re-open the sheet on the next render and
    // it could never be dismissed.
    const root = fakeRoot();
    markSearchRequested(root);
    expect(consumeSearchRequest(root)).toBe(true);
    expect(consumeSearchRequest(root)).toBe(false);
    expect(hasPendingSearchRequest(root)).toBe(false);
  });

  it('READING does not clear it, so a remount still finds it', () => {
    // The real failure this rule exists for: a hydration mismatch makes React
    // throw the whole client tree away and build it again. A request consumed
    // by the discarded mount is gone before the surviving mount looks — which
    // is the original dead button, reintroduced.
    const root = fakeRoot();
    markSearchRequested(root);
    expect(hasPendingSearchRequest(root)).toBe(true); // discarded mount reads…
    expect(hasPendingSearchRequest(root)).toBe(true); // …surviving mount too
    // Only dismissing it clears it.
    expect(consumeSearchRequest(root)).toBe(true);
    expect(hasPendingSearchRequest(root)).toBe(false);
  });

  it('reports nothing pending when nobody asked', () => {
    const root = fakeRoot();
    expect(consumeSearchRequest(root)).toBe(false);
    expect(hasPendingSearchRequest(root)).toBe(false);
  });

  it('two taps are still one request', () => {
    const root = fakeRoot();
    markSearchRequested(root);
    markSearchRequested(root);
    expect(consumeSearchRequest(root)).toBe(true);
    expect(consumeSearchRequest(root)).toBe(false);
  });

  it('open, close, open again all work', () => {
    const root = fakeRoot();
    for (let i = 0; i < 3; i++) {
      markSearchRequested(root);
      expect(consumeSearchRequest(root), `cycle ${i}`).toBe(true);
      expect(consumeSearchRequest(root), `cycle ${i} close`).toBe(false);
    }
  });
});

describe('a tap that lands before ANY javascript runs is still recorded', () => {
  it('the inline script watches for the trigger attribute in the capture phase', () => {
    expect(PREHYDRATION_SCRIPT).toContain(TRIGGER_ATTR);
    expect(PREHYDRATION_SCRIPT).toContain(PENDING_ATTR);
    // Capture phase, so it runs before anything React attaches later.
    expect(PREHYDRATION_SCRIPT).toContain('true');
    expect(PREHYDRATION_SCRIPT).toContain("addEventListener('click'");
  });

  it('never blocks the click it observes', () => {
    // React's own handler must still fire on the normal, already-hydrated
    // path — this is a safety net, not the mechanism.
    expect(PREHYDRATION_SCRIPT).not.toContain('preventDefault');
    expect(PREHYDRATION_SCRIPT).not.toContain('stopPropagation');
  });

  it('cannot throw a page-breaking error', () => {
    expect(PREHYDRATION_SCRIPT).toContain('try{');
    expect(PREHYDRATION_SCRIPT).toContain('catch');
  });

  it('actually runs it, in the document, on every page', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('PREHYDRATION_SCRIPT');
    expect(layout).toContain('dangerouslySetInnerHTML');
  });
});

describe('every trigger carries the attribute the safety net looks for', () => {
  const src = stripComments(read('src/components/QuickSearch.tsx'));

  it('the header trigger and the floating one both do', () => {
    // Two triggers, two chances to forget. Counted rather than merely present.
    const uses = src.split(`[TRIGGER_ATTR]`).length - 1;
    expect(uses).toBeGreaterThanOrEqual(2);
  });

  it('a request marks the DOM before it dispatches the event', () => {
    // Order matters: mark first means no sequence loses the request.
    const mark = src.indexOf('markSearchRequested');
    const shout = src.indexOf('dispatchEvent');
    expect(mark).toBeGreaterThan(-1);
    expect(shout).toBeGreaterThan(mark);
  });

  it('the sheet claims a pending request on mount, not only on the event', () => {
    expect(src).toContain('hasPendingSearchRequest(document.documentElement)');
  });

  it('mounting READS the request; only closing clears it', () => {
    // Consuming on mount reintroduced the dead button on exactly the slow
    // loads this fix is for — see openRequest.ts. The clear belongs in `close`.
    const closeBody = src.slice(src.indexOf('const close = useCallback'), src.indexOf('}, []);', src.indexOf('const close = useCallback')));
    expect(closeBody).toContain('consumeSearchRequest(document.documentElement)');
  });
});

describe('the sheet uses the real search box, not a form that guesses', () => {
  const src = stripComments(read('src/components/QuickSearch.tsx'));

  it('renders SearchBar', () => {
    expect(src).toContain('<SearchBar');
    expect(src).toContain('inputTestId="quick-search-input"');
  });

  it('no longer routes everything to the Judge', () => {
    // `quickSearchHref` was the defect: every query went to /app/ask.
    expect(src).not.toContain('quickSearchHref');
  });

  it('the desktop bar looks a title up instead of asking about it', () => {
    expect(src).toContain('/api/search?q=');
    expect(src).toContain('resolveSearchDestination');
  });
});
