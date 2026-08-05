import 'server-only';
import { createHash } from 'node:crypto';

/**
 * RECORD ONCE, REPLAY FOREVER.
 *
 * Free-live validation mode exists to prove an adapter against reality. It
 * does NOT exist to hammer a free source every time a test runs, and the
 * difference between those two things is this module.
 *
 * A cassette is a recorded HTTP exchange keyed by the request. Once recorded:
 *
 *   - ordinary unit tests replay it and never touch the network;
 *   - preview deployments replay it, because a preview must not spend anyone's
 *     quota;
 *   - a page load never triggers a live call under any mode, ever;
 *   - only a deliberate, mode-gated ingestion run may record a new one.
 *
 * CONDITIONAL REQUESTS. A recorded cassette keeps the source's `ETag` and
 * `Last-Modified`, so a refresh can ask "has this changed?" instead of "give
 * me all of it". A 304 costs a round trip and no quota, and both are counted
 * separately in the request ledger — because "we made 400 requests" and "we
 * made 400 requests of which 380 were 304s" are very different facts about a
 * rate limit.
 *
 * KEYING. The key is a hash of method + URL + the headers that actually
 * affect the response. Deliberately NOT the whole header set: an
 * Authorization header would put a credential in a filename, and a changing
 * User-Agent would miss every cassette for no reason.
 */

export interface CassetteRequest {
  method: string;
  url: string;
  /** Only headers that vary the RESPONSE. Never credentials. */
  varyHeaders?: Record<string, string>;
}

export interface CassetteEntry {
  key: string;
  method: string;
  /** Stored with any credential query parameter redacted — see `redactUrl`. */
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  recordedAt: string;
  etag: string | null;
  lastModified: string | null;
  sourceSlug: string;
}

/** Query parameters whose values are credentials and must never be stored. */
const SECRET_PARAMS = ['api_key', 'apikey', 'key', 'token', 'access_token', 'password', 'secret'];

/**
 * Strip credentials from a URL before it is written anywhere. TV Media
 * authenticates with an `api_key` QUERY PARAMETER, so a naive cassette
 * filename or log line would contain the key in plaintext.
 */
export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const p of SECRET_PARAMS) if (u.searchParams.has(p)) u.searchParams.set(p, 'REDACTED');
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * The cassette key. Credentials are stripped BEFORE hashing, so the same
 * request made with a rotated key hits the same cassette — which is correct:
 * the key identifies the credential, not the resource.
 */
export function cassetteKey(req: CassetteRequest): string {
  const url = redactUrl(req.url);
  const vary = Object.entries(req.varyHeaders ?? {})
    .map(([k, v]) => `${k.toLowerCase()}:${v}`)
    .sort()
    .join('|');
  return createHash('sha256').update(`${req.method.toUpperCase()} ${url} ${vary}`).digest('hex').slice(0, 32);
}

export type CassetteMode =
  /** Replay only. A miss is an error, never a live call. This is the default. */
  | 'replay'
  /** Replay when present, record when absent. Only reachable in free_live/paid_live. */
  | 'record'
  /** Never touch the network and never fail: a miss returns null. */
  | 'offline';

export interface CassetteStore {
  get(key: string): Promise<CassetteEntry | null>;
  put(entry: CassetteEntry): Promise<void>;
  list(): Promise<CassetteEntry[]>;
}

/** In-memory store. The durable one is a directory of JSON files. */
export class MemoryCassetteStore implements CassetteStore {
  private readonly entries = new Map<string, CassetteEntry>();
  async get(key: string) { return this.entries.get(key) ?? null; }
  async put(entry: CassetteEntry) { this.entries.set(entry.key, entry); }
  async list() { return [...this.entries.values()]; }
  get size() { return this.entries.size; }
}

export interface PlaybackResult {
  status: number;
  body: string;
  headers: Record<string, string>;
  /** True when served from a cassette rather than the network. */
  replayed: boolean;
  /** True when the upstream answered 304 to a conditional request. */
  notModified: boolean;
  key: string;
}

