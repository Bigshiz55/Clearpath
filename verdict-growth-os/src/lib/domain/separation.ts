/**
 * Product separation guard — PURE. No I/O.
 *
 * WatchVerdict and ReadVerdict data must never bleed into each other. Any list
 * scoped to a product must contain only that product's rows (or explicitly
 * "shared" rows). This is enforced in tests and used defensively at read time.
 */
import type { ProductId } from "@/lib/types";

export interface HasProduct {
  product: ProductId | "shared";
}

/** Return only rows for `product` (plus shared rows if allowed). */
export function scopeToProduct<T extends HasProduct>(
  rows: T[],
  product: ProductId,
  includeShared = false,
): T[] {
  return rows.filter((r) => r.product === product || (includeShared && r.product === "shared"));
}

/** Throws if any row belongs to a different, non-shared product. */
export function assertNoCrossContamination<T extends HasProduct>(
  rows: T[],
  product: ProductId,
): void {
  const bad = rows.find((r) => r.product !== product && r.product !== "shared");
  if (bad) {
    throw new Error(
      `Product separation violated: found row for "${bad.product}" in a "${product}" scope.`,
    );
  }
}
