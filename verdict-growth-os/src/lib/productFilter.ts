import type { ProductId } from "@/lib/types";

/** Parse the `?p=` product filter from a Next.js searchParams object. */
export function readProductFilter(searchParams?: { p?: string | string[] }): ProductId | "all" {
  const raw = Array.isArray(searchParams?.p) ? searchParams?.p[0] : searchParams?.p;
  if (raw === "watchverdict" || raw === "readverdict") return raw;
  return "all";
}

/** Filter a list of product-scoped rows by the active filter (shared always shown). */
export function applyProductFilter<T extends { product: ProductId | "shared" }>(
  rows: T[],
  filter: ProductId | "all",
): T[] {
  if (filter === "all") return rows;
  return rows.filter((r) => r.product === filter || r.product === "shared");
}
