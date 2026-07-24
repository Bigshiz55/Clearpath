"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string; hint: string }[] = [
  { href: "/", label: "Executive Briefing", hint: "Today's decisions" },
  { href: "/opportunities", label: "Opportunity Inbox", hint: "Ranked growth signals" },
  { href: "/campaigns", label: "Campaign Factory", hint: "Draft → review → approve" },
  { href: "/conversion", label: "Conversion Lab", hint: "Funnel & experiments" },
  { href: "/engineering", label: "Engineering Command", hint: "PRs, deploys, incidents" },
  { href: "/revenue", label: "Revenue Engine", hint: "MRR, LTV:CAC, cost/user" },
  { href: "/approvals", label: "Approval Center", hint: "Human-in-the-loop queue" },
  { href: "/integrations", label: "Integrations", hint: "Adapter health" },
  { href: "/audit", label: "Audit Log", hint: "Every automated action" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              active ? "bg-brand/15 text-ink ring-1 ring-brand/30" : "text-muted hover:bg-panel-2 hover:text-ink"
            }`}
          >
            <div className="font-medium">{item.label}</div>
            <div className="text-[11px] text-muted">{item.hint}</div>
          </Link>
        );
      })}
    </nav>
  );
}
