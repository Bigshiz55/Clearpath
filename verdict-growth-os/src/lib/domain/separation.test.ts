import { describe, expect, it } from "vitest";
import { assertNoCrossContamination, scopeToProduct } from "@/lib/domain/separation";

const rows = [
  { product: "watchverdict" as const, v: 1 },
  { product: "readverdict" as const, v: 2 },
  { product: "shared" as const, v: 3 },
];

describe("scopeToProduct", () => {
  it("returns only the product's rows by default", () => {
    expect(scopeToProduct(rows, "watchverdict").map((r) => r.v)).toEqual([1]);
  });
  it("includes shared rows when asked", () => {
    expect(scopeToProduct(rows, "watchverdict", true).map((r) => r.v).sort()).toEqual([1, 3]);
  });
  it("never leaks the other product", () => {
    expect(scopeToProduct(rows, "watchverdict", true).some((r) => r.product === "readverdict")).toBe(false);
  });
});

describe("assertNoCrossContamination", () => {
  it("passes for a clean single-product scope", () => {
    expect(() => assertNoCrossContamination([{ product: "watchverdict" as const }, { product: "shared" as const }], "watchverdict")).not.toThrow();
  });
  it("throws when a foreign product row is present", () => {
    expect(() => assertNoCrossContamination(rows, "watchverdict")).toThrow(/separation violated/i);
  });
});
