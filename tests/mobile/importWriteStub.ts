import type { Page } from '@playwright/test';

/**
 * LET THE IMPORT'S WRITE LAND, IN A HARNESS WITH NO SESSION.
 *
 * Sibling of quizWriteStub.ts — same reason, same shape, read that one first.
 *
 * `importParsedTitles` starts with `supabase.auth.getUser()` and returns
 * `{ok:false, error:'Not signed in.'}` without one. The harness points Supabase
 * at `harness.invalid`, so no session can exist here.
 *
 * Before the reliability sprint, ImportTasteFlow's Apply button did not
 * persist anything at all — its entire onClick was `setStage('applied')` — so
 * the summary and undo screens appeared unconditionally and these tests passed
 * on a write that never happened. Item 7 wired the real action, so a failed
 * write now correctly stops at `import-signin-required` instead of showing a
 * summary that would be a lie.
 *
 * That is why the write is stubbed rather than the assertions weakened: the
 * tests' real claims — that review is mandatory, that the summary does not
 * overclaim, that an import can be undone — are about the UI contract after a
 * SUCCESSFUL write, which is the case production hits and the harness cannot.
 *
 * The rows are synthesised from the request's own payload, so the summary
 * still reflects the titles the component actually sent rather than a fixture
 * invented here.
 */
export async function stubImportWriteSucceeds(page: Page) {
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await realFetch(input, init);
      const isAction =
        init?.headers != null && JSON.stringify(init.headers).toLowerCase().includes('next-action');
      if (!isAction || typeof init?.body !== 'string') return res;

      const text = await res.text();
      if (!text.includes('"ok":false')) return res;

      const headers = new Headers(res.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');

      // undoImportedTitles takes {tmdbId, mediaType} keys and returns a bare
      // ok — nothing else to synthesise.
      if (init.body.includes('tmdbId') && !init.body.includes('rating')) {
        return new Response(text.replace(/\{"ok":false[^}]*\}/g, '{"ok":true,"removed":1}'), {
          status: res.status,
          headers,
        });
      }

      // importParsedTitles takes [{title, rating}] — echo each title back as a
      // matched row so the summary counts what was really submitted.
      const titles = [...init.body.matchAll(/"title":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
      if (titles.length === 0) return new Response(text, { status: res.status, headers });

      const rows = titles.map((t, i) => ({
        raw: t,
        status: 'imported',
        title: t,
        year: null,
        mediaType: 'movie',
        rating: null,
        tmdbId: 900000 + i,
      }));
      const summary = JSON.stringify({ ok: true, imported: rows.length, unmatched: 0, rows });
      return new Response(text.replace(/\{"ok":false[^}]*\}/g, summary), {
        status: res.status,
        headers,
      });
    };
  });
}
