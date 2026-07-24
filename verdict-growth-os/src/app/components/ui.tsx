import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-edge bg-panel/70 backdrop-blur ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-edge px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="rounded-lg border border-edge bg-panel-2 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "brand" | "watch" | "read";
}) {
  const map: Record<string, string> = {
    neutral: "border-edge text-muted",
    good: "border-good/40 text-good",
    warn: "border-warn/40 text-warn",
    bad: "border-bad/40 text-bad",
    brand: "border-brand/40 text-brand",
    watch: "border-watch/40 text-watch",
    read: "border-read/40 text-read",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

/** Marks any seeded/demo record so it is never mistaken for real data. */
export function DemoBadge() {
  return <Badge tone="warn">DEMO</Badge>;
}

export function ProductTag({ product }: { product: "watchverdict" | "readverdict" | "shared" }) {
  if (product === "shared") return <Badge tone="brand">Shared</Badge>;
  const tone = product === "watchverdict" ? "watch" : "read";
  const label = product === "watchverdict" ? "WatchVerdict" : "ReadVerdict";
  return <Badge tone={tone}>{label}</Badge>;
}

export function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "good" | "warn" | "bad" }) {
  const w = Math.max(0, Math.min(100, value * 100));
  const bg = tone === "good" ? "bg-good" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-brand";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
      <div className={`h-full ${bg}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
