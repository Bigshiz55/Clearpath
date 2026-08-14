import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROTECTION,
  TRANSPORT,
  bypassHeaders,
  classifyLocation,
  classifyTransportError,
  diagnoseProtection,
  explainProtection,
  makeRedactor,
} from './protection.mjs';

/**
 * THE RED: THE GATE COULD NOT REACH A PROTECTED PREVIEW, AND COULD NOT SAY WHY.
 *
 * The black-box gate failed with `/api/version unreachable: fetch failed` on a
 * deployment that was up, with both secrets present. Two separate defects, each
 * of which alone is enough to produce that line:
 *
 *   1. every request carried `x-vercel-set-bypass-cookie: true`, which asks for
 *      a COOKIE HANDSHAKE — a redirect the client is meant to answer by storing
 *      a cookie and coming back. `fetch` keeps no cookie jar, so it cannot. It
 *      follows the redirect, arrives without the cookie, is redirected again,
 *      and dies at the redirect cap. Node reports that as `fetch failed`.
 *
 *   2. `redirect: 'follow'` meant a protection CHALLENGE arrived as somebody
 *      else's `200`. Measured against the real deployment: `/api/version` with
 *      no valid bypass answers `302 → vercel.com/sso-api`, and following that
 *      chain ends at `200` with an HTML login page — `res.ok` true, gate
 *      proceeds, and the first symptom is a JSON parse error about a `<`.
 *
 * The server below is modelled on the REAL responses, each one observed against
 * the live protected preview before it was written down here:
 *
 *   no bypass / wrong bypass → 302 to vercel.com/sso-api?url=…&nonce=…
 *   correct bypass           → 200 application/json
 *
 * The cookie-handshake branch models the shape the removed header asks for: a
 * redirect back to the deployment carrying a Set-Cookie. Under a client with no
 * jar that is an unterminated loop, which is the point.
 */

const GOOD = 'a-bypass-secret-that-is-long-enough';

/**
 * PROTECTION ANSWERS IN TWO SHAPES, AND BOTH ARE MODELLED, because which one
 * you get depends on what the client says it accepts. Observed live:
 *
 *   accept: application/json → 401 + a JSON body that names itself
 *   anything else            → 302 → vercel.com/sso-api?url=…&nonce=…
 *
 * A gate that only understood the redirect would read the 401 as an
 * application refusal and send someone into app auth for a settings problem.
 */
function protectedPreview({ cookieHandshake = false } = {}) {
  return createServer((req, res) => {
    const bypass = req.headers['x-vercel-protection-bypass'];
    const wantsCookie = req.headers['x-vercel-set-bypass-cookie'] === 'true';
    const wantsJson = String(req.headers.accept ?? '').includes('application/json');

    if (bypass !== GOOD) {
      const callback = `https://vercel.com/sso-api?url=${encodeURIComponent(`http://127.0.0.1${req.url}`)}&nonce=9c9e6191e7ed`;
      if (wantsJson) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify(
          bypass
            ? { error: { code: '401', message: 'Protected deployment' }, protection: { vercel_auth_callback: callback } }
            : { protection: { password_enabled: false, vercel_auth_enabled: true, vercel_auth_callback: callback } },
        ));
        return;
      }
      // The browser-shaped challenge, query and all — including the nonce and
      // the full protected URL that must never reach a build log.
      res.writeHead(302, { location: callback });
      res.end('Redirecting...');
      return;
    }

    if (cookieHandshake && wantsCookie) {
      // "Take this cookie and come back." A browser can. `fetch` cannot.
      res.writeHead(307, {
        location: req.url ?? '/',
        'set-cookie': '_vercel_jwt=eyJhbGciOi; Path=/; HttpOnly',
      });
      res.end();
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ env: 'preview', branch: 'claude/canonical-interpretation', sha: '21482f4' }));
  });
}

const servers: Server[] = [];
async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) throw new Error('no port');
  return `http://127.0.0.1:${addr.port}`;
}
afterAll(() => {
  for (const s of servers) s.close();
});

