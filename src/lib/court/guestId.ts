/**
 * A STABLE per-device Court guest id. Kept in localStorage so refreshing, leaving
 * and returning, or reconnecting re-uses the same identity — the idempotent
 * court_join then re-uses the existing seat instead of creating a ghost participant.
 * Falls back to an in-memory id when storage is unavailable (private mode).
 */
const KEY = 'wv_court_guest';
let memoryId: string | null = null;

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `g_${crypto.randomUUID()}`;
  } catch { /* fall through */ }
  return `g_${Math.abs(hashString(String(Date.now()) + navUA())).toString(36)}${Math.abs(hashString(navUA() + 'x')).toString(36)}`;
}

export function getGuestId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) { id = newId(); window.localStorage.setItem(KEY, id); }
    return id;
  } catch {
    if (!memoryId) memoryId = newId();
    return memoryId;
  }
}

export function clearGuestId(): void {
  memoryId = null;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Tiny non-crypto fallback helpers (only used when crypto.randomUUID is missing).
function navUA(): string {
  try { return typeof navigator !== 'undefined' ? navigator.userAgent : ''; } catch { return ''; }
}
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
