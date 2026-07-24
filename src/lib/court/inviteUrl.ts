/**
 * The ONE authoritative Live Court invite-URL builder. PURE.
 *
 * A recipient must open the SAME deployment the host is on (the room lives in that
 * deployment's database), so the default base is the host's current origin. An
 * explicit canonical override (NEXT_PUBLIC_COURT_ORIGIN / NEXT_PUBLIC_SITE_URL) is
 * honored ONLY when it's a valid absolute https URL — used for a custom production
 * domain. We never emit a localhost link as "shareable", always normalize, always
 * validate the room id, and preserve an optional invite token.
 */

export interface InviteUrlInput {
  /** The host's current origin (e.g. window.location.origin). */
  origin: string | null | undefined;
  roomId: string | null | undefined;
  /** Explicit canonical base (custom domain). Used only if a valid absolute https URL. */
  canonicalOverride?: string | null;
  /** Optional invite token, preserved as ?t=. */
  token?: string | null;
}

export interface InviteUrlResult {
  /** The absolute invite URL, or null when it can't be built safely. */
  url: string | null;
  /** The normalized base origin actually used. */
  origin: string | null;
  roomId: string | null;
  /** Safe to send to another device (https + not localhost + valid). */
  shareable: boolean;
  /** Non-fatal notes (e.g. localhost in dev, http). */
  warnings: string[];
  /** Fatal reason the URL is null/invalid. */
  error: string | null;
}

/** Room ids are the 8-char codes from court_create; be strict but not brittle. */
export function isValidRoomId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(id);
}

function normalizeBase(raw: string): { origin: string; protocol: string; host: string } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  // origin drops any path/trailing slash automatically.
  return { origin: u.origin, protocol: u.protocol, host: u.hostname };
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
}

export function buildCourtInviteUrl(input: InviteUrlInput): InviteUrlResult {
  const warnings: string[] = [];
  const roomId = typeof input.roomId === 'string' ? input.roomId.trim() : '';

  if (!isValidRoomId(roomId)) {
    return { url: null, origin: null, roomId: roomId || null, shareable: false, warnings, error: 'invalid-room-id' };
  }

  // Choose the base: a valid absolute https canonical override wins; else the host origin.
  let base: { origin: string; protocol: string; host: string } | null = null;
  const override = input.canonicalOverride?.trim();
  if (override) {
    const o = normalizeBase(override);
    if (o && o.protocol === 'https:') base = o;
    else warnings.push('canonical-override-ignored (not a valid absolute https URL)');
  }
  if (!base) {
    const o = input.origin ? normalizeBase(input.origin) : null;
    if (!o) return { url: null, origin: null, roomId, shareable: false, warnings, error: 'invalid-origin' };
    base = o;
  }

  const local = isLocalHost(base.host);
  const insecure = base.protocol !== 'https:';
  if (local) warnings.push('localhost origin — a shared link will not open on another device');
  if (insecure && !local) warnings.push('non-https origin — links should be served over HTTPS');

  const q = input.token ? `?t=${encodeURIComponent(input.token)}` : '';
  const url = `${base.origin}/court/${encodeURIComponent(roomId)}${q}`;

  return {
    url,
    origin: base.origin,
    roomId,
    shareable: !local && !insecure,
    warnings,
    error: null,
  };
}

/** Convenience for the browser: derive the invite URL from the live environment. */
export function courtInviteUrlFromEnv(roomId: string, token?: string | null): InviteUrlResult {
  const origin = typeof window !== 'undefined' ? window.location.origin : null;
  // Default is the host's OWN origin (guarantees the recipient hits the same
  // deployment/database). A dedicated NEXT_PUBLIC_COURT_ORIGIN opts into a canonical
  // custom domain; we deliberately do NOT reuse NEXT_PUBLIC_SITE_URL here, because a
  // stale/mismatched value there previously sent friends to the wrong deployment.
  const canonicalOverride =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COURT_ORIGIN) || null;
  return buildCourtInviteUrl({ origin, roomId, canonicalOverride, token });
}
