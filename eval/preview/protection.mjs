/**
 * REACHING A PROTECTED VERCEL PREVIEW, AND SAYING WHY WHEN YOU CANNOT.
 *
 * Split out of the black-box gate because the gate's one job is to judge the
 * PRODUCT, and it cannot do that while its own transport layer reports every
 * distinct failure as the same three words.
 *
 * ── THE FAILURE THIS EXISTS TO KILL ──────────────────────────────────────
 *
 * `/api/version unreachable: fetch failed`
 *
 * `fetch failed` is Node's message for a TypeError whose real content is in
 * `err.cause`. DNS, TLS, a refused socket, a timeout and a redirect loop all
 * surface identically at `err.message`, so a gate that logs only that has told
 * you nothing except that it is unhappy. Measured, not assumed — a server that
 * redirects to itself produces exactly:
 *
 *     TypeError: fetch failed
 *       cause.code:    undefined
 *       cause.message: "redirect count exceeded"
 *
 * ── WHY ONE HEADER, NOT TWO ──────────────────────────────────────────────
 *
 * `x-vercel-protection-bypass` is what authorizes the request. The companion
 * `x-vercel-set-bypass-cookie` asks Vercel to ESTABLISH A COOKIE for follow-up
 * requests from a browser, and a cookie is established by a response the client
 * is expected to store and re-present. `fetch` keeps no cookie jar: it cannot
 * store one, so it cannot re-present one, so the handshake has nothing to
 * terminate it. For a server-to-server call the header buys nothing it can use
 * and adds a redirect it cannot satisfy. It is not sent.
 *
 * ── WHY `redirect: 'manual'` WHILE DIAGNOSING ────────────────────────────
 *
 * Following redirects destroys the evidence. Measured against a real protected
 * preview with no valid bypass: `/api/version` answers `302 → vercel.com
 * /sso-api`, and FOLLOWING that chain ends at `200` with an HTML login page —
 * so `res.ok` is true, the gate proceeds, and the first thing anyone sees is a
 * JSON parse error about a `<`. Manual redirects turn that into the fact it
 * actually is: a protection challenge, named, at the first hop.
 *
 * ── SECRETS ──────────────────────────────────────────────────────────────
 *
 * Nothing here logs. It returns structured findings, every string of which has
 * passed through a redactor built from the live secret values, and a redirect
 * is described by HOSTNAME AND PATH ONLY. The query string is dropped on
 * purpose: Vercel's SSO redirect carries the full protected URL and a nonce in
 * it, and neither belongs in a public build log.
 */

/** What the protection probe concluded. The gate maps these to exit paths. */
export const PROTECTION = {
  /** The deployment answered our request directly. Nothing is in the way. */
  PASSED: 'PASSED',
  /**
   * Deployment Protection refused a request that DID carry a bypass token.
   * The one verdict that accuses the secret — see `looksLikeVercelProtection`.
   */
  BYPASS_REJECTED: 'BYPASS_REJECTED',
  /** Deployment Protection refused, and no bypass token was configured. */
  PROTECTION_CHALLENGE: 'PROTECTION_CHALLENGE',
  /** 401/403 from the APPLICATION — no protection signature on the response. */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Redirected back to the deployment itself — a cookie handshake we cannot
   *  complete, because `fetch` has no cookie jar to complete it with. */
  COOKIE_HANDSHAKE: 'COOKIE_HANDSHAKE',
  /** Redirected somewhere that is neither the deployment nor Vercel SSO. */
  FOREIGN_REDIRECT: 'FOREIGN_REDIRECT',
  /** 2xx, but not the JSON this endpoint returns — an interstitial page. */
  NOT_JSON: 'NOT_JSON',
  /** A non-2xx, non-3xx status that protection does not explain. */
  HTTP_ERROR: 'HTTP_ERROR',
  /** Never reached the application: DNS, TLS, socket, timeout, redirect loop. */
  TRANSPORT: 'TRANSPORT',
};