export type Fetcher = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ status: number; text: () => Promise<string>; headers: { get(name: string): string | null } }>;

/**
 * Play a request through the cassette.
 *
 * The decision tree, in order, and the ordering is the safety property:
 *
 *  1. A cassette hit in `replay` or `offline` is returned immediately. No
 *     network is contacted, so a test can never accidentally reach a source.
 *  2. A miss in `replay` THROWS. It does not fall through to a live call —
 *     "the recording is missing" must be a loud failure, because silently
 *     making a real request is exactly what this module prevents.
 *  3. A miss in `offline` returns null.
 *  4. Only `record` reaches the network, and it sends the conditional headers
 *     from any existing cassette so an unchanged resource costs a 304.
 */
export async function playThrough(
  req: CassetteRequest,
  opts: {
    mode: CassetteMode;
    store: CassetteStore;
    sourceSlug: string;
    fetcher?: Fetcher;
    /** Headers for the live call. Sent, never stored. */
    requestHeaders?: Record<string, string>;
  },
): Promise<PlaybackResult | null> {
  const key = cassetteKey(req);
  const existing = await opts.store.get(key);

  if (opts.mode !== 'record' && existing) {
    return { status: existing.status, body: existing.body, headers: existing.headers, replayed: true, notModified: false, key };
  }
  if (opts.mode === 'replay') {
    throw new Error(
      `Cassette miss for ${req.method} ${redactUrl(req.url)} (key ${key}). ` +
      'Replay mode never falls through to a live request. Record it with a deliberate ' +
      'ingestion run in free_live mode, or use offline mode if a miss is acceptable.',
    );
  }
  if (opts.mode === 'offline') return null;

  const fetcher = opts.fetcher;
  if (!fetcher) throw new Error('record mode requires a fetcher');

  const headers: Record<string, string> = { ...(opts.requestHeaders ?? {}) };
  // CONDITIONAL REQUEST. An unchanged resource then costs a 304 rather than a
  // full body — which is the difference between a quota that lasts and one
  // that does not.
  if (existing?.etag) headers['If-None-Match'] = existing.etag;
  if (existing?.lastModified) headers['If-Modified-Since'] = existing.lastModified;

  const res = await fetcher(req.url, { method: req.method, headers });

  if (res.status === 304 && existing) {
    return { status: existing.status, body: existing.body, headers: existing.headers, replayed: true, notModified: true, key };
  }

  const body = await res.text();
  const entry: CassetteEntry = {
    key,
    method: req.method.toUpperCase(),
    url: redactUrl(req.url),
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
    },
    body,
    recordedAt: new Date().toISOString(),
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    sourceSlug: opts.sourceSlug,
  };
  await opts.store.put(entry);
  return { status: entry.status, body, headers: entry.headers, replayed: false, notModified: false, key };
}

/**
 * The mode a given environment may use.
 *
 * Note what is NOT reachable: `record` requires an explicitly configured
 * non-fixture mode AND a real production deployment. Tests, previews, and
 * fixture mode all resolve to `replay` or `offline`, which is what makes
 * "ordinary tests never repeat a live call" a property of the code rather
 * than a habit.
 */
export function cassetteModeFor(input: {
  dataMode: 'fixture' | 'free_live' | 'paid_live' | null;
  vercelEnv: string | null | undefined;
  nodeEnv: string | null | undefined;
  /** True only for a deliberate ingestion run, never a page load. */
  isDeliberateIngestion: boolean;
}): CassetteMode {
  const vercel = (input.vercelEnv ?? '').trim().toLowerCase();
  const node = (input.nodeEnv ?? '').trim().toLowerCase();

  if (node === 'test') return 'replay';
  if (vercel === 'preview') return 'replay';
  if (input.dataMode === null) return 'offline';   // unconfigured production
  if (input.dataMode === 'fixture') return 'offline';
  if (!input.isDeliberateIngestion) return 'replay';
  return 'record';
}