describe('reaching a protected preview', () => {
  it('clears protection with x-vercel-protection-bypass ALONE', async () => {
    const base = await listen(protectedPreview({ cookieHandshake: true }));
    const result = await diagnoseProtection(base, GOOD);

    expect(result.verdict).toBe(PROTECTION.PASSED);
    expect(result.status).toBe(200);
    expect((result.json as { sha?: string }).sha).toBe('21482f4');
  });

  it('sends ONLY the bypass header — never the cookie-establishing one', () => {
    const h = bypassHeaders(GOOD, { accept: 'application/json' });
    expect(h['x-vercel-protection-bypass']).toBe(GOOD);
    expect(h).not.toHaveProperty('x-vercel-set-bypass-cookie');
    // And nothing shipped may reintroduce it. Comments are stripped first: the
    // doc comments that explain WHY the header is gone have to name it, and a
    // rule that trips over its own explanation is useless.
    for (const file of ['canonical-interpretation.mjs', 'protection.mjs']) {
      const code = readFileSync(join(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/x-vercel-set-bypass-cookie/);
    }
  });

  it('THE RED: the old request shape cannot reach the same deployment', async () => {
    const base = await listen(protectedPreview({ cookieHandshake: true }));

    // Exactly what the gate used to send: both headers, redirects followed.
    let failure: unknown;
    try {
      await fetch(`${base}/api/version`, {
        headers: {
          'content-type': 'application/json',
          'x-vercel-protection-bypass': GOOD,
          'x-vercel-set-bypass-cookie': 'true',
        },
      });
    } catch (e) {
      failure = e;
    }

    // The symptom, reproduced: three words that name nothing.
    expect((failure as Error).message).toBe('fetch failed');
    // And the classifier turns those three words into the actual fact.
    expect(classifyTransportError(failure).kind).toBe(TRANSPORT.REDIRECT_LOOP);
  });
});

describe('a failure is named, never collapsed into "fetch failed"', () => {
  it('names a redirect loop', async () => {
    const loop = createServer((req, res) => {
      res.writeHead(307, { location: req.url ?? '/' });
      res.end();
    });
    const base = await listen(loop);
    // `redirect: 'manual'` means the probe itself never loops — it reports the
    // first hop instead, which is strictly more informative than the loop.
    const result = await diagnoseProtection(base, GOOD);
    expect(result.verdict).toBe(PROTECTION.COOKIE_HANDSHAKE);
    expect(explainProtection(result)).toMatch(/cookie handshake/i);
  });

  it('accuses the bypass token ONLY when a token was actually sent', async () => {
    const base = await listen(protectedPreview());

    const withToken = await diagnoseProtection(base, 'the-wrong-secret-value');
    expect(withToken.verdict).toBe(PROTECTION.BYPASS_REJECTED);
    expect(withToken.bypassSent).toBe(true);
    expect(explainProtection(withToken)).toMatch(/it was NOT accepted/);

    const without = await diagnoseProtection(base, '');
    expect(without.verdict).toBe(PROTECTION.PROTECTION_CHALLENGE);
    expect(explainProtection(without)).toMatch(/no bypass token was configured/);
    expect(explainProtection(without)).not.toMatch(/NOT accepted/);
  });

  it('tells a PROTECTION 401 apart from an APPLICATION 401', async () => {
    // Vercel's protection 401 carries a signature. The application's does not,
    // and the difference decides whether anyone should be touching a secret.
    const app = createServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    });
    const appBase = await listen(app);
    const appResult = await diagnoseProtection(appBase, GOOD);
    expect(appResult.verdict).toBe(PROTECTION.UNAUTHORIZED);
    expect(explainProtection(appResult)).toMatch(/not Deployment Protection/);

    // Same status, same content type — opposite diagnosis.
    const protectedBase = await listen(protectedPreview());
    const protectionResult = await diagnoseProtection(protectedBase, 'a-stale-token-value');
    expect(protectionResult.status).toBe(401);
    expect(protectionResult.verdict).toBe(PROTECTION.BYPASS_REJECTED);
  });

  it('never carries the SSO callback URL out of the protection body', async () => {
    const base = await listen(protectedPreview());
    const result = await diagnoseProtection(base, 'a-stale-token-value');
    const printed = `${JSON.stringify(result)} ${explainProtection(result)}`;
    // `vercel_auth_callback` holds the full protected URL and a nonce.
    expect(printed).not.toMatch(/vercel_auth_callback|nonce|9c9e6191e7ed/);
  });

  it('names DNS, TLS, timeout and connection failures apart', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ cause: { code: 'ENOTFOUND' } }, TRANSPORT.DNS],
      [{ cause: { code: 'EAI_AGAIN' } }, TRANSPORT.DNS],
      [{ cause: { code: 'CERT_HAS_EXPIRED' } }, TRANSPORT.TLS],
      [{ cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }, TRANSPORT.TLS],
      [{ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }, TRANSPORT.TIMEOUT],
      [{ name: 'TimeoutError', cause: {} }, TRANSPORT.TIMEOUT],
      [{ cause: { code: 'ECONNREFUSED' } }, TRANSPORT.CONNECTION],
      [{ cause: { code: 'ECONNRESET' } }, TRANSPORT.CONNECTION],
      [{ cause: { message: 'redirect count exceeded' } }, TRANSPORT.REDIRECT_LOOP],
      [{ cause: { code: 'SOMETHING_NEW' } }, TRANSPORT.UNKNOWN],
    ];
    for (const [err, kind] of cases) {
      expect(classifyTransportError(err), JSON.stringify(err)).toMatchObject({ kind });
    }
  });

  it('reports a real refused connection as CONNECTION, not "fetch failed"', async () => {
    // A port that WAS bound and is now closed, so the refusal is genuine.
    // (A hard-coded low port is the wrong way to write this: undici rejects
    // port 1 as a blocked port before it ever opens a socket, which is a
    // different failure wearing the same three words.)
    const doomed = createServer(() => {});
    const base = await new Promise<string>((resolve) => {
      doomed.listen(0, '127.0.0.1', () => {
        const addr = doomed.address();
        if (typeof addr === 'string' || addr === null) throw new Error('no port');
        doomed.close(() => resolve(`http://127.0.0.1:${addr.port}`));
      });
    });

    const result = await diagnoseProtection(base, GOOD, { timeoutMs: 3000 });
    expect(result.verdict).toBe(PROTECTION.TRANSPORT);
    expect(result.transport?.kind).toBe(TRANSPORT.CONNECTION);
    expect(result.transport?.code).toBe('ECONNREFUSED');
    expect(explainProtection(result)).toMatch(/refused or reset/);
  });

  it('a 2xx that is not JSON is an interstitial, not an answer', async () => {
    const html = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body>Log in to Vercel</body></html>');
    });
    const base = await listen(html);
    const result = await diagnoseProtection(base, GOOD);
    expect(result.verdict).toBe(PROTECTION.NOT_JSON);
    expect(result.contentType).toBe('text/html');
    // The page's BODY is never carried into the finding.
    expect(explainProtection(result)).not.toMatch(/Log in to Vercel/);
  });
});

