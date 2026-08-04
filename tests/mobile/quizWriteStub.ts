import type { Page } from '@playwright/test';

/**
 * MAKE THE QUIZ'S WRITE LAND, IN A HARNESS THAT HAS NO SESSION.
 *
 * `recordQuizAnswer` is a server action that starts with
 * `supabase.auth.getUser()` and returns `{ok:false,error:'Not signed in.'}`
 * without one. The harness build points Supabase at `harness.invalid`, so no
 * session can ever exist here — which is right for the harness and unlike the
 * product: in production `/app/taste-quiz` sits behind the middleware that
 * auto-provisions an anonymous session, so a real first-time visitor IS signed
 * in by the time they answer.
 *
 * Before the reliability sprint the component ignored `.ok` and showed the
 * finished screen either way, so read-back tests passed on a write that had
 * actually failed. That silent lie is what item 2 fixed — the grid now stays
 * put and names what didn't save — which correctly made those tests fail here.
 *
 * So the write is stubbed rather than the assertion weakened. The real request
 * still goes to the real server (so the payload assertions still prove what was
 * built and sent) and only the action's RETURN VALUE is rewritten to the
 * success the production path would have produced.
 *
 * WHY IN-PAGE AND NOT `page.route`: the action's reply is an RSC stream whose
 * result arrives in a later chunk than its envelope. `route.fetch()` resolves
 * on the first chunk, so rewriting there truncates the stream and the router
 * throws before the component ever sees a result. Wrapping `fetch` inside the
 * page reads the body to completion first, then hands the client one intact,
 * already-rewritten response.
 *
 * Tests that assert the FAILURE handling deliberately do not call this.
 */
export async function stubQuizWriteSucceeds(page: Page) {
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await realFetch(input, init);
      const isAction =
        init?.headers != null && JSON.stringify(init.headers).toLowerCase().includes('next-action');
      // ONLY the quiz-answer action. The finished screen also invokes
      // buildRecommendationSlate, whose failure result is `{ok:false, ...}`
      // too — rewriting that one to a bare `{ok:true}` strips the `items` it
      // promises, and the slate crashes into the root error boundary. The
      // quiz payload is identifiable by its own `intent` field.
      const isQuizAnswer = typeof init?.body === 'string' && init.body.includes('"intent"');
      if (!isAction || !isQuizAnswer) return res;
      const text = await res.text();
      // `res.text()` already decoded the body, so carrying the original
      // content-encoding/content-length over would describe bytes that no
      // longer exist and the RSC reader throws.
      const headers = new Headers(res.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      return new Response(text.replace(/\{"ok":false[^}]*\}/g, '{"ok":true}'), {
        status: res.status,
        headers,
      });
    };
  });
}
