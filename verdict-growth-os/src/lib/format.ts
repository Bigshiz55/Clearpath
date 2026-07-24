/** Small presentation helpers shared by the UI. Pure. */

export function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export function pct(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function num(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function date(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function relDeadline(iso: string, now: string): string {
  const days = Math.round((Date.parse(iso) - Date.parse(now)) / 86_400_000);
  if (Number.isNaN(days)) return iso;
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return "due today";
  return `in ${days}d`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