/** How a request failed before any HTTP status existed. */
export const TRANSPORT = {
  DNS: 'DNS',
  TLS: 'TLS',
  TIMEOUT: 'TIMEOUT',
  REDIRECT_LOOP: 'REDIRECT_LOOP',
  CONNECTION: 'CONNECTION',
  UNKNOWN: 'UNKNOWN',
};

/**
 * A redactor built from the secrets this process actually holds.
 *
 * BELT AND BRACES, DELIBERATELY. Nothing here interpolates a secret into a
 * string in the first place — but `err.cause.message` is written by Node and by
 * whatever socket layer failed, and the rule "no secret ever reaches the log"
 * is worth more than the assumption that none of them will ever quote a header.
 * Short values are ignored: redacting a 3-character secret would blank ordinary
 * words and make the diagnostics useless.
 */
export function makeRedactor(secrets = []) {
  const real = [...new Set(secrets.filter((s) => typeof s === 'string' && s.length >= 8))];
  return (text) => {
    let out = String(text ?? '');
    for (const s of real) out = out.split(s).join('«redacted»');
    return out;
  };
}

/**
 * The real reason a `fetch` threw, pulled out of `err.cause` where Node puts it.
 *
 * Ordered most-specific-first. `redirect count exceeded` carries no `code` at
 * all, which is exactly why it has to be matched before the code table rather
 * than falling through it into UNKNOWN.
 */
export function classifyTransportError(err) {
  const cause = err?.cause ?? {};
  const code = typeof cause.code === 'string' ? cause.code : undefined;
  const message = String(cause.message ?? err?.message ?? '');
  const name = String(err?.name ?? '');

  const kind = (() => {
    if (/redirect count exceeded/i.test(message)) return TRANSPORT.REDIRECT_LOOP;
    if (name === 'TimeoutError' || name === 'AbortError') return TRANSPORT.TIMEOUT;
    if (!code) return TRANSPORT.UNKNOWN;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return TRANSPORT.DNS;
    if (code === 'ETIMEDOUT' || code.startsWith('UND_ERR_CONNECT_TIMEOUT') || code.startsWith('UND_ERR_HEADERS_TIMEOUT') || code.startsWith('UND_ERR_BODY_TIMEOUT')) {
      return TRANSPORT.TIMEOUT;
    }
    // Certificate and TLS failures name themselves; there is no single prefix
    // that catches them, so both the OpenSSL-style names and the Node-style
    // ERR_TLS_*/ERR_SSL_* codes are matched.
    if (code.startsWith('ERR_TLS') || code.startsWith('ERR_SSL') || /CERT|SSL|TLS/.test(code)) return TRANSPORT.TLS;
    if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_SOCKET'].includes(code)) {
      return TRANSPORT.CONNECTION;
    }
    return TRANSPORT.UNKNOWN;
  })();

  return { kind, code, message };
}

/**
 * Describe a `Location` header safely: hostname and path, never the query.
 *
 * Vercel's SSO redirect is `https://vercel.com/sso-api?url=<the full protected
 * URL>&nonce=<token>`. The hostname and the path are the diagnosis; the query
 * is the part that must not be printed, so it is never carried out of here.
 */
export function classifyLocation(location, baseUrl) {
  if (!location) return null;
  let target;
  try {
    target = new URL(location, baseUrl);
  } catch {
    // A Location we cannot even parse is itself the finding. Report the shape,
    // not the value — a malformed header could contain anything.
    return { host: '(unparseable)', path: '', kind: 'malformed' };
  }
  let baseHost = '';
  try {
    baseHost = new URL(baseUrl).host;
  } catch {
    baseHost = '';
  }
  const host = target.host;
  const path = target.pathname;
  const kind = host === baseHost
    ? 'same-origin'
    : /(^|\.)vercel\.com$/.test(target.hostname) && /^\/(sso|sso-api|login)/.test(path)
      ? 'vercel-sso'
      : 'foreign';
  return { host, path, kind };
}