describe('diagnostics are safe to publish', () => {
  it('drops the query string from a redirect, keeping hostname and path', () => {
    const d = classifyLocation(
      'https://vercel.com/sso-api?url=https%3A%2F%2Fpreview.vercel.app%2Fapi%2Fversion&nonce=9c9e6191e7ed',
      'https://preview.vercel.app',
    );
    expect(d).toMatchObject({ host: 'vercel.com', path: '/sso-api', kind: 'vercel-sso' });
    expect(JSON.stringify(d)).not.toMatch(/nonce|9c9e6191e7ed|url=/);
  });

  it('a redirect back to the deployment is same-origin, not SSO', () => {
    expect(classifyLocation('/api/version', 'https://preview.vercel.app')).toMatchObject({ kind: 'same-origin' });
  });

  it('a junk Location still yields host and path only — never its query', () => {
    // Almost any string resolves against a valid base, so "unparseable" is not
    // the interesting case; "resolved to something we did not expect" is. The
    // guarantee is the same either way: host and path leave, the query does not.
    const d = classifyLocation('/whatever?token=super-secret&nonce=abc', 'https://preview.vercel.app');
    expect(d).toMatchObject({ host: 'preview.vercel.app', path: '/whatever', kind: 'same-origin' });
    expect(JSON.stringify(d)).not.toMatch(/super-secret|nonce|token/);
  });

  it('an unparseable Location is reported as a shape, never as a value', () => {
    // Reached when the BASE cannot be parsed, which is the only way `new URL`
    // actually throws here. The finding must still be safe to print.
    const d = classifyLocation('::not a url::', 'not-a-base');
    expect(d).toMatchObject({ kind: 'malformed', host: '(unparseable)' });
    expect(JSON.stringify(d)).not.toMatch(/not a url/);
  });

  it('redacts secret values out of anything that reaches a log', () => {
    const redact = makeRedactor([GOOD, 'a-login-secret-value', undefined, 'no']);
    const line = `connect failed while sending ${GOOD} and a-login-secret-value`;
    const out = redact(line);
    expect(out).not.toContain(GOOD);
    expect(out).not.toContain('a-login-secret-value');
    // A too-short value is ignored rather than blanking ordinary words.
    expect(redact('there is no problem')).toBe('there is no problem');
  });

  it('never prints a secret in a transport explanation', () => {
    const redact = makeRedactor([GOOD]);
    const result = {
      verdict: PROTECTION.TRANSPORT,
      bypassSent: true,
      transport: { kind: TRANSPORT.UNKNOWN, code: 'X', message: `header was ${GOOD}` },
    };
    expect(explainProtection(result, redact)).not.toContain(GOOD);
  });
});
