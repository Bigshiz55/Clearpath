/**
 * ONE SOURCE FOR "WHAT DAY IS THAT, FOR THIS VIEWER".
 *
 * Two defects this module exists to prevent, both of which shipped:
 *
 *  1. THE SERVER'S DAY IS NOT THE VIEWER'S DAY. The On TV header formatted its
 *     date on the server with `timeZone: 'UTC'`. At 6pm in California it is
 *     already tomorrow in UTC — so the page printed "Tuesday, Jul 29" directly
 *     above listings labelled "Today". A wall-clock date belongs to the
 *     browser, exactly like the clock in `clock.ts`.
 *
 *  2. ADDING 86,400,000ms IS NOT "TOMORROW". Every surface computed tomorrow as
 *     `now + 24h` and compared `toDateString()`. On a spring-forward day the
 *     local day is 23 hours long, so from 11pm that lands on the day AFTER
 *     tomorrow and "Tomorrow" silently stops being reachable; on fall-back the
 *     reverse. Calendar days are compared by their calendar fields, never by
 *     millisecond arithmetic.
 *
 * `Today` / `Tomorrow` / `Yesterday` / weekday all come from the SAME function
 * here, so a surface cannot disagree with itself about which day it is.
 *
 * Pure. `nowMs` comes in — no hidden clock, so the tests can sit on a DST
 * boundary and the callers can tick.
 */

/** The calendar-day distance from `now` to `then`, in the runtime's local zone.
 *  0 = same day, 1 = tomorrow, -1 = yesterday. DST-safe: compares the calendar
 *  fields (via UTC-normalised midnights), never a 24-hour offset. */
export function dayOffset(then: Date, now: Date): number {
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** True when the two instants fall on the same local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return dayOffset(a, b) === 0;
}

/**
 * "YYYY-MM-DD" for the viewer's own calendar day — the local-day counterpart
 * to `date.toISOString().slice(0, 10)`, which reads the UTC day instead. Only
 * meaningful when called in the browser; on the server this is the server's
 * zone, same caveat as the rest of this module.
 */
export function localIsoDate(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "Today" / "Tomorrow" / "Yesterday" / a weekday name, in the viewer's zone.
 *
 * `style: 'short'` gives "Mon" for anything further out; `'long'` gives
 * "Monday". Beyond a week either way, the date itself is clearer than a
 * weekday that could mean two different dates, so it prints one.
 */
export function dayLabel(iso: string | number | Date, nowMs: number, style: 'short' | 'long' = 'short'): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date(nowMs);
  const off = dayOffset(d, now);
  if (off === 0) return 'Today';
  if (off === 1) return 'Tomorrow';
  if (off === -1) return 'Yesterday';
  if (off > 1 && off < 7) return d.toLocaleDateString([], { weekday: style });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * The long header form — "Monday, Jul 28" — in the VIEWER's zone.
 *
 * Must be rendered in the browser (a client component with
 * `suppressHydrationWarning`), for the reason in the module note: a server
 * render freezes it in the server's zone, which is how the UTC/local
 * off-by-one reaches the screen.
 */
export function longDayLabel(iso: string | number | Date, nowMs: number): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = dayOffset(d, new Date(nowMs));
  const date = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  // "Today" and the date, together: the relative word answers "is this now?"
  // and the date answers "which day is that?" — printing only one of them is
  // what let the two disagree in the first place.
  if (off === 0) return `Today · ${date}`;
  if (off === 1) return `Tomorrow · ${date}`;
  return date;
}
