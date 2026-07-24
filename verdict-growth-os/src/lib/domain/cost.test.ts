import { describe, expect, it } from "vitest";
import { checkCostCeiling, shouldWarn, utilization } from "@/lib/domain/cost";

describe("checkCostCeiling", () => {
  it("allows a charge within the ceiling and reports remaining", () => {
    const d = checkCostCeiling({ spentUsd: 1, ceilingUsd: 5 }, 2);
    expect(d.allowed).toBe(true);
    expect(d.remainingUsd).toBe(2);
  });
  it("blocks a charge that would breach the ceiling", () => {
    const d = checkCostCeiling({ spentUsd: 4, ceilingUsd: 5 }, 2);
    expect(d.allowed).toBe(false);
  });
  it("blocks when already at or over the ceiling", () => {
    expect(checkCostCeiling({ spentUsd: 5, ceilingUsd: 5 }, 0.01).allowed).toBe(false);
    expect(checkCostCeiling({ spentUsd: 6, ceilingUsd: 5 }, 0).allowed).toBe(false);
  });
  it("rejects negative charges", () => {
    expect(checkCostCeiling({ spentUsd: 0, ceilingUsd: 5 }, -1).allowed).toBe(false);
  });
  it("allows a charge that exactly reaches the ceiling", () => {
    expect(checkCostCeiling({ spentUsd: 3, ceilingUsd: 5 }, 2).allowed).toBe(true);
  });
});

describe("utilization & shouldWarn", () => {
  it("computes fraction consumed", () => {
    expect(utilization({ spentUsd: 4, ceilingUsd: 5 })).toBe(0.8);
  });
  it("treats a zero ceiling as fully consumed", () => {
    expect(utilization({ spentUsd: 0, ceilingUsd: 0 })).toBe(1);
  });
  it("warns at or above the threshold", () => {
    expect(shouldWarn({ spentUsd: 4, ceilingUsd: 5 })).toBe(true);
    expect(shouldWarn({ spentUsd: 1, ceilingUsd: 5 })).toBe(false);
  });
});