/**
 * The ONLY header that authorizes a server-to-server call to a protected
 * preview. See the note at the top for why its companion is not here.
 */
export function bypassHeaders(bypass, extra = {}) {
  const h = { ...extra };
  if (bypass) h['x-vercel-protection-bypass'] = bypass;
  return h;
}

/**
 * Did DEPLOYMENT PROTECTION refuse this, or did the APPLICATION?
 *
 * Measured against the live protected preview, and the reason this function
 * exists at all: what protection sends depends on what the client says it
 * accepts. With `accept: application/json` it answers 401 and a JSON body that
 * names itself; with a browser's `accept` it answers 302 to vercel.com/sso-api.
 * Same refusal, two shapes.
 *
 *   no bypass    → {"protection":{"vercel_auth_enabled":true,"vercel_auth_callback":…}}
 *   wrong bypass → {"error":{"code":"401","message":"Protected deployment"},"protection":{…}}
 *
 * So a 401 is NOT evidence of an app-level refusal on its own, and calling it
 * one would send somebody hunting through application auth for a problem that
 * lives in project settings. The signature is what separates them.
 *
 * Only the SHAPE is read. `vercel_auth_callback` holds an SSO URL carrying the
 * protected deployment URL, and it is never returned or logged.
 */
export function looksLikeVercelProtection(body) {
  if (!body || typeof body !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(body, 'protection')) return true;
  const message = body.error && typeof body.error === 'object' ? body.error.message : undefined;
  return /protected deployment/i.test(String(message ?? ''));
}

/**
 * One request, with redirects left UNFOLLOWED and a hard time limit, returning
 * a result rather than throwing. Every caller in the gate needs the same three
 * things — status, first-hop redirect, and a named transport failure — and a
 * `try/catch` per call site is how they drifted apart in the first place.
 */
export async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 20_000, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, {
      method,
      headers,
      body,
      // Manual, always. A followed redirect is evidence destroyed: see the note
      // at the top about a 302 challenge arriving as a 200 HTML page.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: true, status: res.status, res, location: res.headers.get('location') };
  } catch (err) {
    return { ok: false, error: classifyTransportError(err) };
  }
}

/**
 * Can we reach the deployment at all, and if not, WHICH thing is in the way?
 *
 * Deliberately probes `/api/version`: it is the cheapest route that proves both
 * that protection let us through and that the build is the one we think it is.
 */
export async function diagnoseProtection(baseUrl, bypass, { timeoutMs = 20_000, fetchImpl = fetch, path = '/api/version' } = {}) {
  const url = `${baseUrl}${path}`;
  const attempt = await request(url, {
    headers: bypassHeaders(bypass, { accept: 'application/json' }),
    timeoutMs,
    fetchImpl,
  });

  if (!attempt.ok) {
    return { verdict: PROTECTION.TRANSPORT, transport: attempt.error, bypassSent: Boolean(bypass) };
  }

  const { status, res } = attempt;
  const base = { status, bypassSent: Boolean(bypass) };

  // Protection refused, and whether that accuses the token depends on one
  // thing only: did we send one? Both refusal shapes route through here so the
  // answer cannot differ between them.
  const refused = () => ({
    ...base,
    verdict: base.bypassSent ? PROTECTION.BYPASS_REJECTED : PROTECTION.PROTECTION_CHALLENGE,
  });

  if (status >= 300 && status < 400) {
    const redirect = classifyLocation(attempt.location, baseUrl);
    if (redirect?.kind === 'vercel-sso') return { ...refused(), redirect };
    const verdict = redirect?.kind === 'same-origin' ? PROTECTION.COOKIE_HANDSHAKE : PROTECTION.FOREIGN_REDIRECT;
    return { ...base, verdict, redirect };
  }

  if (status === 401 || status === 403) {
    // The body decides. A protection 401 and an application 401 are the same
    // number about entirely different problems.
    const body = await res.json().catch(() => null);
    if (looksLikeVercelProtection(body)) return refused();
    return { ...base, verdict: PROTECTION.UNAUTHORIZED };
  }

  if (status >= 200 && status < 300) {
    const contentType = res.headers.get('content-type') ?? '';
    let json;
    try {
      json = await res.json();
    } catch {
      // 2xx that is not JSON is an interstitial, not an answer. Only the
      // content-type is reported: the BODY of a login page is not ours to log.
      return { ...base, verdict: PROTECTION.NOT_JSON, contentType: contentType.split(';')[0] };
    }
    return { ...base, verdict: PROTECTION.PASSED, json };
  }

  return { ...base, verdict: PROTECTION.HTTP_ERROR };
}

