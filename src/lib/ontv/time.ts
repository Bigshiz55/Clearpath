/**
 * On TV time logic — PURE, timezone-aware, DST-safe. Durations use epoch math
 * (always correct across DST), and local-day/hour classification uses Intl with the
 * user's IANA timezone (which handles DST transitions). Schedule times are stored
 * as ISO UTC and only converted for display/classification — never mixed.
 */
import type { Airing, AiringStatus, ScheduleQuery } from './types';

export interface LocalParts { y: number; m: number; d: number; hour: number; minute: number; weekday: number; dayKey: string; minutesOfDay: number }

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
    partsCache.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Break an epoch ms into the user's local calendar parts (DST-correct). */
export function localParts(ms: number, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const part of fmt(tz).formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = part.value;
  const y = +p.year!, m = +p.month!, d = +p.day!, hour = +p.hour! % 24, minute = +p.minute!;
  return { y, m, d, hour, minute, weekday: WD[p.weekday!] ?? 0, dayKey: `${y}-${p.month}-${p.day}`, minutesOfDay: hour * 60 + minute };
}

/** Minutes until start (negative once started), minutes remaining, % elapsed. */
export function airingStatus(a: Pick<Airing, 'startAt' | 'endAt'>, now: number): AiringStatus {
  const start = Date.parse(a.startAt), end = Date.parse(a.endAt);
  const minutesUntilStart = Math.round((start - now) / 60000);
  const onNow = now >= start && now < end;
  const total = Math.max(1, end - start);
  const minutesRemaining = onNow ? Math.max(0, Math.round((end - now) / 60000)) : null;
  const percentElapsed = onNow ? Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100))) : null;
  let state: AiringStatus['state'];
  if (now >= end) state = 'ended';
  else if (onNow) state = 'on_now';
  else if (minutesUntilStart <= 30) state = 'starting_soon';
  else state = 'upcoming';
  return { state, minutesUntilStart, minutesRemaining, percentElapsed };
}

/** Does an airing fall in a date-scope window, in the user's timezone? */
export function inDateScope(a: Pick<Airing, 'startAt' | 'endAt'>, scope: ScheduleQuery['dateScope'], now: number, tz: string): boolean {
  const start = Date.parse(a.startAt), end = Date.parse(a.endAt);
  const nowP = localParts(now, tz);
  const startP = localParts(start, tz);
  switch (scope) {
    case 'now':
      return now >= start && now < end;
    case 'today':
      return startP.dayKey === nowP.dayKey && end >= now;
    case 'tonight': {
      // From now until 02:00 the next local morning, evening-weighted (≥17:00).
      const isTonightSlot = (startP.dayKey === nowP.dayKey && startP.hour >= 17) || (isNextDay(startP, nowP) && startP.hour < 2);
      return isTonightSlot && start >= now - 30 * 60000;
    }
    case 'late_night':
      return (startP.hour >= 23 || startP.hour < 5) && start >= now - 30 * 60000 && start <= now + 12 * 3_600_000;
    case 'tomorrow':
      return isNextDay(startP, nowP);
    case 'weekend':
      return (startP.weekday === 6 || startP.weekday === 0) && start >= now && start <= now + 8 * 24 * 3_600_000;
    default:
      return true;
  }
}

function isNextDay(p: LocalParts, ref: LocalParts): boolean {
  const a = Date.UTC(p.y, p.m - 1, p.d), b = Date.UTC(ref.y, ref.m - 1, ref.d);
  return a - b === 24 * 3_600_000;
}

/** Local "HH:MM" → minutes of day. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Locale-aware clock label (respects 12/24h) for a start time. */
export function clockLabel(iso: string, tz: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(Date.parse(iso)));
}

/** "Starts in 22 min" / "34 min left" / "On now" — canonical, localizable upstream. */
export function relativeLabel(status: AiringStatus): { key: string; minutes: number } {
  if (status.state === 'on_now') return { key: 'minutes_remaining', minutes: status.minutesRemaining ?? 0 };
  if (status.state === 'ended') return { key: 'ended', minutes: 0 };
  return { key: 'starts_in', minutes: Math.max(0, status.minutesUntilStart) };
}
