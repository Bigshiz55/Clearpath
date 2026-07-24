"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PRODUCT_LIST } from "@/lib/registry";

const OPTIONS = [{ id: "all", name: "All products" }, ...PRODUCT_LIST.map((p) => ({ id: p.id, name: p.name }))];

export function ProductSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("p") ?? "all";

  function select(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id === "all") next.delete("p");
    else next.set("p", id);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex rounded-lg border border-edge bg-panel-2 p-1">
      {OPTIONS.map((o) => {
        const active = current === o.id;
        const accent =
          o.id === "watchverdict" ? "text-watch" : o.id === "readverdict" ? "text-read" : "text-ink";
        return (
          <button
            key={o.id}
            onClick={() => select(o.id)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              active ? `bg-panel ${accent} ring-1 ring-edge` : "text-muted hover:text-ink"
            }`}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