/**
 * The finding, in one line a human can act on, with the secret-safe detail.
 *
 * `BYPASS_REJECTED` is the ONE verdict that accuses the secret, and it is
 * reached only when a token was actually sent. Measured against the real
 * deployment: a valid token answers 200, while an absent token and an invalid
 * token both draw a Deployment Protection refusal — so a refusal returned to a
 * request that DID carry the header is Vercel declining that header. That is
 * positive proof, not an inference, and it is the only thing that justifies
 * asking a human to touch the secret.
 */
export function explainProtection(result, redact = (s) => s) {
  const r = result;
  const where = r.redirect ? ` → ${r.redirect.host}${r.redirect.path} (query withheld)` : '';
  switch (r.verdict) {
    case PROTECTION.PASSED:
      return 'protection cleared with x-vercel-protection-bypass alone.';
    case PROTECTION.BYPASS_REJECTED:
      return `Vercel Deployment Protection refused with ${r.status}${where} even though x-vercel-protection-bypass was sent. `
        + 'The deployment is reachable and the header arrived — it was NOT accepted.';
    case PROTECTION.PROTECTION_CHALLENGE:
      return `Vercel Deployment Protection refused with ${r.status}${where}, and no bypass token was configured.`;
    case PROTECTION.COOKIE_HANDSHAKE:
      return `Vercel answered ${r.status} → ${r.redirect?.host}${r.redirect?.path}, a redirect back to the deployment itself. `
        + 'That is a cookie handshake, and `fetch` has no cookie jar to complete it — followed, it is the redirect loop that used to surface as "fetch failed".';
    case PROTECTION.FOREIGN_REDIRECT:
      return `Unexpected ${r.status} redirect to ${r.redirect?.host}${r.redirect?.path} (query withheld).`;
    case PROTECTION.UNAUTHORIZED:
      return `The deployment answered ${r.status}. The request reached the application and was refused there, which is not Deployment Protection.`;
    case PROTECTION.NOT_JSON:
      return `The deployment answered ${r.status} with ${r.contentType || 'an unknown content type'} rather than JSON — an interstitial page, not the endpoint.`;
    case PROTECTION.HTTP_ERROR:
      return `The deployment answered ${r.status}.`;
    case PROTECTION.TRANSPORT: {
      const t = r.transport;
      const detail = redact(t.message || '(no message)');
      const code = t.code ? ` code=${t.code}` : '';
      const named = {
        [TRANSPORT.DNS]: 'DNS did not resolve the deployment hostname',
        [TRANSPORT.TLS]: 'the TLS handshake failed',
        [TRANSPORT.TIMEOUT]: 'the request timed out',
        [TRANSPORT.REDIRECT_LOOP]: 'the request entered a redirect loop (this is what "fetch failed" was hiding)',
        [TRANSPORT.CONNECTION]: 'the connection was refused or reset',
        [TRANSPORT.UNKNOWN]: 'the request failed before any HTTP status existed',
      }[t.kind];
      return `${named}.${code} cause="${detail}"`;
    }
    default:
      return 'unclassified protection result.';
  }
}
